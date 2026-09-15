"""
Strip Validity Validation Engine
Implements the full 7-step pre-scan validation checks from Section 2.2 (Page 6).
"""

from datetime import datetime
from typing import Tuple, Optional, Dict, Any
from sqlalchemy.orm import Session
from backend.models import Strip, AuditLog

class StripValidator:
    """Validates physical H2S indicator strips before allowing image capture or processing."""

    EXPECTED_STRIP_TYPE = "H2S_OPTICAL_V2"
    CURRENT_CALIBRATION_VERSION = "v2.0"

    @classmethod
    def validate_strip(cls, db: Session, worker_id: str, strip_id: str) -> Tuple[bool, Optional[str], str, Optional[Dict[str, Any]]]:
        """
        Runs 7 strict checks:
        1. Strip Exists -> STRIP_NOT_FOUND
        2. Assigned to Worker -> NOT_ASSIGNED
        3. Active Status -> INACTIVE
        4. Not Expired -> EXPIRED
        5. Not Already Used -> ALREADY_USED
        6. Correct Type -> WRONG_STRIP_TYPE
        7. Batch Valid & Calibration Current -> BATCH_INVALID / CALIBRATION_MISMATCH
        
        Returns: (is_valid, reason_code, message, strip_details)
        """
        strip = db.query(Strip).filter(Strip.id == strip_id).first()

        # Check 1: Strip Exists
        if not strip:
            cls._log_validation_failure(db, worker_id, strip_id, "STRIP_NOT_FOUND", "Strip ID not registered in database.")
            return False, "STRIP_NOT_FOUND", "Strip not found. Please verify Strip ID or request a registered strip.", None

        # Check 2: Assigned to Worker
        if strip.assigned_worker_id and strip.assigned_worker_id != worker_id:
            cls._log_validation_failure(db, worker_id, strip_id, "NOT_ASSIGNED", f"Strip assigned to {strip.assigned_worker_id}, not {worker_id}.")
            return False, "NOT_ASSIGNED", "Strip is not assigned to your worker profile.", None

        # Check 3: Active Status
        if strip.status == "INACTIVE":
            cls._log_validation_failure(db, worker_id, strip_id, "INACTIVE", "Strip has been deactivated by safety supervisor.")
            return False, "INACTIVE", "Strip has been deactivated. Please obtain a replacement.", None

        if strip.status == "RECALLED":
            cls._log_validation_failure(db, worker_id, strip_id, "BATCH_INVALID", "Strip batch recalled.")
            return False, "BATCH_INVALID", "Strip batch has been recalled by safety compliance.", None

        # Check 4: Not Expired
        now = datetime.utcnow()
        if strip.expiration_date and now > strip.expiration_date:
            cls._log_validation_failure(db, worker_id, strip_id, "EXPIRED", f"Expired on {strip.expiration_date.strftime('%Y-%m-%d')}.")
            return False, "EXPIRED", f"Strip expired on {strip.expiration_date.strftime('%Y-%m-%d')}. Please get a new strip.", None

        # Check 5: Not Already Used
        if strip.use_count >= strip.max_uses:
            cls._log_validation_failure(db, worker_id, strip_id, "ALREADY_USED", f"Use count {strip.use_count} >= max {strip.max_uses}.")
            return False, "ALREADY_USED", "Strip has already been used and cannot be rescanned.", None

        # Check 6: Correct Type
        if strip.strip_type != cls.EXPECTED_STRIP_TYPE:
            cls._log_validation_failure(db, worker_id, strip_id, "WRONG_STRIP_TYPE", f"Type {strip.strip_type} != {cls.EXPECTED_STRIP_TYPE}.")
            return False, "WRONG_STRIP_TYPE", "Incorrect strip version. Expected H2S optical sensing strip.", None

        # Check 7: Calibration Current
        if strip.calibration_version != cls.CURRENT_CALIBRATION_VERSION:
            cls._log_validation_failure(db, worker_id, strip_id, "CALIBRATION_MISMATCH", f"Calib {strip.calibration_version} != {cls.CURRENT_CALIBRATION_VERSION}.")
            return False, "CALIBRATION_MISMATCH", "Strip calibration version does not match active system profile.", None

        details = {
            "strip_id": strip.id,
            "batch_id": strip.batch_id,
            "assigned_worker_id": strip.assigned_worker_id,
            "expiration_date": strip.expiration_date.strftime("%Y-%m-%d"),
            "use_count": strip.use_count,
            "max_uses": strip.max_uses,
            "strip_type": strip.strip_type,
            "calibration_version": strip.calibration_version
        }

        return True, None, "Strip validation passed. Ready for camera scanning.", details

    @classmethod
    def _log_validation_failure(cls, db: Session, worker_id: str, strip_id: str, reason_code: str, details: str):
        """Records validation attempts for compliance audit trail as per Page 6."""
        try:
            audit = AuditLog(
                entity_type="STRIP",
                entity_id=strip_id,
                action="VALIDATION_FAILED",
                actor_id=worker_id,
                details=f"Reason: {reason_code} - {details}"
            )
            db.add(audit)
            db.commit()
        except Exception:
            db.rollback()
