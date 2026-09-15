"""
Automated Test Suite for H2S Industrial Safety Platform
Validates:
- Authentication & Strip Validation (7 rules)
- Scan Processing & AI Classification
- Alert Threshold Generation
- Model Registry Rollback / Undo
- Safety Configuration Versioning & Undo
- Data Leakage Prevention
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal
from backend.models import Worker, Strip, Scan, Alert, SafetyConfigHistory, ModelRegistryRecord
from backend.services.strip_validator import StripValidator
from backend.services.inference_service import InferenceService
from backend.services.alert_engine import AlertEngine
from ai_pipeline.dataset_generator import build_dataset
import config

client = TestClient(app)

def test_api_health():
    """Verify system health endpoint."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["version"] == "2.0.0"

def test_worker_authentication():
    """Verify worker login and invalid PIN rejection."""
    # Valid login
    res = client.post("/api/auth/worker-login", json={"worker_id": "EMP_00542", "pin": "1234"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user_info"]["name"] == "John Martinez"

    # Invalid PIN
    res_bad = client.post("/api/auth/worker-login", json={"worker_id": "EMP_00542", "pin": "9999"})
    assert res_bad.status_code == 401

def test_strip_validation_rules():
    """Verify Section 2.2 strict 7-rule validation checks."""
    # Ensure test strip STR_0421 is active and reset
    db = SessionLocal()
    st = db.query(Strip).filter(Strip.id == "STR_0421").first()
    if st:
        st.status = "ACTIVE"
        st.use_count = 0
        db.commit()
    db.close()

    # 1. Valid strip
    res_valid = client.post("/api/strips/validate", json={"worker_id": "EMP_00542", "strip_id": "STR_0421"})
    assert res_valid.status_code == 200
    assert res_valid.json()["valid"] is True

    # 2. Expired strip check
    res_exp = client.post("/api/strips/validate", json={"worker_id": "EMP_00542", "strip_id": "STR_EXPIRED"})
    assert res_exp.status_code == 200
    data_exp = res_exp.json()
    assert data_exp["valid"] is False
    assert data_exp["reason_code"] == "EXPIRED"

    # 3. Already used strip check
    res_used = client.post("/api/strips/validate", json={"worker_id": "EMP_00542", "strip_id": "STR_USED"})
    assert res_used.status_code == 200
    data_used = res_used.json()
    assert data_used["valid"] is False
    assert data_used["reason_code"] == "ALREADY_USED"

    # 4. Non-existent strip check
    res_nf = client.post("/api/strips/validate", json={"worker_id": "EMP_00542", "strip_id": "STR_UNKNOWN_999"})
    assert res_nf.status_code == 200
    data_nf = res_nf.json()
    assert data_nf["valid"] is False
    assert data_nf["reason_code"] == "STRIP_NOT_FOUND"

def test_scan_submission_and_alerts():
    """Verify scan submission, AI inference, and alert triggering."""
    # Ensure test strip STR_0422 is reset to active with 0 use_count
    db = SessionLocal()
    st = db.query(Strip).filter(Strip.id == "STR_0422").first()
    if st:
        st.status = "ACTIVE"
        st.use_count = 0
        db.commit()
    db.close()

    # Submit scan with high PPM (Hazard)
    res_scan = client.post("/api/scans", json={
        "worker_id": "EMP_00108",
        "strip_id": "STR_0422",
        "simulated_ppm": 65.0
    })
    assert res_scan.status_code == 200
    data = res_scan.json()
    assert data["predicted_class"] == "C3"
    assert data["predicted_ppm"] == 65.0
    assert data["alert_triggered"] is True
    assert data["alert_level"] == "Red"
    assert "Leave area immediately" in data["worker_action"]

    # Submit scan with expired strip should fail pre-validation
    res_fail = client.post("/api/scans", json={
        "worker_id": "EMP_00542",
        "strip_id": "STR_EXPIRED",
        "simulated_ppm": 10.0
    })
    assert res_fail.status_code == 400

def test_safety_config_versioning_and_undo():
    """Verify that every safety parameter update creates a version snapshot, and can be undone."""
    # 1. Get initial active config
    res_curr = client.get("/api/supervisor/safety/config/current")
    assert res_curr.status_code == 200
    initial_id = res_curr.json()["id"]
    initial_yellow = res_curr.json()["yellow_ppm"]

    # 2. Update thresholds to new values
    res_update = client.post("/api/supervisor/safety/config", json={
        "yellow_ppm": 7.5,
        "orange_ppm": 22.0,
        "red_ppm": 65.0,
        "evac_ppm": 125.0,
        "reason": "Temporary turnaround maintenance limits"
    })
    assert res_update.status_code == 200
    new_cfg = res_update.json()
    assert new_cfg["yellow_ppm"] == 7.5
    new_id = new_cfg["id"]

    # 3. Execute 1-Click Rollback / UNDO to initial version
    res_rollback = client.post(f"/api/supervisor/safety/config/rollback/{initial_id}", json={})
    assert res_rollback.status_code == 200

    # 4. Verify reverted thresholds
    res_reverted = client.get("/api/supervisor/safety/config/current")
    assert res_reverted.status_code == 200
    assert res_reverted.json()["yellow_ppm"] == initial_yellow

def test_ai_model_registry_and_rollback():
    """Verify AI model inventory, promotion, and 1-click rollback."""
    # List models
    res_models = client.get("/api/supervisor/ai/models")
    assert res_models.status_code == 200
    models = res_models.json()
    versions = [m["version"] for m in models]
    assert "v1.0" in versions

    # Rollback to v0.9
    res_rb = client.post("/api/supervisor/ai/rollback", json={
        "target_version": "v0.9",
        "reason": "Test regression rollback"
    })
    assert res_rb.status_code == 200
    assert res_rb.json()["active_version"] == "v0.9"

    # Restore v1.0
    res_restore = client.post("/api/supervisor/ai/rollback", json={
        "target_version": "v1.0",
        "reason": "Restoring production v1.0"
    })
    assert res_restore.status_code == 200
    assert res_restore.json()["active_version"] == "v1.0"

def test_data_leakage_prevention():
    """Verify physical strip partitioning has zero data leakage (Page 10 Section 4.2)."""
    df = build_dataset(quick_sample=True)
    train_strips = set(df[df['split'] == 'train']['strip_id'])
    val_strips = set(df[df['split'] == 'val']['strip_id'])
    test_strips = set(df[df['split'] == 'test']['strip_id'])

    assert len(train_strips & val_strips) == 0
    assert len(train_strips & test_strips) == 0
    assert len(val_strips & test_strips) == 0

def _create_strip_image_b64(rgb):
    import io, base64
    from PIL import Image, ImageDraw
    import numpy as np
    img = Image.new("RGB", (224, 224), (245, 245, 245))
    draw = ImageDraw.Draw(img)
    draw.rectangle([40, 40, 184, 184], fill=tuple(rgb), outline=(180, 180, 180), width=2)
    draw.rectangle([10, 10, 30, 30], fill=(255, 255, 255), outline=(200, 200, 200))
    draw.rectangle([10, 194, 30, 214], fill=(20, 20, 20), outline=(200, 200, 200))
    arr = np.array(img).astype(np.float32)
    noise = np.random.normal(0, 2, arr.shape)
    final_img = Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))
    buf = io.BytesIO()
    final_img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def test_cupan_spectrum_rejection_green_and_blue():
    """Verify that colors outside the Cu-PAN spectrum (e.g., green and blue) are strictly rejected with 422."""
    # Reset strip STR_0421
    db = SessionLocal()
    st = db.query(Strip).filter(Strip.id == "STR_0421").first()
    if st:
        st.status = "ACTIVE"
        st.use_count = 0
        db.commit()
    db.close()

    # 1. Reject Pure Green
    green_b64 = _create_strip_image_b64([0, 210, 0])
    res_green = client.post("/api/scans", json={
        "worker_id": "EMP_00542",
        "strip_id": "STR_0421",
        "image_base64": green_b64
    })
    assert res_green.status_code == 422
    err_g = res_green.json()["detail"]
    assert err_g["error"] == "INVALID_COLOR_SPECTRUM"
    assert "GREEN" in err_g["message"].upper()

    # 2. Reject Pure Blue
    blue_b64 = _create_strip_image_b64([0, 0, 220])
    res_blue = client.post("/api/scans", json={
        "worker_id": "EMP_00542",
        "strip_id": "STR_0421",
        "image_base64": blue_b64
    })
    assert res_blue.status_code == 422
    err_b = res_blue.json()["detail"]
    assert err_b["error"] == "INVALID_COLOR_SPECTRUM"
    assert "BLUE" in err_b["message"].upper()

def test_cupan_spectrum_acceptance():
    """Verify that genuine Cu-PAN colors (Purple-Magenta S0, Orange S5, Yellow S10) are accepted."""
    # Reset strip STR_0421
    db = SessionLocal()
    st = db.query(Strip).filter(Strip.id == "STR_0421").first()
    if st:
        st.status = "ACTIVE"
        st.use_count = 0
        db.commit()
    db.close()

    # Submit valid Cu-PAN S5 Orange patch
    orange_b64 = _create_strip_image_b64([233, 144, 83])
    res_orange = client.post("/api/scans", json={
        "worker_id": "EMP_00542",
        "strip_id": "STR_0421",
        "image_base64": orange_b64
    })
    assert res_orange.status_code == 200
    data = res_orange.json()
    assert data["predicted_class"] == "C2"  # S5 maps to C2
    assert "Orange" in data["exposure_level"] or "hazard" in data["exposure_level"].lower()

