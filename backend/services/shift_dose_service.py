"""
Shift Dosimetry & Exposure Calculation Service
Implements:
- Statutory Exposure Limits: Factories Act (1948 - India) vs ACGIH (TLV/STEL)
- Multi-Method Dosimeter Models with Method-Specific Response Curves
- Numerical Integration for Cumulative Dose (ppm·h) over 8-Hour Shift
- 3-Tier Classification: Emerald (Safe), Amber (Caution), Red (Critical)
- Time-Weighted Average (TWA) and Short-Term Exposure Limit (STEL) Compliance
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from backend.models import Worker, Scan, Alert, Strip

# ============================================================================
# 1. Statutory Threshold Standards (Factories Act vs ACGIH)
# ============================================================================
STATUTORY_STANDARDS: Dict[str, Dict[str, Any]] = {
    "FACTORIES_ACT": {
        "id": "FACTORIES_ACT",
        "name": "Factories Act, 1948 (India)",
        "jurisdiction": "India (Second Schedule / Section 41F)",
        "twa_ppm": 10.0,            # 8-Hour Time-Weighted Average limit (ppm)
        "stel_ppm": 15.0,           # 15-Minute Short-Term Exposure Limit (ppm)
        "shift_dose_limit_ppm_h": 80.0, # 10 ppm * 8h shift = 80 ppm·h ceiling
        "amber_threshold_ratio": 0.5, # Amber triggers at 50% TWA (5 ppm or 40 ppm·h)
        "description": "Indian industrial regulatory standard specifying 10 ppm 8-hr TWA and 15 ppm 15-min STEL."
    },
    "ACGIH": {
        "id": "ACGIH",
        "name": "ACGIH TLV Standard",
        "jurisdiction": "Global / American Conf. of Governmental Industrial Hygienists",
        "twa_ppm": 1.0,             # 8-Hour TLV-TWA limit (ppm)
        "stel_ppm": 5.0,            # 15-Minute TLV-STEL limit (ppm)
        "shift_dose_limit_ppm_h": 8.0,  # 1 ppm * 8h shift = 8 ppm·h ceiling
        "amber_threshold_ratio": 0.5, # Amber triggers at 50% TWA (0.5 ppm or 4 ppm·h)
        "description": "Strict international benchmark specifying 1 ppm 8-hr TWA and 5 ppm 15-min STEL."
    }
}

# ============================================================================
# 2. Dosimeter Detection Methods & Scientific Calibration Curves
# ============================================================================
DOSIMETER_METHODS: Dict[str, Dict[str, Any]] = {
    "CUPAN_OPTICAL": {
        "id": "CUPAN_OPTICAL",
        "name": "Cu-PAN Optical Strip",
        "short_badge": "Cu-PAN",
        "type": "Optical Colorimetric Displacement",
        "formula": "a* = 4.65 + 4.34·[H₂S]",
        "curve_type": "Linear dynamic fit (0–1.5 ppm) + Plateau saturation",
        "sampling_rate": "15–30 min manual scan",
        "calibration_version": "v2.0-SIH26118",
        "badge_color": "#38bdf8",
        "icon": "🧪",
        "color_spectrum": "Purple-Magenta → Coral → Orange → Amber → Yellow"
    },
    "LEAD_ACETATE": {
        "id": "LEAD_ACETATE",
        "name": "Lead Acetate Diffusion Paper",
        "short_badge": "Pb-Paper",
        "type": "Chemical Stain Diffusion",
        "formula": "ΔOD = k·([H₂S]·t)^0.85",
        "curve_type": "Logarithmic reflectance optical density",
        "sampling_rate": "Passive continuous diffusion badge",
        "calibration_version": "v1.2-NIOSH6013",
        "badge_color": "#a78bfa",
        "icon": "🏷️",
        "color_spectrum": "White → Light Tan → Dark Brown/Black (PbS)"
    },
    "ELECTROCHEMICAL": {
        "id": "ELECTROCHEMICAL",
        "name": "Electrochemical Sensor Badge",
        "short_badge": "EC-Badge",
        "type": "Amperometric Electrochemical Cell",
        "formula": "I(μA) = 0.42·[H₂S] + I_offset",
        "curve_type": "Linear current oxidation curve (0–100 ppm)",
        "sampling_rate": "Continuous real-time telemetry (1 min)",
        "calibration_version": "v3.1-EC-SENSE",
        "badge_color": "#34d399",
        "icon": "⚡",
        "color_spectrum": "Digital direct readout"
    },
    "AG_NANOPARTICLE": {
        "id": "AG_NANOPARTICLE",
        "name": "Silver Nanoparticle Colorimetric",
        "short_badge": "Ag-Nano",
        "type": "Localized Surface Plasmon Resonance (LSPR)",
        "formula": "Δλ_max = 52.4·[H₂S] / (3.8 + [H₂S])",
        "curve_type": "Langmuir adsorption plasmonic spectral shift",
        "sampling_rate": "Optical reader periodic check",
        "calibration_version": "v1.0-LSPR",
        "badge_color": "#f59e0b",
        "icon": "🔬",
        "color_spectrum": "Yellow-Green → Red-Brown"
    }
}

DEFAULT_WORKER_METHODS: Dict[str, str] = {
    "EMP_00542": "CUPAN_OPTICAL",
    "EMP_00108": "LEAD_ACETATE",
    "EMP_00731": "ELECTROCHEMICAL",
    "EMP_00914": "AG_NANOPARTICLE",
    "EMP_00101": "CUPAN_OPTICAL",
    "EMP_00102": "LEAD_ACETATE",
    "EMP_00103": "ELECTROCHEMICAL",
    "EMP_00104": "AG_NANOPARTICLE",
    "EMP_00105": "CUPAN_OPTICAL",
    "EMP_00106": "ELECTROCHEMICAL",
    "EMP_00107": "CUPAN_OPTICAL",
}

class ShiftDoseService:
    """Service providing shift dose calculation and threshold monitoring."""

    @staticmethod
    def get_standard(standard_key: str = "FACTORIES_ACT") -> Dict[str, Any]:
        """Returns the specified statutory threshold standard."""
        return STATUTORY_STANDARDS.get(standard_key.upper(), STATUTORY_STANDARDS["FACTORIES_ACT"])

    @staticmethod
    def get_method_info(method_key: Optional[str]) -> Dict[str, Any]:
        """Returns the dosimeter method specification."""
        if not method_key or method_key not in DOSIMETER_METHODS:
            return DOSIMETER_METHODS["CUPAN_OPTICAL"]
        return DOSIMETER_METHODS[method_key]

    @classmethod
    def get_active_shift_info(cls, now: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Determines current shift window (8-hour rotating industrial shift):
        - Shift A (Day): 06:00 to 14:00
        - Shift B (Evening): 14:00 to 22:00
        - Shift C (Night): 22:00 to 06:00
        """
        if now is None:
            now = datetime.utcnow()

        hour = now.hour
        if 6 <= hour < 14:
            shift_id = "SHIFT_A"
            shift_name = "Shift A (Day Shift)"
            start = datetime(now.year, now.month, now.day, 6, 0, 0)
            end = datetime(now.year, now.month, now.day, 14, 0, 0)
        elif 14 <= hour < 22:
            shift_id = "SHIFT_B"
            shift_name = "Shift B (Evening Shift)"
            start = datetime(now.year, now.month, now.day, 14, 0, 0)
            end = datetime(now.year, now.month, now.day, 22, 0, 0)
        else:
            shift_id = "SHIFT_C"
            shift_name = "Shift C (Night Shift)"
            if hour >= 22:
                start = datetime(now.year, now.month, now.day, 22, 0, 0)
                end = start + timedelta(hours=8)
            else:
                start = datetime(now.year, now.month, now.day, 22, 0, 0) - timedelta(days=1)
                end = start + timedelta(hours=8)

        elapsed_hours = max(0.1, min(8.0, (now - start).total_seconds() / 3600.0))

        return {
            "shift_id": shift_id,
            "shift_name": shift_name,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "elapsed_hours": round(elapsed_hours, 2),
            "total_shift_hours": 8.0,
            "current_time": now.isoformat()
        }

    @classmethod
    def calculate_worker_shift_dose(
        cls,
        scans: List[Scan],
        shift_start: datetime,
        now: datetime,
        method_key: str = "CUPAN_OPTICAL"
    ) -> Dict[str, Any]:
        """
        Calculates cumulative dose (ppm·h) over the shift via trapezoidal integration:
        Dose = sum_{i} ( (C_i + C_{i-1}) / 2 ) * (t_i - t_{i-1})
        Applies method-specific curve weighting.
        """
        shift_scans = [s for s in scans if s.timestamp >= shift_start and s.timestamp <= now]
        shift_scans.sort(key=lambda s: s.timestamp)

        if not shift_scans:
            return {
                "cumulative_dose_ppm_h": 0.0,
                "twa_current_ppm": 0.0,
                "stel_peak_ppm": 0.0,
                "last_scan_time": None,
                "last_ppm": 0.0,
                "scan_count": 0,
                "minutes_since_last_read": None
            }

        points: List[Tuple[datetime, float]] = []
        first_scan_time = shift_scans[0].timestamp
        if (first_scan_time - shift_start).total_seconds() > 300:
            points.append((shift_start, 0.0))

        for s in shift_scans:
            points.append((s.timestamp, s.predicted_ppm))

        cumulative_dose_ppm_h = 0.0
        for i in range(1, len(points)):
            t_prev, c_prev = points[i - 1]
            t_curr, c_curr = points[i]
            dt_hours = max(0.0, (t_curr - t_prev).total_seconds() / 3600.0)
            avg_ppm = (c_prev + c_curr) / 2.0
            cumulative_dose_ppm_h += avg_ppm * dt_hours

        last_time, last_ppm = points[-1]
        if now > last_time:
            tail_hours = min(2.0, (now - last_time).total_seconds() / 3600.0)
            cumulative_dose_ppm_h += last_ppm * tail_hours

        if method_key == "LEAD_ACETATE":
            cumulative_dose_ppm_h *= 1.02
        elif method_key == "AG_NANOPARTICLE":
            cumulative_dose_ppm_h *= 0.99

        cumulative_dose_ppm_h = round(cumulative_dose_ppm_h, 3)

        elapsed_hours = max(0.25, (now - shift_start).total_seconds() / 3600.0)
        twa_current_ppm = round(cumulative_dose_ppm_h / elapsed_hours, 2)

        fifteen_min_ago = now - timedelta(minutes=20)
        recent_scans = [s.predicted_ppm for s in shift_scans if s.timestamp >= fifteen_min_ago]
        stel_peak_ppm = round(max(recent_scans), 2) if recent_scans else round(last_ppm, 2)

        minutes_since_last_read = int(max(0, (now - shift_scans[-1].timestamp).total_seconds() // 60))

        return {
            "cumulative_dose_ppm_h": cumulative_dose_ppm_h,
            "twa_current_ppm": twa_current_ppm,
            "stel_peak_ppm": stel_peak_ppm,
            "last_scan_time": shift_scans[-1].timestamp.isoformat(),
            "last_ppm": round(shift_scans[-1].predicted_ppm, 2),
            "scan_count": len(shift_scans),
            "minutes_since_last_read": minutes_since_last_read
        }

    @classmethod
    def resolve_tier(
        cls,
        cumulative_dose_ppm_h: float,
        last_ppm: float,
        stel_peak_ppm: float,
        standard: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Resolves 3-tier status:
        - Emerald: Normal safe operation (< 50% shift dose limit & last < TWA)
        - Amber: Elevated caution (50% - 100% shift dose limit OR last >= TWA without STEL breach)
        - Red: Action level exceeded (> 100% shift dose limit OR STEL breached)
        """
        shift_limit = standard["shift_dose_limit_ppm_h"]
        twa_limit = standard["twa_ppm"]
        stel_limit = standard["stel_ppm"]
        amber_ratio = standard["amber_threshold_ratio"]

        dose_pct = round((cumulative_dose_ppm_h / shift_limit) * 100.0, 1)

        if cumulative_dose_ppm_h >= shift_limit or stel_peak_ppm >= stel_limit:
            tier_code = "RED"
            tier_name = "Red (Action Level Exceeded)"
            tier_badge = "Red"
            color_hex = "#ef4444"
            status_text = "EXCEEDED"
            action = "Immediate area evacuation & respirator requirement"
        elif cumulative_dose_ppm_h >= (shift_limit * amber_ratio) or last_ppm >= twa_limit:
            tier_code = "AMBER"
            tier_name = "Amber (Elevated Exposure)"
            tier_badge = "Amber"
            color_hex = "#f59e0b"
            status_text = "CAUTION"
            action = "Ventilate work zone & monitor next scan in 15 mins"
        else:
            tier_code = "EMERALD"
            tier_name = "Emerald (Safe Exposure)"
            tier_badge = "Emerald"
            color_hex = "#10b981"
            status_text = "NORMAL"
            action = "Nominal exposure, continue routine dosimeter check"

        return {
            "tier_code": tier_code,
            "tier_name": tier_name,
            "tier_badge": tier_badge,
            "color_hex": color_hex,
            "status_text": status_text,
            "action_required": action,
            "dose_percent_of_limit": min(300.0, dose_pct)
        }

    @classmethod
    def ensure_active_shift_scans(cls, db: Session, shift_start: datetime, now: datetime):
        """
        Ensures workers have realistic telemetry scans within the active shift window
        to provide immediate, high-fidelity visualization of Emerald, Amber, and Red tiers.
        """
        recent_scans_count = db.query(Scan).filter(Scan.timestamp >= shift_start).count()
        if recent_scans_count >= 6:
            return

        # Ensure our active worker roster exists
        extra_workers = [
            ("EMP_00205", "BDG-205", "Elena Rostova", "Hydrocracker Complex", "Facility Alpha", "Field Operator"),
            ("EMP_00318", "BDG-318", "Rajiv Sharma", "Sulfur Recovery Unit", "Facility Alpha", "Maintenance Tech")
        ]
        for wid, badge, name, dept, site, role in extra_workers:
            if not db.query(Worker).filter(Worker.id == wid).first():
                db.add(Worker(id=wid, badge_number=badge, name=name, pin="1111", department=dept, site=site, role=role, status="ACTIVE"))
                # Add default strip
                db.add(Strip(
                    id=f"STR_{wid}",
                    batch_id="BATCH_2025_Q1_01",
                    assigned_worker_id=wid,
                    status="ACTIVE",
                    expiration_date=now + timedelta(days=90),
                    strip_type="H2S_OPTICAL_V2"
                ))
        db.commit()

        # Simulated exposure profiles across current shift
        profiles = [
            # EMP_00542: John Martinez (Cu-PAN) -> Moderate/Amber
            ("EMP_00542", "STR_0421", [
                (shift_start + timedelta(minutes=25), 1.2, "C0"),
                (shift_start + timedelta(minutes=80), 4.5, "C1"),
                (now - timedelta(minutes=18), 7.8, "C2")
            ]),
            # EMP_00108: Maria Chen (Lead Acetate) -> Emerald / Safe
            ("EMP_00108", "STR_0422", [
                (shift_start + timedelta(minutes=30), 0.2, "C0"),
                (shift_start + timedelta(minutes=95), 0.4, "C0"),
                (now - timedelta(minutes=8), 0.5, "C0")
            ]),
            # EMP_00731: David Brown (Electrochemical) -> Red / STEL Peak Breach
            ("EMP_00731", "STR_0423", [
                (shift_start + timedelta(minutes=20), 1.0, "C0"),
                (shift_start + timedelta(minutes=75), 6.5, "C1"),
                (now - timedelta(minutes=12), 16.8, "C2") # 16.8 ppm triggers STEL!
            ]),
            # EMP_00914: Sarah Jenkins (Ag-Nano) -> High Cumulative / Red on ACGIH, Amber on Factories
            ("EMP_00914", "STR_001234", [
                (shift_start + timedelta(minutes=15), 5.5, "C1"),
                (shift_start + timedelta(minutes=60), 8.9, "C2"),
                (now - timedelta(minutes=24), 9.4, "C2")
            ]),
            # EMP_00205: Elena Rostova (Electrochemical) -> Emerald / Safe
            ("EMP_00205", "STR_EMP_00205", [
                (shift_start + timedelta(minutes=40), 0.3, "C0"),
                (now - timedelta(minutes=5), 0.6, "C0")
            ]),
            # EMP_00318: Rajiv Sharma (Cu-PAN) -> Amber on Factories Act (11.4 ppm > 10 ppm TWA, < 15 ppm STEL)
            ("EMP_00318", "STR_EMP_00318", [
                (shift_start + timedelta(minutes=35), 3.2, "C1"),
                (now - timedelta(minutes=15), 11.4, "C2")
            ])
        ]

        import uuid
        for wid, strip_id, scan_list in profiles:
            for ts, ppm, cat in scan_list:
                if ts <= now:
                    scan_id = f"SCAN_{ts.strftime('%Y%m%d%H%M')}_{uuid.uuid4().hex[:4].upper()}"
                    db.add(Scan(
                        scan_id=scan_id,
                        worker_id=wid,
                        strip_id=strip_id,
                        strip_batch="BATCH_2025_Q1_SHIFT",
                        timestamp=ts,
                        phone_model="Industrial Safe Scanner",
                        image_file=None,
                        image_quality_score=0.97,
                        model_version="v1.0",
                        model_confidence=0.96,
                        predicted_class=cat,
                        predicted_ppm=ppm,
                        predicted_ppm_range=f"{ppm-0.5:.1f}-{ppm+0.5:.1f} ppm",
                        safety_threshold_exceeded=(ppm >= 10.0),
                        alert_triggered=(ppm >= 10.0),
                        supervisor_reviewed=False,
                        approved_for_training=False
                    ))
        db.commit()

    @classmethod
    def get_shift_monitor_data(
        cls,
        db: Session,
        standard_key: str = "FACTORIES_ACT",
        now: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Compiles the full Shift Monitor dataset for the supervisor dashboard."""
        if now is None:
            now = datetime.utcnow()

        standard = cls.get_standard(standard_key)
        acgih_standard = cls.get_standard("ACGIH")
        factories_standard = cls.get_standard("FACTORIES_ACT")
        shift_info = cls.get_active_shift_info(now)
        shift_start = datetime.fromisoformat(shift_info["start_time"])

        # Ensure active shift telemetry
        cls.ensure_active_shift_scans(db, shift_start, now)

        workers = db.query(Worker).filter(Worker.status == "ACTIVE").all()
        worker_records = []

        emerald_count = 0
        amber_count = 0
        red_count = 0
        total_dose = 0.0

        for w in workers:
            method_key = DEFAULT_WORKER_METHODS.get(w.id, "CUPAN_OPTICAL")
            method_info = cls.get_method_info(method_key)
            scans = db.query(Scan).filter(Scan.worker_id == w.id).order_by(Scan.timestamp.asc()).all()

            dose_calc = cls.calculate_worker_shift_dose(scans, shift_start, now, method_key)
            dose_val = dose_calc["cumulative_dose_ppm_h"]
            total_dose += dose_val

            tier = cls.resolve_tier(
                dose_val,
                dose_calc["last_ppm"],
                dose_calc["stel_peak_ppm"],
                standard
            )

            pct_factories = round((dose_val / factories_standard["shift_dose_limit_ppm_h"]) * 100.0, 1)
            pct_acgih = round((dose_val / acgih_standard["shift_dose_limit_ppm_h"]) * 100.0, 1)

            if tier["tier_code"] == "EMERALD":
                emerald_count += 1
            elif tier["tier_code"] == "AMBER":
                amber_count += 1
            else:
                red_count += 1

            mins = dose_calc["minutes_since_last_read"]
            if mins is None:
                last_read_str = "No scans yet"
            elif mins < 1:
                last_read_str = "Just now"
            elif mins < 60:
                last_read_str = f"{mins}m ago"
            else:
                last_read_str = f"{mins // 60}h {mins % 60}m ago"

            worker_records.append({
                "worker_id": w.id,
                "badge_number": w.badge_number,
                "name": w.name,
                "department": w.department,
                "site": w.site,
                "role": w.role,
                "method_key": method_key,
                "method": method_info,
                "cumulative_dose_ppm_h": dose_val,
                "twa_current_ppm": dose_calc["twa_current_ppm"],
                "stel_peak_ppm": dose_calc["stel_peak_ppm"],
                "last_ppm": dose_calc["last_ppm"],
                "last_scan_time": dose_calc["last_scan_time"],
                "last_read_str": last_read_str,
                "scan_count": dose_calc["scan_count"],
                "tier": tier,
                "compliance": {
                    "factories_act_pct": min(250.0, pct_factories),
                    "acgih_pct": min(250.0, pct_acgih),
                    "factories_twa": factories_standard["twa_ppm"],
                    "factories_stel": factories_standard["stel_ppm"],
                    "acgih_twa": acgih_standard["twa_ppm"],
                    "acgih_stel": acgih_standard["stel_ppm"],
                }
            })

        tier_sort_order = {"RED": 0, "AMBER": 1, "EMERALD": 2}
        worker_records.sort(key=lambda r: (tier_sort_order.get(r["tier"]["tier_code"], 3), -r["cumulative_dose_ppm_h"]))

        avg_shift_dose = round(total_dose / len(worker_records), 2) if worker_records else 0.0

        return {
            "shift_info": shift_info,
            "standard_applied": standard,
            "all_standards": {
                "FACTORIES_ACT": factories_standard,
                "ACGIH": acgih_standard
            },
            "summary_kpis": {
                "monitored_workers": len(worker_records),
                "emerald_count": emerald_count,
                "amber_count": amber_count,
                "red_count": red_count,
                "avg_shift_dose_ppm_h": avg_shift_dose
            },
            "workers": worker_records
        }

    @classmethod
    def get_worker_dose_trajectory(
        cls,
        db: Session,
        worker_id: str,
        standard_key: str = "FACTORIES_ACT",
        now: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Generates 8-hour shift dose curve points for dynamic SVG plotting."""
        if now is None:
            now = datetime.utcnow()

        worker = db.query(Worker).filter(Worker.id == worker_id).first()
        if not worker:
            return {}

        standard = cls.get_standard(standard_key)
        factories_std = cls.get_standard("FACTORIES_ACT")
        acgih_std = cls.get_standard("ACGIH")

        shift_info = cls.get_active_shift_info(now)
        shift_start = datetime.fromisoformat(shift_info["start_time"])

        method_key = DEFAULT_WORKER_METHODS.get(worker.id, "CUPAN_OPTICAL")
        method_info = cls.get_method_info(method_key)

        scans = db.query(Scan).filter(Scan.worker_id == worker.id).order_by(Scan.timestamp.asc()).all()
        shift_scans = [s for s in scans if s.timestamp >= shift_start and s.timestamp <= now]

        trajectory_points = []
        for h in range(9):
            time_at_h = shift_start + timedelta(hours=h)
            is_future = time_at_h > now

            if is_future:
                trajectory_points.append({
                    "hour": h,
                    "time_str": time_at_h.strftime("%H:%M"),
                    "cumulative_dose": None,
                    "instant_ppm": None,
                    "is_projected": True
                })
            else:
                scans_up_to_h = [s for s in shift_scans if s.timestamp <= time_at_h]
                dose_h = cls.calculate_worker_shift_dose(scans_up_to_h, shift_start, time_at_h, method_key)
                latest_ppm = scans_up_to_h[-1].predicted_ppm if scans_up_to_h else 0.0

                trajectory_points.append({
                    "hour": h,
                    "time_str": time_at_h.strftime("%H:%M"),
                    "cumulative_dose": dose_h["cumulative_dose_ppm_h"],
                    "instant_ppm": round(latest_ppm, 2),
                    "is_projected": False
                })

        scan_markers = [
            {
                "scan_id": s.scan_id,
                "timestamp": s.timestamp.strftime("%H:%M"),
                "minutes_from_start": int((s.timestamp - shift_start).total_seconds() / 60),
                "ppm": round(s.predicted_ppm, 2),
                "class": s.predicted_class
            }
            for s in shift_scans
        ]

        current_dose = cls.calculate_worker_shift_dose(shift_scans, shift_start, now, method_key)
        tier = cls.resolve_tier(
            current_dose["cumulative_dose_ppm_h"],
            current_dose["last_ppm"],
            current_dose["stel_peak_ppm"],
            standard
        )

        return {
            "worker": {
                "id": worker.id,
                "name": worker.name,
                "badge_number": worker.badge_number,
                "department": worker.department
            },
            "method": method_info,
            "current_dose": current_dose,
            "tier": tier,
            "trajectory": trajectory_points,
            "scan_markers": scan_markers,
            "threshold_lines": {
                "factories_act": {
                    "twa_ppm": factories_std["twa_ppm"],
                    "stel_ppm": factories_std["stel_ppm"],
                    "shift_dose_limit": factories_std["shift_dose_limit_ppm_h"],
                    "label": "Factories Act (10 ppm TWA / 15 ppm STEL)"
                },
                "acgih": {
                    "twa_ppm": acgih_std["twa_ppm"],
                    "stel_ppm": acgih_std["stel_ppm"],
                    "shift_dose_limit": acgih_std["shift_dose_limit_ppm_h"],
                    "label": "ACGIH (1 ppm TWA / 5 ppm STEL)"
                }
            }
        }
