"""
Strip Management & Validation Router
Implements Section 2.2 Strip Validity Validation (Page 6)
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from backend.database import get_db
from backend.models import Strip, AuditLog
from backend.schemas import StripValidationRequest, StripValidationResponse
from backend.services.strip_validator import StripValidator

router = APIRouter(prefix="/api/strips", tags=["Strips"])

@router.post("/validate", response_model=StripValidationResponse)
def validate_strip(payload: StripValidationRequest, db: Session = Depends(get_db)):
    """
    Executes the 7-step strip validation before camera scanning:
    Checks: Strip Exists, Assigned to Worker, Active, Not Expired,
    Not Already Used, Correct Type, Batch & Calibration Valid.
    """
    valid, code, msg, details = StripValidator.validate_strip(db, payload.worker_id, payload.strip_id)
    return StripValidationResponse(
        valid=valid,
        reason_code=code,
        message=msg,
        strip_details=details
    )

@router.get("")
def list_strips(
    batch_id: Optional[str] = None,
    worker_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List strips in inventory."""
    q = db.query(Strip)
    if batch_id:
        q = q.filter(Strip.batch_id == batch_id)
    if worker_id:
        q = q.filter(Strip.assigned_worker_id == worker_id)
    if status:
        q = q.filter(Strip.status == status)
    
    strips = q.order_by(Strip.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "batch_id": s.batch_id,
            "assigned_worker_id": s.assigned_worker_id,
            "status": s.status,
            "expiration_date": s.expiration_date.strftime("%Y-%m-%d"),
            "use_count": s.use_count,
            "max_uses": s.max_uses,
            "strip_type": s.strip_type,
            "calibration_version": s.calibration_version,
            "created_at": s.created_at.isoformat()
        }
        for s in strips
    ]

@router.post("")
def create_strip(
    strip_id: str = Body(...),
    batch_id: str = Body(...),
    assigned_worker_id: Optional[str] = Body(None),
    days_valid: int = Body(90),
    db: Session = Depends(get_db)
):
    """Registers a new strip into inventory."""
    existing = db.query(Strip).filter(Strip.id == strip_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Strip ID already exists")

    exp = datetime.utcnow() + timedelta(days=days_valid)
    strip = Strip(
        id=strip_id,
        batch_id=batch_id,
        assigned_worker_id=assigned_worker_id,
        expiration_date=exp,
        status="ACTIVE"
    )
    db.add(strip)
    db.commit()
    db.refresh(strip)
    return {"message": "Strip registered successfully", "strip_id": strip.id}

@router.post("/{strip_id}/deactivate")
def deactivate_strip(strip_id: str, reason: str = Body("Safety deactivation", embed=True), db: Session = Depends(get_db)):
    """Deactivate or recall a strip."""
    strip = db.query(Strip).filter(Strip.id == strip_id).first()
    if not strip:
        raise HTTPException(status_code=404, detail="Strip not found")
    strip.status = "INACTIVE"
    
    audit = AuditLog(
        entity_type="STRIP",
        entity_id=strip_id,
        action="STRIP_DEACTIVATED",
        actor_id="SUPERVISOR",
        details=reason
    )
    db.add(audit)
    db.commit()
    return {"message": f"Strip {strip_id} deactivated."}
