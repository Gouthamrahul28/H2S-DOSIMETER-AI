"""
Authentication Router
Worker PIN verification and Supervisor token authentication
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Worker
from backend.schemas import WorkerLoginRequest, SupervisorLoginRequest, TokenResponse
import jwt
from datetime import datetime, timedelta
import config

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)

@router.post("/worker-login", response_model=TokenResponse)
def worker_login(payload: WorkerLoginRequest, db: Session = Depends(get_db)):
    """Validates worker ID and PIN for mobile application login."""
    worker = db.query(Worker).filter(Worker.id == payload.worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Worker ID not found in facility database."
        )
    if worker.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Worker profile is currently INACTIVE. Contact safety officer."
        )
    if worker.pin != payload.pin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Worker PIN."
        )

    token = create_access_token({"sub": worker.id, "role": worker.role, "name": worker.name})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_info": {
            "id": worker.id,
            "name": worker.name,
            "badge_number": worker.badge_number,
            "department": worker.department,
            "site": worker.site,
            "role": worker.role,
            "status": worker.status
        }
    }

@router.post("/supervisor-login", response_model=TokenResponse)
def supervisor_login(payload: SupervisorLoginRequest):
    """Supervisor web dashboard authentication."""
    # Standard industrial credentials or supervisor role
    if payload.username.lower() in ["admin", "supervisor", "safety_officer"] and payload.password in ["safety2025", "admin123", "password"]:
        token = create_access_token({"sub": payload.username, "role": "Supervisor", "name": "Safety Lead"})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user_info": {
                "id": payload.username,
                "name": "Chief Safety Supervisor",
                "role": "Supervisor",
                "department": "Occupational Health & Safety",
                "site": "All Industrial Sites"
            }
        }
    raise HTTPException(status_code=401, detail="Invalid supervisor credentials.")
