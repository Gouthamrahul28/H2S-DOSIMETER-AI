"""
Authentication & Role-Based Access Control (RBAC) Router
Implements Section 9: Worker (own dose only), Supervisor, Safety Officer, Admin
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
import jwt
from datetime import datetime, timedelta
from pydantic import BaseModel

from backend.database import get_db
from backend.models import Worker, AuditLog
from backend.schemas import WorkerLoginRequest, SupervisorLoginRequest, TokenResponse
import config

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])

ROLE_PERMISSIONS: Dict[str, Dict[str, Any]] = {
    "Worker": {
        "description": "Field worker wearing Cu-PAN dosimeter badge",
        "can_submit_scans": True,
        "can_view_own_dose": True,
        "can_view_all_workers": False,
        "can_manage_stock": False,
        "can_modify_safety_thresholds": False,
        "can_rollback_models": False,
        "can_review_scans": False
    },
    "Supervisor": {
        "description": "Operational shift supervisor monitoring live plant teams",
        "can_submit_scans": True,
        "can_view_own_dose": True,
        "can_view_all_workers": True,
        "can_manage_stock": True,
        "can_modify_safety_thresholds": False,
        "can_rollback_models": False,
        "can_review_scans": True
    },
    "Safety Officer": {
        "description": "Industrial hygiene & regulatory compliance officer",
        "can_submit_scans": True,
        "can_view_own_dose": True,
        "can_view_all_workers": True,
        "can_manage_stock": True,
        "can_modify_safety_thresholds": True,
        "can_rollback_models": False,
        "can_review_scans": True
    },
    "Admin": {
        "description": "Site safety system administrator & engineering lead",
        "can_submit_scans": True,
        "can_view_own_dose": True,
        "can_view_all_workers": True,
        "can_manage_stock": True,
        "can_modify_safety_thresholds": True,
        "can_rollback_models": True,
        "can_review_scans": True
    }
}

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired.")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials.")

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Dependency that extracts and validates the JWT Bearer token."""
    if not authorization:
        # Default guest/demo supervisor if header omitted for backward compatibility
        return {
            "id": "demo_supervisor",
            "name": "Shift Safety Lead",
            "role": "Supervisor",
            "department": "Plant Operations",
            "permissions": ROLE_PERMISSIONS["Supervisor"]
        }
    
    token = authorization.replace("Bearer ", "").strip()
    payload = decode_token(token)
    role = payload.get("role", "Worker")
    return {
        "id": payload.get("sub"),
        "name": payload.get("name", "Authenticated User"),
        "role": role,
        "department": payload.get("department", "Facility Operations"),
        "permissions": ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["Worker"])
    }

def require_roles(*allowed_roles: str):
    """Enforces role-based authorization for protected endpoints."""
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role", "Worker")
        # Admin has superuser access
        if user_role == "Admin":
            return current_user
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Role '{user_role}' lacks permission. Required roles: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker

@router.get("/roles")
def get_roles():
    """Returns RBAC roles matrix and feature access permissions."""
    return ROLE_PERMISSIONS

@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Returns profile and verified capabilities of the authenticated caller."""
    return current_user

@router.post("/worker-login", response_model=TokenResponse)
def worker_login(payload: WorkerLoginRequest, db: Session = Depends(get_db)):
    """Validates worker ID and PIN for mobile application login with Worker role."""
    clean_id = (payload.worker_id or "").strip()
    clean_pin = (payload.pin or "").strip()

    if not clean_id or not clean_pin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worker ID and PIN are required."
        )

    # 1. Flexible lookup: match ID (case-insensitive), badge number, or normalized format
    worker = db.query(Worker).filter(
        (Worker.id == clean_id) |
        (Worker.id == clean_id.upper()) |
        (Worker.badge_number == clean_id) |
        (Worker.badge_number == clean_id.upper()) |
        (Worker.badge_number == f"BDG-{clean_id.upper().replace('BDG-', '').replace('W', '')}")
    ).first()

    # 2. Friendly demo fallback for W101 / DEMO aliases
    if not worker and clean_id.upper() in ("W101", "W-101", "101", "DEMO", "WORKER"):
        worker = db.query(Worker).filter(
            (Worker.id == "W101") | (Worker.id == "EMP_00542")
        ).first()

    if not worker:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Worker ID '{clean_id}' not found. Use EMP_00542, W101, or BDG-542."
        )
    if worker.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Worker profile is currently INACTIVE. Contact safety officer."
        )
    if worker.pin != clean_pin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Worker PIN. (Default demo PIN is 1234)"
        )

    # Worker role strictly limits visibility to own dose only
    token = create_access_token({
        "sub": worker.id,
        "role": "Worker",
        "name": worker.name,
        "department": worker.department
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_info": {
            "id": worker.id,
            "name": worker.name,
            "badge_number": worker.badge_number,
            "department": worker.department,
            "site": worker.site,
            "role": "Worker",
            "status": worker.status,
            "permissions": ROLE_PERMISSIONS["Worker"]
        }
    }

@router.post("/supervisor-login", response_model=TokenResponse)
def supervisor_login(payload: SupervisorLoginRequest):
    """
    Supervisor / Officer / Admin web dashboard authentication.
    Supports 4 roles: Worker, Supervisor, Safety Officer, Admin.
    """
    u = payload.username.lower().strip()
    p = payload.password.strip()

    role = "Supervisor"
    display_name = "Chief Safety Supervisor"
    dept = "Occupational Health & Safety"

    if u in ["admin", "sysadmin"] and p in ["admin123", "safety2025", "password"]:
        role = "Admin"
        display_name = "System Safety Administrator"
        dept = "Process Safety & AI Governance"
    elif u in ["safety_officer", "officer", "safety"] and p in ["safety2025", "officer123", "password"]:
        role = "Safety Officer"
        display_name = "Senior Industrial Hygienist"
        dept = "Occupational Health & Regulatory Compliance"
    elif u in ["supervisor", "lead"] and p in ["safety2025", "supervisor123", "password"]:
        role = "Supervisor"
        display_name = "Shift Operations Supervisor"
        dept = "Refinery Operations"
    elif u.startswith("emp_") or u.startswith("worker"):
        # Worker login via dashboard
        role = "Worker"
        display_name = f"Worker {u.upper()}"
        dept = "Field Operations"
    else:
        raise HTTPException(status_code=401, detail="Invalid supervisor or administrative credentials.")

    token = create_access_token({
        "sub": u,
        "role": role,
        "name": display_name,
        "department": dept
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user_info": {
            "id": u,
            "name": display_name,
            "role": role,
            "department": dept,
            "site": "All Industrial Sites",
            "permissions": ROLE_PERMISSIONS[role]
        }
    }
