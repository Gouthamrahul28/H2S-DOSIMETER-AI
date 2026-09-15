"""
Supervisor AI Model Center & Rollback Engine
Implements Section 5.1 & 6.2 (Pages 12, 21-22):
- Model Inventory & Version Registry
- Performance Metrics & Confusion Matrix
- Model Approval and 1-Click Rollback / Undo
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import json
from datetime import datetime
from backend.database import get_db
from backend.models import ModelRegistryRecord, AuditLog
from backend.schemas import ModelRollbackRequest
import config

router = APIRouter(prefix="/api/supervisor/ai", tags=["Supervisor AI Model Center"])

@router.get("/models")
def list_models(db: Session = Depends(get_db)):
    """List all registered AI model versions."""
    models = db.query(ModelRegistryRecord).order_by(ModelRegistryRecord.created_at.desc()).all()
    results = []
    for m in models:
        cm = json.loads(m.confusion_matrix_json) if m.confusion_matrix_json else []
        metrics = json.loads(m.metrics_json) if m.metrics_json else {}
        results.append({
            "version": m.version,
            "model_name": m.model_name,
            "architecture": m.architecture,
            "model_file": m.model_file,
            "test_accuracy": m.test_accuracy,
            "is_active": m.is_active,
            "approval_status": m.approval_status,
            "confusion_matrix": cm,
            "metrics": metrics,
            "deployed_at": m.deployed_at.isoformat() if m.deployed_at else None,
            "created_at": m.created_at.isoformat()
        })
    return results

@router.get("/active-model")
def get_active_model(db: Session = Depends(get_db)):
    """Retrieve details and confusion matrix of the currently deployed model."""
    m = db.query(ModelRegistryRecord).filter(ModelRegistryRecord.is_active == True).first()
    if not m:
        m = db.query(ModelRegistryRecord).first()
    if not m:
        raise HTTPException(status_code=404, detail="No models registered in system.")

    cm = json.loads(m.confusion_matrix_json) if m.confusion_matrix_json else []
    metrics = json.loads(m.metrics_json) if m.metrics_json else {}

    return {
        "version": m.version,
        "model_name": m.model_name,
        "architecture": m.architecture,
        "test_accuracy": m.test_accuracy,
        "is_active": m.is_active,
        "approval_status": m.approval_status,
        "confusion_matrix": cm,
        "classes": ["C0 (0-1 ppm)", "C1 (1-10 ppm)", "C2 (10-50 ppm)", "C3 (50-100 ppm)", "C4 (>100 ppm)"],
        "metrics": metrics,
        "deployed_at": m.deployed_at.isoformat() if m.deployed_at else None
    }

@router.post("/rollback")
def rollback_model(payload: ModelRollbackRequest, db: Session = Depends(get_db)):
    """
    1-Click Model Rollback / Undo:
    Reverts production AI model to an earlier approved model version.
    """
    target = db.query(ModelRegistryRecord).filter(ModelRegistryRecord.version == payload.target_version).first()
    if not target:
        raise HTTPException(status_code=404, detail=f"Target model version '{payload.target_version}' not found.")

    current_active = db.query(ModelRegistryRecord).filter(ModelRegistryRecord.is_active == True).first()
    old_version = current_active.version if current_active else "None"

    # Deactivate current active models
    db.query(ModelRegistryRecord).update({ModelRegistryRecord.is_active: False})

    # Activate target
    target.is_active = True
    target.approval_status = "Approved (Active)"
    target.deployed_at = datetime.utcnow()

    # Log to immutable audit trail
    audit = AuditLog(
        entity_type="MODEL",
        entity_id=target.version,
        action="MODEL_ROLLED_BACK",
        actor_id=payload.requested_by,
        details=f"Rollback from {old_version} to {target.version}. Reason: {payload.reason}"
    )
    db.add(audit)
    db.commit()

    # Update config runtime default
    config.DEFAULT_MODEL_VERSION = target.version

    return {
        "message": f"Successfully rolled back active AI model from {old_version} to {target.version}.",
        "active_version": target.version,
        "accuracy": target.test_accuracy,
        "status": target.approval_status
    }

@router.post("/approve/{version}")
def approve_model(version: str, requested_by: str = Body("Supervisor", embed=True), db: Session = Depends(get_db)):
    """Approves and promotes a candidate model version to active production."""
    target = db.query(ModelRegistryRecord).filter(ModelRegistryRecord.version == version).first()
    if not target:
        raise HTTPException(status_code=404, detail=f"Model version '{version}' not found.")

    db.query(ModelRegistryRecord).update({ModelRegistryRecord.is_active: False})
    target.is_active = True
    target.approval_status = "Approved (Active)"
    target.deployed_at = datetime.utcnow()

    audit = AuditLog(
        entity_type="MODEL",
        entity_id=target.version,
        action="MODEL_PROMOTED",
        actor_id=requested_by,
        details=f"Model {version} approved and set to Active production."
    )
    db.add(audit)
    db.commit()

    config.DEFAULT_MODEL_VERSION = target.version
    return {"message": f"Model {version} approved and deployed to production.", "active_version": version}
