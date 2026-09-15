"""
Supervisor Safety Center & Config Versioning / Undo Router
Implements Section 5.1 & Page 13:
- Configurable Safety Thresholds (Yellow, Orange, Red, Evacuation)
- Snapshot Versioning with 1-Click UNDO / REVERT
- Alert History and Acknowledgment
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from backend.database import get_db
from backend.models import SafetyConfigHistory, Alert, Worker, AuditLog
from backend.schemas import SafetyConfigUpdateRequest, SafetyConfigResponse
import config

router = APIRouter(prefix="/api/supervisor/safety", tags=["Supervisor Safety Center"])

@router.get("/config/current")
def get_current_thresholds(db: Session = Depends(get_db)):
    """Retrieve the currently active safety threshold configuration."""
    active = db.query(SafetyConfigHistory).filter(SafetyConfigHistory.is_active == True).first()
    if not active:
        # Fallback to default
        return {
            "id": 0,
            "version_tag": "DEFAULT_v1.0",
            "yellow_ppm": config.DEFAULT_SAFETY_THRESHOLDS["yellow_ppm"],
            "orange_ppm": config.DEFAULT_SAFETY_THRESHOLDS["orange_ppm"],
            "red_ppm": config.DEFAULT_SAFETY_THRESHOLDS["red_ppm"],
            "evac_ppm": config.DEFAULT_SAFETY_THRESHOLDS["evac_ppm"],
            "updated_by": "System Initialization",
            "reason": "Default safety parameters",
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }
    return {
        "id": active.id,
        "version_tag": active.version_tag,
        "yellow_ppm": active.yellow_ppm,
        "orange_ppm": active.orange_ppm,
        "red_ppm": active.red_ppm,
        "evac_ppm": active.evac_ppm,
        "updated_by": active.updated_by,
        "reason": active.reason,
        "is_active": active.is_active,
        "created_at": active.created_at.isoformat()
    }

@router.get("/config/history")
def get_threshold_history(db: Session = Depends(get_db)):
    """Lists all historical versions of safety thresholds for auditing and undo."""
    history = db.query(SafetyConfigHistory).order_by(SafetyConfigHistory.created_at.desc()).all()
    return [
        {
            "id": h.id,
            "version_tag": h.version_tag,
            "yellow_ppm": h.yellow_ppm,
            "orange_ppm": h.orange_ppm,
            "red_ppm": h.red_ppm,
            "evac_ppm": h.evac_ppm,
            "updated_by": h.updated_by,
            "reason": h.reason,
            "is_active": h.is_active,
            "created_at": h.created_at.isoformat()
        }
        for h in history
    ]

@router.post("/config", response_model=SafetyConfigResponse)
def update_thresholds(payload: SafetyConfigUpdateRequest, db: Session = Depends(get_db)):
    """
    Updates safety threshold parameters and generates a new version snapshot.
    Ensures complete undoability.
    """
    if not (payload.yellow_ppm < payload.orange_ppm < payload.red_ppm < payload.evac_ppm):
        raise HTTPException(
            status_code=400,
            detail="Thresholds must satisfy: Yellow < Orange < Red < Evacuation"
        )

    # Deactivate current active config
    db.query(SafetyConfigHistory).update({SafetyConfigHistory.is_active: False})

    version_tag = f"CFG_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    new_cfg = SafetyConfigHistory(
        version_tag=version_tag,
        yellow_ppm=payload.yellow_ppm,
        orange_ppm=payload.orange_ppm,
        red_ppm=payload.red_ppm,
        evac_ppm=payload.evac_ppm,
        updated_by=payload.updated_by,
        reason=payload.reason,
        is_active=True
    )
    db.add(new_cfg)

    audit = AuditLog(
        entity_type="SAFETY_CONFIG",
        entity_id=version_tag,
        action="CONFIG_UPDATED",
        actor_id=payload.updated_by,
        details=f"Updated thresholds: Yellow={payload.yellow_ppm}, Orange={payload.orange_ppm}, Red={payload.red_ppm}, Evac={payload.evac_ppm}. Reason: {payload.reason}"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_cfg)

    return SafetyConfigResponse(
        id=new_cfg.id,
        version_tag=new_cfg.version_tag,
        yellow_ppm=new_cfg.yellow_ppm,
        orange_ppm=new_cfg.orange_ppm,
        red_ppm=new_cfg.red_ppm,
        evac_ppm=new_cfg.evac_ppm,
        updated_by=new_cfg.updated_by,
        reason=new_cfg.reason,
        is_active=new_cfg.is_active,
        created_at=new_cfg.created_at.isoformat()
    )

@router.post("/config/rollback/{config_id}")
def rollback_thresholds(config_id: int, requested_by: str = Body("Supervisor", embed=True), db: Session = Depends(get_db)):
    """
    1-Click Safety Config UNDO / REVERT:
    Reverts current safety parameters back to a historical version snapshot.
    """
    target = db.query(SafetyConfigHistory).filter(SafetyConfigHistory.id == config_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Configuration version not found.")

    current = db.query(SafetyConfigHistory).filter(SafetyConfigHistory.is_active == True).first()
    curr_tag = current.version_tag if current else "None"

    db.query(SafetyConfigHistory).update({SafetyConfigHistory.is_active: False})
    target.is_active = True

    audit = AuditLog(
        entity_type="SAFETY_CONFIG",
        entity_id=target.version_tag,
        action="CONFIG_ROLLED_BACK",
        actor_id=requested_by,
        details=f"Threshold parameters reverted from {curr_tag} to {target.version_tag}"
    )
    db.add(audit)
    db.commit()

    return {
        "message": f"Successfully reverted safety configuration to {target.version_tag}!",
        "version_tag": target.version_tag,
        "yellow_ppm": target.yellow_ppm,
        "orange_ppm": target.orange_ppm,
        "red_ppm": target.red_ppm,
        "evac_ppm": target.evac_ppm
    }

@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, supervisor_id: str = Body("SUPERVISOR_01", embed=True), db: Session = Depends(get_db)):
    """Acknowledge active safety alert."""
    alert = db.query(Alert).filter(Alert.alert_id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by = supervisor_id
    alert.acknowledged_at = datetime.utcnow()
    db.commit()
    return {"message": f"Alert {alert_id} acknowledged."}
