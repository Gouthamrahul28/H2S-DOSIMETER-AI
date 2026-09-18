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
import uuid
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

def test_cielab_calibration_curve():
    """Verify that the AI model active endpoint returns the CIELAB a* calibration curve."""
    res = client.get("/api/supervisor/ai/active-model")
    assert res.status_code == 200
    data = res.json()
    assert "calibration_curve" in data
    calib = data["calibration_curve"]
    assert "points" in calib
    assert len(calib["points"]) == 18
    assert calib["meta"]["slope"] == 4.34
    assert calib["meta"]["intercept"] == 4.65
    assert calib["meta"]["r_squared"] == 0.99070
    assert calib["meta"]["max_ppm"] == 20.0
    
    # Check linear points and color accuracy
    p0 = calib["points"][0]
    assert p0["ppm"] == 0.1
    assert p0["a_star"] == 5.0
    assert p0["is_linear"] is True
    assert p0["hex"].startswith("#")
    assert len(p0["rgb"]) == 3
    
    # Check saturation plateau at 20.0 ppm and color accuracy
    p_last = calib["points"][-1]
    assert p_last["ppm"] == 20.0
    assert p_last["a_star"] == 11.0
    assert p_last["is_linear"] is False
    assert p_last["hex"].startswith("#")
    assert len(p_last["rgb"]) == 3

def test_shift_monitor_factories_act():
    """Verify Shift Monitor endpoint under Factories Act, 1948 standard."""
    res = client.get("/api/supervisor/monitoring/shift-monitor?standard=FACTORIES_ACT")
    assert res.status_code == 200
    data = res.json()
    assert "shift_info" in data
    assert "standard_applied" in data
    assert data["standard_applied"]["id"] == "FACTORIES_ACT"
    assert data["standard_applied"]["twa_ppm"] == 10.0
    assert data["standard_applied"]["stel_ppm"] == 15.0
    assert data["standard_applied"]["shift_dose_limit_ppm_h"] == 80.0
    assert "summary_kpis" in data
    assert data["summary_kpis"]["monitored_workers"] >= 4
    assert "workers" in data
    assert len(data["workers"]) >= 4

    # Verify worker fields
    w0 = data["workers"][0]
    assert "worker_id" in w0
    assert "cumulative_dose_ppm_h" in w0
    assert "tier" in w0
    assert w0["tier"]["tier_badge"] in ["Emerald", "Amber", "Red"]
    assert "last_read_str" in w0
    assert "method" in w0
    assert "short_badge" in w0["method"]
    assert "compliance" in w0
    assert "factories_act_pct" in w0["compliance"]

def test_shift_monitor_acgih():
    """Verify Shift Monitor endpoint under ACGIH standard."""
    res = client.get("/api/supervisor/monitoring/shift-monitor?standard=ACGIH")
    assert res.status_code == 200
    data = res.json()
    assert data["standard_applied"]["id"] == "ACGIH"
    assert data["standard_applied"]["twa_ppm"] == 1.0
    assert data["standard_applied"]["stel_ppm"] == 5.0
    assert data["standard_applied"]["shift_dose_limit_ppm_h"] == 8.0

def test_worker_dose_trajectory_curve():
    """Verify 8-hour shift dose trajectory and threshold lines for worker modal."""
    res = client.get("/api/supervisor/monitoring/worker-dose/EMP_00542?standard=FACTORIES_ACT")
    assert res.status_code == 200
    data = res.json()
    assert data["worker"]["id"] == "EMP_00542"
    assert "trajectory" in data
    assert len(data["trajectory"]) == 9  # H0 through H8
    assert "threshold_lines" in data
    assert "factories_act" in data["threshold_lines"]
    assert "acgih" in data["threshold_lines"]
    assert "method" in data
    assert "formula" in data["method"]

def test_badge_stock_qc_pass_and_reject():
    """Verify Badge Stock / Wristband Lab virgin baseline Delta-E QC testing."""
    # 1. Test Passing QC: Virgin Cu-PAN baseline within Delta-E <= 3.0
    pass_payload = {
        "batch_id": "TEST_BATCH_PASS",
        "virgin_lab_l": 42.2,
        "virgin_lab_a": 37.8,
        "virgin_lab_b": -12.1,
        "checked_by": "Test QC Chemist",
        "notes": "Pristine Cu-PAN S0 baseline test"
    }
    res = client.post("/api/strips/batches/qc-check", json=pass_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["batch_id"] == "TEST_BATCH_PASS"
    assert data["qc_status"] == "PASSED"
    assert data["passed"] is True
    assert data["virgin_baseline_delta_e"] <= 3.0

    # 2. Test Failing QC: Virgin baseline out of spec (compromised/aged chemistry Delta-E > 3.0)
    fail_payload = {
        "batch_id": "TEST_BATCH_FAIL",
        "virgin_lab_l": 52.0,
        "virgin_lab_a": 30.0,
        "virgin_lab_b": -2.0,
        "checked_by": "Test QC Chemist",
        "notes": "Aged indicator strip test"
    }
    res_fail = client.post("/api/strips/batches/qc-check", json=fail_payload)
    assert res_fail.status_code == 200
    data_fail = res_fail.json()
    assert data_fail["batch_id"] == "TEST_BATCH_FAIL"
    assert data_fail["qc_status"] == "REJECTED"
    assert data_fail["passed"] is False
    assert data_fail["virgin_baseline_delta_e"] > 3.0
    assert "QC_FAILED_BASELINE_OUT_OF_SPEC" in data_fail["rejection_reason"]

    # 3. Test Batch Listing endpoint
    res_batches = client.get("/api/strips/batches")
    assert res_batches.status_code == 200
    batch_list = res_batches.json()
    assert len(batch_list) >= 2
    batch_ids = [b["batch_id"] for b in batch_list]
    assert "TEST_BATCH_PASS" in batch_ids
    assert "TEST_BATCH_FAIL" in batch_ids

def test_strip_validation_rejects_unhealthy_batch():
    """Verify that strips belonging to a QC-rejected batch cannot be scanned."""
    # Register strip under the rejected batch
    client.post("/api/strips", json={
        "strip_id": "STR_REJECTED_BATCH_01",
        "batch_id": "TEST_BATCH_FAIL",
        "assigned_worker_id": "EMP_00542",
        "days_valid": 90
    })

    val_res = client.post("/api/strips/validate", json={
        "worker_id": "EMP_00542",
        "strip_id": "STR_REJECTED_BATCH_01"
    })
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["valid"] is False
    assert val_data["reason_code"] in ["BATCH_QC_REJECTED", "BATCH_INVALID"]

def test_wristband_qr_assignment():
    """Verify Workers Roster + Wristband QR Assignment linking Worker <-> Batch <-> Method."""
    req = {
        "worker_id": "EMP_00542",
        "batch_id": "TEST_BATCH_PASS",
        "method_key": "cupan_optical"
    }
    res = client.post("/api/strips/wristbands/assign-qr", json=req)
    assert res.status_code == 200
    data = res.json()
    assert data["worker_id"] == "EMP_00542"
    assert data["worker_name"] == "John Martinez"
    assert data["batch_id"] == "TEST_BATCH_PASS"
    assert data["method_key"] == "cupan_optical"
    assert data["verification_status"] == "ASSIGNED_AND_QC_VERIFIED"
    assert data["qr_payload"].startswith("H2S://V2?")
    assert "w=EMP_00542" in data["qr_payload"]
    assert "b=TEST_BATCH_PASS" in data["qr_payload"]
    assert "m=cupan_optical" in data["qr_payload"]

def test_cryptographic_audit_trail_and_certificate():
    """Verify SHA-256 raw optical fingerprinting and 'How do we trust this number?' certificate."""
    # Create fresh strip under valid batch
    s_id = f"STR_AUDIT_{uuid.uuid4().hex[:6].upper()}"
    client.post("/api/strips", json={
        "strip_id": s_id,
        "batch_id": "TEST_BATCH_PASS",
        "assigned_worker_id": "EMP_00542",
        "days_valid": 90
    })

    # Submit scan
    scan_res = client.post("/api/scans", json={
        "worker_id": "EMP_00542",
        "strip_id": s_id,
        "simulated_ppm": 12.5,
        "phone_model": "Industrial Intrinsic-Safe Terminal"
    })
    assert scan_res.status_code == 200
    scan_id = scan_res.json()["scan_id"]

    # Retrieve Trust Certificate
    cert_res = client.get(f"/api/scans/{scan_id}/audit-certificate")
    assert cert_res.status_code == 200
    cert = cert_res.json()
    assert cert["scan_id"] == scan_id
    assert len(cert["raw_image_hash"]) == 64  # Valid SHA-256 hex string
    assert cert["hash_algorithm"] == "SHA-256"
    assert cert["pipeline_version"] == "CV-PIPE-v2.1"
    assert cert["calibration_version"] == "v2.0-SIH26118"
    assert cert["calibration_curve_id"] == "CURVE-CUPAN-2026-v2"
    assert cert["operator_id"] == "EMP_00542"
    assert cert["worker_name"] == "John Martinez"
    assert cert["predicted_ppm"] == 12.5
    assert cert["cryptographic_seal"].startswith("SIG_")
    assert "HOW DO WE TRUST THIS NUMBER?" in cert["trust_explanation"]
    assert "Cryptographic Optical Hash" in cert["trust_explanation"]
    assert "Calibrated Vision Pipeline" in cert["trust_explanation"]
    assert "Chemical Calibration Curve" in cert["trust_explanation"]

def test_role_based_access_control():
    """Verify RBAC role hierarchy: Worker, Supervisor, Safety Officer, Admin."""
    # 1. Roles matrix
    roles_res = client.get("/api/auth/roles")
    assert roles_res.status_code == 200
    roles = roles_res.json()
    assert "Worker" in roles
    assert "Supervisor" in roles
    assert "Safety Officer" in roles
    assert "Admin" in roles
    assert roles["Worker"]["can_view_all_workers"] is False
    assert roles["Supervisor"]["can_view_all_workers"] is True
    assert roles["Admin"]["can_rollback_models"] is True

    # 2. Worker Login receives Worker role
    w_login = client.post("/api/auth/worker-login", json={"worker_id": "EMP_00542", "pin": "1234"})
    assert w_login.status_code == 200
    assert w_login.json()["user_info"]["role"] == "Worker"

    # 3. Supervisor Login
    s_login = client.post("/api/auth/supervisor-login", json={"username": "supervisor", "password": "safety2025"})
    assert s_login.status_code == 200
    assert s_login.json()["user_info"]["role"] == "Supervisor"

    # 4. Safety Officer Login
    so_login = client.post("/api/auth/supervisor-login", json={"username": "safety_officer", "password": "safety2025"})
    assert so_login.status_code == 200
    assert so_login.json()["user_info"]["role"] == "Safety Officer"

    # 5. Admin Login
    a_login = client.post("/api/auth/supervisor-login", json={"username": "admin", "password": "admin123"})
    assert a_login.status_code == 200
    assert a_login.json()["user_info"]["role"] == "Admin"


