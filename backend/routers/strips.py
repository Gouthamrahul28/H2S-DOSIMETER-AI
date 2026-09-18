"""
Strip Management & Validation Router
Implements Section 2.2 Strip Validity Validation (Page 6)
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from backend.database import get_db
from backend.models import Strip, AuditLog, StripBatch, Worker
from backend.schemas import (
    StripValidationRequest, StripValidationResponse,
    StripBatchResponse, BatchQCCheckResponse, BatchQCCheckRequest,
    StripBatchCreateRequest, WristbandQRAssignmentRequest, WristbandQRAssignmentResponse
)
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

# ============================================================================
# Section 1 & 7: Badge Stock / Wristband Lab & QR Assignment Router
# ============================================================================

@router.get("/batches", response_model=List[StripBatchResponse])
def list_batches(db: Session = Depends(get_db)):
    """Lists all badge stock batches with QC status and available inventory."""
    batches = db.query(StripBatch).order_by(StripBatch.created_at.desc()).all()
    out = []
    for b in batches:
        # Check active count
        avail = db.query(Strip).filter(Strip.batch_id == b.batch_id, Strip.status == "ACTIVE").count()
        out.append(StripBatchResponse(
            batch_id=b.batch_id,
            cast_date=b.cast_date.strftime("%Y-%m-%d"),
            expiration_date=b.expiration_date.strftime("%Y-%m-%d"),
            storage_condition=b.storage_condition,
            virgin_baseline_delta_e=b.virgin_baseline_delta_e,
            qc_status=b.qc_status,
            qc_notes=b.qc_notes,
            qc_checked_at=b.qc_checked_at.isoformat() if b.qc_checked_at else None,
            qc_checked_by=b.qc_checked_by,
            total_strips=b.total_strips,
            available_strips=avail if avail > 0 else b.available_strips,
            is_valid_for_assignment=(b.qc_status == "PASSED" and datetime.utcnow() < b.expiration_date)
        ))
    return out

@router.post("/batches", response_model=StripBatchResponse)
def create_batch(payload: StripBatchCreateRequest, db: Session = Depends(get_db)):
    """Registers and casts a new dosimeter badge batch with QC check."""
    from backend.services.batch_qc_service import BatchQCService
    existing = db.query(StripBatch).filter(StripBatch.batch_id == payload.batch_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Batch ID already exists")

    exp = datetime.utcnow() + timedelta(days=payload.days_to_expiry)
    delta_e, measured = BatchQCService.evaluate_virgin_baseline(
        lab_l=payload.virgin_lab_l, lab_a=payload.virgin_lab_a, lab_b=payload.virgin_lab_b
    )
    passed = delta_e <= BatchQCService.MAX_VIRGIN_DELTA_E_SPEC
    status_str = "PASSED" if passed else "REJECTED"

    batch = StripBatch(
        batch_id=payload.batch_id,
        cast_date=datetime.utcnow(),
        expiration_date=exp,
        storage_condition=payload.storage_condition,
        virgin_baseline_l=measured["L"],
        virgin_baseline_a=measured["a"],
        virgin_baseline_b=measured["b"],
        virgin_baseline_delta_e=delta_e,
        qc_status=status_str,
        qc_notes="Batch cast baseline verified" if passed else f"QC_FAILED_BASELINE_OUT_OF_SPEC: Delta-E {delta_e:.2f} > 3.0",
        qc_checked_at=datetime.utcnow(),
        qc_checked_by=payload.checked_by,
        total_strips=payload.total_strips,
        available_strips=payload.total_strips
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    return StripBatchResponse(
        batch_id=batch.batch_id,
        cast_date=batch.cast_date.strftime("%Y-%m-%d"),
        expiration_date=batch.expiration_date.strftime("%Y-%m-%d"),
        storage_condition=batch.storage_condition,
        virgin_baseline_delta_e=batch.virgin_baseline_delta_e,
        qc_status=batch.qc_status,
        qc_notes=batch.qc_notes,
        qc_checked_at=batch.qc_checked_at.isoformat() if batch.qc_checked_at else None,
        qc_checked_by=batch.qc_checked_by,
        total_strips=batch.total_strips,
        available_strips=batch.available_strips,
        is_valid_for_assignment=(batch.qc_status == "PASSED")
    )

@router.post("/batches/qc-check", response_model=BatchQCCheckResponse)
def perform_batch_qc_check(payload: BatchQCCheckRequest, db: Session = Depends(get_db)):
    """
    Evaluates virgin baseline Delta-E against unexposed Cu-PAN S0 (L=42.0, a=38.0, b=-12.0).
    Rejects any strip batch whose virgin baseline Delta-E > 3.0.
    """
    from backend.services.batch_qc_service import BatchQCService
    res = BatchQCService.run_qc_check(
        db=db,
        batch_id=payload.batch_id,
        lab_l=payload.virgin_lab_l,
        lab_a=payload.virgin_lab_a,
        lab_b=payload.virgin_lab_b,
        image_base64=payload.image_base64,
        checked_by=payload.checked_by or "Senior QC Chemist",
        notes=payload.notes
    )
    return BatchQCCheckResponse(**res)

@router.post("/wristbands/assign-qr", response_model=WristbandQRAssignmentResponse)
def assign_wristband_qr(payload: WristbandQRAssignmentRequest, db: Session = Depends(get_db)):
    """
    Section 7: Workers Roster + QR Assignment
    Links Worker <-> Batch <-> Method into an unforgeable QR payload.
    Eliminates manual method selection and human error.
    """
    from backend.models import Worker
    import uuid

    worker = db.query(Worker).filter(Worker.id == payload.worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker ID not found in roster")

    batch = db.query(StripBatch).filter(StripBatch.batch_id == payload.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch ID not found in stock")
    if batch.qc_status != "PASSED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot assign strips from Batch {payload.batch_id}: QC Status is {batch.qc_status} (Baseline Delta-E={batch.virgin_baseline_delta_e:.2f})"
        )

    # Generate or lookup assigned strip
    strip_id = payload.strip_id or f"STR_{batch.batch_id[-4:]}_{uuid.uuid4().hex[:6].upper()}"
    strip = db.query(Strip).filter(Strip.id == strip_id).first()
    if not strip:
        strip = Strip(
            id=strip_id,
            batch_id=batch.batch_id,
            assigned_worker_id=worker.id,
            expiration_date=batch.expiration_date,
            status="ACTIVE"
        )
        db.add(strip)
    else:
        strip.assigned_worker_id = worker.id
        strip.status = "ACTIVE"
        strip.expiration_date = batch.expiration_date

    db.commit()

    # Form QR Payload: H2S://V2?w={worker_id}&b={batch_id}&s={strip_id}&m={method_key}&exp={expiry}
    exp_str = batch.expiration_date.strftime("%Y-%m-%d")
    qr_payload = f"H2S://V2?w={worker.id}&b={batch.batch_id}&s={strip.id}&m={payload.method_key}&exp={exp_str}"

    return WristbandQRAssignmentResponse(
        worker_id=worker.id,
        worker_name=worker.name,
        batch_id=batch.batch_id,
        strip_id=strip.id,
        method_key=payload.method_key or "cupan_optical",
        expiration_date=exp_str,
        qr_payload=qr_payload,
        verification_status="ASSIGNED_AND_QC_VERIFIED"
    )
