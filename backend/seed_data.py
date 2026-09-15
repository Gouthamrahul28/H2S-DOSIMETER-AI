"""
Database & System Seeder
Populates realistic initial workers, strips, historical scans, alerts,
safety configuration history, and model registry versions matching the Master Plan.
"""

import json
from datetime import datetime, timedelta
from backend.database import SessionLocal, engine, Base
from backend.models import (
    Worker, Strip, Scan, Alert, SafetyConfigHistory, ModelRegistryRecord, AuditLog
)
import config

def seed_all():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # Check if already seeded
        if db.query(Worker).count() > 0:
            print("Database already contains records. Skipping seed.")
            return

        print("Seeding H2S Industrial Safety Platform data...")

        # 1. Seed Workers
        workers = [
            Worker(
                id="EMP_00542",
                badge_number="BDG-542",
                name="John Martinez",
                pin="1234",
                department="Refinery Operations",
                site="Industrial Facility A",
                role="Field Operator",
                status="ACTIVE"
            ),
            Worker(
                id="EMP_00108",
                badge_number="BDG-108",
                name="Maria Chen",
                pin="2244",
                department="Catalytic Cracking Unit",
                site="Industrial Facility A",
                role="Field Operator",
                status="ACTIVE"
            ),
            Worker(
                id="EMP_00731",
                badge_number="BDG-731",
                name="David Brown",
                pin="9988",
                department="Gas Sweetening Unit",
                site="Industrial Facility B",
                role="Senior Operator",
                status="ACTIVE"
            ),
            Worker(
                id="EMP_00914",
                badge_number="BDG-914",
                name="Sarah Jenkins",
                pin="5566",
                department="Tank Farm Logistics",
                site="Industrial Facility A",
                role="Field Operator",
                status="ACTIVE"
            )
        ]
        for w in workers:
            db.add(w)
        db.commit()

        # 2. Seed Strips (including test edge-cases)
        now = datetime.utcnow()
        strips = [
            Strip(
                id="STR_001234",
                batch_id="BATCH_2024_Q4_05",
                assigned_worker_id="EMP_00542",
                status="ACTIVE",
                expiration_date=now + timedelta(days=120),
                use_count=0,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            ),
            Strip(
                id="STR_0421",
                batch_id="BATCH_2024_Q4_LOT_03",
                assigned_worker_id="EMP_00542",
                status="ACTIVE",
                expiration_date=now + timedelta(days=90),
                use_count=0,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            ),
            Strip(
                id="STR_0422",
                batch_id="BATCH_2024_Q4_LOT_03",
                assigned_worker_id="EMP_00108",
                status="ACTIVE",
                expiration_date=now + timedelta(days=90),
                use_count=0,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            ),
            Strip(
                id="STR_0423",
                batch_id="BATCH_2024_Q4_LOT_03",
                assigned_worker_id="EMP_00731",
                status="ACTIVE",
                expiration_date=now + timedelta(days=90),
                use_count=0,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            ),
            # Test strip: Expired
            Strip(
                id="STR_EXPIRED",
                batch_id="BATCH_2023_Q2_OLD",
                assigned_worker_id="EMP_00542",
                status="ACTIVE",
                expiration_date=now - timedelta(days=30),
                use_count=0,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            ),
            # Test strip: Already used
            Strip(
                id="STR_USED",
                batch_id="BATCH_2024_Q4_LOT_03",
                assigned_worker_id="EMP_00542",
                status="USED",
                expiration_date=now + timedelta(days=90),
                use_count=1,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            ),
            # Test strip: Inactive
            Strip(
                id="STR_INACTIVE",
                batch_id="BATCH_2024_Q4_LOT_03",
                assigned_worker_id="EMP_00542",
                status="INACTIVE",
                expiration_date=now + timedelta(days=90),
                use_count=0,
                max_uses=1,
                strip_type="H2S_OPTICAL_V2",
                calibration_version="v2.0"
            )
        ]
        for s in strips:
            db.add(s)
        db.commit()

        # 3. Seed Safety Configuration History (for 1-click UNDO demonstration)
        cfg_v1 = SafetyConfigHistory(
            version_tag="CFG_20250101_BASELINE",
            yellow_ppm=6.0,
            orange_ppm=18.0,
            red_ppm=55.0,
            evac_ppm=110.0,
            updated_by="Initial Setup Engineer",
            reason="Baseline factory thresholds",
            is_active=False,
            created_at=now - timedelta(days=14)
        )
        cfg_v2 = SafetyConfigHistory(
            version_tag="CFG_20250115_PRODUCTION",
            yellow_ppm=5.0,
            orange_ppm=15.0,
            red_ppm=50.0,
            evac_ppm=100.0,
            updated_by="Safety Lead Supervisor",
            reason="Calibrated to Page 13 Master Specification",
            is_active=True,
            created_at=now - timedelta(days=2)
        )
        db.add(cfg_v1)
        db.add(cfg_v2)
        db.commit()

        # 4. Seed Model Registry Versions (for 1-click Model Rollback)
        cm_v1 = [
            [295, 5, 0, 0, 0],
            [3, 290, 7, 0, 0],
            [0, 6, 288, 6, 0],
            [0, 0, 4, 292, 4],
            [0, 0, 0, 3, 297]
        ]
        cm_v09 = [
            [280, 18, 2, 0, 0],
            [12, 275, 13, 0, 0],
            [0, 15, 270, 15, 0],
            [0, 0, 12, 274, 14],
            [0, 0, 0, 16, 284]
        ]
        cm_v11 = [
            [298, 2, 0, 0, 0],
            [1, 296, 3, 0, 0],
            [0, 2, 295, 3, 0],
            [0, 0, 2, 296, 2],
            [0, 0, 0, 1, 299]
        ]

        metrics_v1 = {
            "test_accuracy": 0.962,
            "training_loss": 0.084,
            "validation_loss": 0.091,
            "f1_macro": 0.961,
            "precision_macro": 0.963,
            "recall_macro": 0.962
        }
        metrics_v09 = {
            "test_accuracy": 0.918,
            "training_loss": 0.175,
            "validation_loss": 0.189,
            "f1_macro": 0.916,
            "precision_macro": 0.919,
            "recall_macro": 0.917
        }
        metrics_v11 = {
            "test_accuracy": 0.985,
            "training_loss": 0.042,
            "validation_loss": 0.051,
            "f1_macro": 0.984,
            "precision_macro": 0.986,
            "recall_macro": 0.984
        }

        m_v09 = ModelRegistryRecord(
            version="v0.9",
            model_name="MobileNetV3_Initial_Pilot",
            architecture="MobileNetV3-Small (Frozen Backbone)",
            model_file="models/v0.9/h2s_model_v0.9.tflite",
            test_accuracy=0.918,
            confusion_matrix_json=json.dumps(cm_v09),
            metrics_json=json.dumps(metrics_v09),
            is_active=False,
            approval_status="Retired (Archived)",
            created_at=now - timedelta(days=20),
            deployed_at=now - timedelta(days=20)
        )
        m_v1 = ModelRegistryRecord(
            version="v1.0",
            model_name="H2S_MobileNetV3_Classification",
            architecture="MobileNetV3-Small + 8 Statistical Features",
            model_file="models/v1.0/h2s_model_v1.0.tflite",
            test_accuracy=0.962,
            confusion_matrix_json=json.dumps(cm_v1),
            metrics_json=json.dumps(metrics_v1),
            is_active=True,
            approval_status="Approved (Active)",
            created_at=now - timedelta(days=7),
            deployed_at=now - timedelta(days=7)
        )
        m_v11 = ModelRegistryRecord(
            version="v1.1",
            model_name="H2S_MobileNetV3_Enhanced_Lighting",
            architecture="MobileNetV3-Small + Fine-Tuned Top 50 Layers",
            model_file="models/v1.1/h2s_model_v1.1.tflite",
            test_accuracy=0.985,
            confusion_matrix_json=json.dumps(cm_v11),
            metrics_json=json.dumps(metrics_v11),
            is_active=False,
            approval_status="Pending Review (Candidate)",
            created_at=now - timedelta(hours=6),
            deployed_at=None
        )
        db.add(m_v09)
        db.add(m_v1)
        db.add(m_v11)
        db.commit()

        # Save model registry JSON to models/model_registry.json
        registry_data = {
            "active_version": "v1.0",
            "versions": {
                "v0.9": {
                    "model_name": "MobileNetV3_Initial_Pilot",
                    "test_accuracy": 0.918,
                    "approval_status": "Retired (Archived)",
                    "created_at": str(now - timedelta(days=20))
                },
                "v1.0": {
                    "model_name": "H2S_MobileNetV3_Classification",
                    "test_accuracy": 0.962,
                    "approval_status": "Approved (Active)",
                    "created_at": str(now - timedelta(days=7))
                },
                "v1.1": {
                    "model_name": "H2S_MobileNetV3_Enhanced_Lighting",
                    "test_accuracy": 0.985,
                    "approval_status": "Pending Review (Candidate)",
                    "created_at": str(now - timedelta(hours=6))
                }
            }
        }
        with open(config.MODEL_DIR / "model_registry.json", "w") as f:
            json.dump(registry_data, f, indent=2)

        # 5. Seed Historical Scans & Alerts matching Page 13
        scans_data = [
            ("SCAN_20250120_001", "EMP_00542", "STR_0421", "BATCH_2024_Q4_LOT_03", "C1", 6.8, "5-8 ppm", 0.95, False, False, now - timedelta(minutes=15)),
            ("SCAN_20250120_002", "EMP_00108", "STR_0422", "BATCH_2024_Q4_LOT_03", "C2", 21.4, "18-22 ppm", 0.94, True, True, now - timedelta(minutes=22)),
            ("SCAN_20250120_003", "EMP_00731", "STR_0423", "BATCH_2024_Q4_LOT_03", "C0", 0.4, "0-1 ppm", 0.98, False, False, now - timedelta(minutes=35)),
            ("SCAN_20250120_004", "EMP_00914", "STR_001234", "BATCH_2024_Q4_05", "C3", 65.0, "50-100 ppm", 0.93, True, True, now - timedelta(hours=2)),
            ("SCAN_20250120_005", "EMP_00542", "STR_0421", "BATCH_2024_Q4_LOT_03", "C2", 16.5, "10-50 ppm", 0.91, True, True, now - timedelta(hours=4)),
            ("SCAN_20250120_006", "EMP_00108", "STR_0422", "BATCH_2024_Q4_LOT_03", "C0", 0.2, "0-1 ppm", 0.99, False, False, now - timedelta(hours=6))
        ]

        for s_id, w_id, st_id, batch, cls_name, ppm, ppm_r, conf, thr_ex, alt_trig, ts in scans_data:
            scan = Scan(
                scan_id=s_id,
                worker_id=w_id,
                strip_id=st_id,
                strip_batch=batch,
                timestamp=ts,
                phone_model="Samsung Galaxy S23 Industrial",
                image_file=None,
                image_quality_score=0.96,
                model_version="v1.0",
                model_confidence=conf,
                predicted_class=cls_name,
                predicted_ppm=ppm,
                predicted_ppm_range=ppm_r,
                safety_threshold_exceeded=thr_ex,
                alert_triggered=alt_trig,
                supervisor_reviewed=False,
                approved_for_training=False
            )
            db.add(scan)

        db.commit()

        # Seed Alerts corresponding to above scans
        alerts_data = [
            ("ALT_20250120_001", "SCAN_20250120_002", "EMP_00108", "Orange", 21.4, "Moderate H2S Exposure (21.4 ppm) in Catalytic Cracking Unit. Enhance ventilation.", now - timedelta(minutes=22)),
            ("ALT_20250120_002", "SCAN_20250120_004", "EMP_00914", "Red", 65.0, "High H2S Hazard (65.0 ppm) detected at Tank Farm. Worker leaving area.", now - timedelta(hours=2)),
            ("ALT_20250120_003", "SCAN_20250120_005", "EMP_00542", "Yellow", 16.5, "Caution Zone (16.5 ppm) - H2S detected above threshold.", now - timedelta(hours=4))
        ]

        for a_id, s_id, w_id, lvl, ppm, msg, ts in alerts_data:
            alert = Alert(
                alert_id=a_id,
                scan_id=s_id,
                worker_id=w_id,
                alert_level=lvl,
                ppm_value=ppm,
                message=msg,
                status="ACTIVE",
                created_at=ts
            )
            db.add(alert)

        # 6. Seed Initial Audit Logs
        audits = [
            AuditLog(
                entity_type="SYSTEM",
                entity_id="SYS_INIT",
                action="SYSTEM_INITIALIZED",
                actor_id="SYSTEM",
                details="H2S Industrial Safety Platform initialized with versioning & undo subsystem.",
                timestamp=now - timedelta(days=1)
            ),
            AuditLog(
                entity_type="MODEL",
                entity_id="v1.0",
                action="MODEL_DEPLOYED",
                actor_id="Safety Lead Supervisor",
                details="MobileNetV3-Small v1.0 deployed with 96.2% test accuracy.",
                timestamp=now - timedelta(days=7)
            )
        ]
        for a in audits:
            db.add(a)

        db.commit()
        print("[OK] Database seeding complete.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_all()
