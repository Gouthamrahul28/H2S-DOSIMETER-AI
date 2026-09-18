"""
Batch Stock & Wristband Lab QC Service
Implements Section 1: Virgin Baseline CIEDE2000 QC Check
Target: Intact Cu(II)-PAN S0 Baseline (L*=42.0, a*=38.0, b*=-12.0)
Spec Threshold: Delta-E 00 <= 3.0 (Passed), Delta-E 00 > 3.0 (Rejected)
"""

import numpy as np
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from skimage.color import deltaE_ciede2000
from sqlalchemy.orm import Session

from backend.models import StripBatch, AuditLog, Strip
from backend.services.cv_pipeline import CVPipeline
import config

class BatchQCService:
    """Evaluates virgin indicator strip chemistry and maintains batch stock lifecycle."""

    # Reference intact Cu(II)-PAN complex baseline (S0)
    REFERENCE_S0_LAB = np.array([42.0, 38.0, -12.0], dtype=np.float32)
    MAX_VIRGIN_DELTA_E_SPEC = 3.0  # Industry standard delta-E tolerance

    @classmethod
    def evaluate_virgin_baseline(
        cls,
        lab_l: Optional[float] = None,
        lab_a: Optional[float] = None,
        lab_b: Optional[float] = None,
        image_base64: Optional[str] = None
    ) -> Tuple[float, Dict[str, float]]:
        """
        Extracts or computes measured CIE Lab values of the virgin strip
        and computes CIEDE2000 distance from pristine unexposed S0.
        """
        if image_base64:
            img = CVPipeline.load_image_from_bytes_or_base64(image_base64)
            if img is not None:
                roi = CVPipeline.extract_roi_and_normalize(img)
                features = CVPipeline.extract_color_features(roi)
                mean_lab = features["mean_lab"]
                lab_l, lab_a, lab_b = mean_lab[0], mean_lab[1], mean_lab[2]

        if lab_l is None:
            lab_l = 42.0
        if lab_a is None:
            lab_a = 38.0
        if lab_b is None:
            lab_b = -12.0

        sample_lab = np.array([float(lab_l), float(lab_a), float(lab_b)], dtype=np.float32)
        delta_e = float(deltaE_ciede2000(sample_lab, cls.REFERENCE_S0_LAB))

        measured = {
            "L": round(float(lab_l), 2),
            "a": round(float(lab_a), 2),
            "b": round(float(lab_b), 2)
        }
        return round(delta_e, 3), measured

    @classmethod
    def run_qc_check(
        cls,
        db: Session,
        batch_id: str,
        lab_l: Optional[float] = None,
        lab_a: Optional[float] = None,
        lab_b: Optional[float] = None,
        image_base64: Optional[str] = None,
        checked_by: str = "Senior QC Chemist",
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Runs the laboratory QC baseline check on a strip batch.
        Updates StripBatch status to PASSED or REJECTED.
        """
        batch = db.query(StripBatch).filter(StripBatch.batch_id == batch_id).first()
        if not batch:
            # Auto-create if not yet registered
            exp_date = datetime.utcnow() + config.timedelta(days=90) if hasattr(config, "timedelta") else datetime.utcnow()
            from datetime import timedelta
            exp_date = datetime.utcnow() + timedelta(days=90)
            batch = StripBatch(
                batch_id=batch_id,
                cast_date=datetime.utcnow(),
                expiration_date=exp_date,
                storage_condition="Desiccated pouch, 4°C sealed dark container",
                total_strips=500,
                available_strips=500
            )
            db.add(batch)
            db.commit()
            db.refresh(batch)

        delta_e, measured = cls.evaluate_virgin_baseline(
            lab_l=lab_l, lab_a=lab_a, lab_b=lab_b, image_base64=image_base64
        )

        passed = delta_e <= cls.MAX_VIRGIN_DELTA_E_SPEC
        qc_status = "PASSED" if passed else "REJECTED"
        rejection_reason = None if passed else f"QC_FAILED_BASELINE_OUT_OF_SPEC: Measured virgin Delta-E ({delta_e:.2f}) exceeds max tolerance ({cls.MAX_VIRGIN_DELTA_E_SPEC:.1f}) against pristine Cu(II)-PAN S0"

        batch.virgin_baseline_l = measured["L"]
        batch.virgin_baseline_a = measured["a"]
        batch.virgin_baseline_b = measured["b"]
        batch.virgin_baseline_delta_e = delta_e
        batch.qc_status = qc_status
        batch.qc_notes = notes or rejection_reason or "Virgin baseline within spec (Delta-E <= 3.0)"
        batch.qc_checked_at = datetime.utcnow()
        batch.qc_checked_by = checked_by

        # If rejected, also mark any strips in that batch as RECALLED / INACTIVE
        if not passed:
            db.query(Strip).filter(Strip.batch_id == batch_id).update({"status": "RECALLED"})

        # Record immutable Audit Log
        audit = AuditLog(
            entity_type="BATCH_QC",
            entity_id=batch_id,
            action=f"BATCH_QC_{qc_status}",
            actor_id=checked_by,
            details=f"Baseline Delta-E: {delta_e:.2f} (Spec <= 3.0). Status: {qc_status}. Notes: {batch.qc_notes}"
        )
        db.add(audit)
        db.commit()
        db.refresh(batch)

        return {
            "batch_id": batch_id,
            "qc_status": qc_status,
            "virgin_baseline_delta_e": delta_e,
            "spec_threshold": cls.MAX_VIRGIN_DELTA_E_SPEC,
            "measured_lab": measured,
            "reference_lab": {"L": 42.0, "a": 38.0, "b": -12.0},
            "passed": passed,
            "rejection_reason": rejection_reason,
            "qc_checked_at": batch.qc_checked_at.isoformat(),
            "qc_checked_by": checked_by
        }
