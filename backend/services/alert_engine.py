"""
Safety Rule & Alert Generation Engine
Implements Section 3.1 & Page 13 Configurable Thresholds:
- Yellow Alert (Caution): PPM >= yellow_threshold (default 5 ppm)
- Orange Alert (Moderate): PPM >= orange_threshold (default 15 ppm)
- Red Alert (High Hazard): PPM >= red_threshold (default 50 ppm)
- Evacuation Alert: PPM > evac_threshold (default 100 ppm) -> Immediate Evacuation
"""

from typing import Tuple, Optional, Dict, Any
from datetime import datetime
import uuid
from sqlalchemy.orm import Session
from backend.models import Alert, SafetyConfigHistory
import config

class AlertEngine:
    """Evaluates scan PPM against active safety thresholds and creates alert records."""

    @classmethod
    def get_active_thresholds(cls, db: Session) -> Dict[str, float]:
        """Retrieves the active threshold configuration from the database, or defaults."""
        active_cfg = db.query(SafetyConfigHistory).filter(SafetyConfigHistory.is_active == True).first()
        if active_cfg:
            return {
                "yellow_ppm": active_cfg.yellow_ppm,
                "orange_ppm": active_cfg.orange_ppm,
                "red_ppm": active_cfg.red_ppm,
                "evac_ppm": active_cfg.evac_ppm,
                "version_tag": active_cfg.version_tag
            }
        return {
            "yellow_ppm": config.DEFAULT_SAFETY_THRESHOLDS["yellow_ppm"],
            "orange_ppm": config.DEFAULT_SAFETY_THRESHOLDS["orange_ppm"],
            "red_ppm": config.DEFAULT_SAFETY_THRESHOLDS["red_ppm"],
            "evac_ppm": config.DEFAULT_SAFETY_THRESHOLDS["evac_ppm"],
            "version_tag": "DEFAULT_v1.0"
        }

    @classmethod
    def evaluate_and_create_alert(
        cls, db: Session, scan_id: str, worker_id: str, ppm: float
    ) -> Tuple[bool, bool, Optional[str], Optional[str]]:
        """
        Evaluates PPM against thresholds.
        Returns: (safety_threshold_exceeded, alert_triggered, alert_level, message)
        """
        thresholds = cls.get_active_thresholds(db)

        alert_level = None
        message = None
        triggered = False
        exceeded = False

        if ppm >= thresholds["evac_ppm"]:
            exceeded = True
            triggered = True
            alert_level = "Red + Alarm"
            message = f"CRITICAL H2S ALERT ({ppm} ppm)! Immediate evacuation required. Proceed to upwind emergency muster point!"
        elif ppm >= thresholds["red_ppm"]:
            exceeded = True
            triggered = True
            alert_level = "Red"
            message = f"High H2S Hazard ({ppm} ppm). Leave work area immediately and notify area supervisor."
        elif ppm >= thresholds["orange_ppm"]:
            exceeded = True
            triggered = True
            alert_level = "Orange"
            message = f"Moderate H2S Exposure ({ppm} ppm). Enhance mechanical ventilation and monitor sensor reading."
        elif ppm >= thresholds["yellow_ppm"]:
            exceeded = True
            triggered = True
            alert_level = "Yellow"
            message = f"Caution Zone ({ppm} ppm). H2S detected above baseline. Monitor strip closely."

        if triggered and alert_level:
            alert = Alert(
                alert_id=f"ALT_{datetime.utcnow().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6].upper()}",
                scan_id=scan_id,
                worker_id=worker_id,
                alert_level=alert_level,
                ppm_value=ppm,
                message=message,
                status="ACTIVE"
            )
            db.add(alert)
            db.commit()

        return exceeded, triggered, alert_level, message
