"""
Scan Recording & Analysis Router
Implements Sections 2.3, 3.1, 6.2 & 10 (Pages 7-8, 22, 27)
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid
import numpy as np
from PIL import Image, ImageDraw
import io
import os

from backend.database import get_db
from backend.models import Scan, Strip, Worker, AuditLog
from backend.schemas import ScanSubmissionRequest, ScanResponse
from backend.services.strip_validator import StripValidator
from backend.services.cv_pipeline import CVPipeline
from backend.services.inference_service import InferenceService
from backend.services.alert_engine import AlertEngine
import config

router = APIRouter(prefix="/api/scans", tags=["Scans"])

def generate_synthetic_strip_image(ppm: float) -> np.ndarray:
    """Generates a realistic 224x224 synthetic H2S strip image matching the Cu-PAN spectrum (Purple -> Yellow)."""
    # Interpolate along Cu-PAN rungs
    if ppm <= 1.0:
        # S0 to S1: Purple-Magenta
        f = ppm / 1.0
        base_color = (int(149 + 22 * f), int(73 + 5 * f), int(120 - 6 * f))
    elif ppm <= 10.0:
        # S2 to S3: Rose-Red to Coral
        f = (ppm - 1.0) / 9.0
        base_color = (int(193 + 16 * f), int(88 + 14 * f), int(106 - 8 * f))
    elif ppm <= 50.0:
        # S4 to S6: Salmon-Orange to Amber-Orange
        f = (ppm - 10.0) / 40.0
        base_color = (int(223 + 13 * f), int(122 + 43 * f), int(91 - 17 * f))
    elif ppm <= 100.0:
        # S7 to S8: Amber to Golden Yellow
        f = (ppm - 50.0) / 50.0
        base_color = (int(238 + 1 * f), int(185 + 16 * f), int(68 - 6 * f))
    else:
        # S9 to S10: Yellow (Full Free PAN)
        base_color = (247, 218, 52)

    img = Image.new("RGB", (224, 224), (245, 245, 245))
    draw = ImageDraw.Draw(img)
    # Draw central indicator reaction square with slight noise
    draw.rectangle([40, 40, 184, 184], fill=base_color, outline=(180, 180, 180), width=2)
    # Calibration neutral reference markers
    draw.rectangle([10, 10, 30, 30], fill=(255, 255, 255), outline=(200, 200, 200))
    draw.rectangle([10, 194, 30, 214], fill=(20, 20, 20), outline=(200, 200, 200))
    arr = np.array(img).astype(np.float32)
    noise = np.random.normal(0, 2, arr.shape)
    return np.clip(arr + noise, 0, 255).astype(np.uint8)

@router.post("", response_model=ScanResponse)
def submit_scan(payload: ScanSubmissionRequest, db: Session = Depends(get_db)):
    """
    Submits an H2S indicator strip scan:
    1. Pre-scan strip validity check (7 rules)
    2. Image quality verification (blur, lighting, glare)
    3. ROI extraction and white-balance color constancy
    4. Cu-PAN Spectral Gatekeeper: Rejects alien colors like Green and Blue
    5. AI Model inference (Cu-PAN calibration ladder)
    6. Safety rule engine & threshold evaluation
    7. Audit record creation
    """
    # 1. Validate Strip
    valid, reason_code, msg, strip_details = StripValidator.validate_strip(db, payload.worker_id, payload.strip_id)
    if not valid:
        raise HTTPException(
            status_code=400,
            detail={"error": "STRIP_VALIDATION_FAILED", "reason_code": reason_code, "message": msg}
        )

    strip = db.query(Strip).filter(Strip.id == payload.strip_id).first()

    # 2. Acquire or Generate Image
    if payload.image_base64:
        raw_img = CVPipeline.load_image_from_bytes_or_base64(payload.image_base64)
        if raw_img is None:
            raise HTTPException(status_code=400, detail="Invalid image encoding format.")
        
        # Quality Check
        quality = CVPipeline.check_image_quality(raw_img)
        if not quality["passed"]:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "IMAGE_QUALITY_CHECK_FAILED",
                    "quality_metrics": quality,
                    "message": "Image quality failed. " + " ".join(quality["issues"])
                }
            )
        h_raw, w_raw, _ = raw_img.shape
        x1, x2 = int(w_raw * 0.2), int(w_raw * 0.8)
        y1, y2 = int(h_raw * 0.2), int(h_raw * 0.8)
        roi_coords = {
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "width": x2 - x1, "height": y2 - y1,
            "img_width": w_raw, "img_height": h_raw,
            "percent": {"x": 20.0, "y": 20.0, "width": 60.0, "height": 60.0}
        }
        processed_img = CVPipeline.extract_roi_and_normalize(raw_img)
    else:
        # Generate simulated strip image
        target_ppm = payload.simulated_ppm if payload.simulated_ppm is not None else 18.5
        processed_img = generate_synthetic_strip_image(target_ppm)
        raw_img = processed_img.copy()
        h_raw, w_raw, _ = raw_img.shape
        roi_coords = {
            "x1": int(w_raw * 0.25), "y1": int(h_raw * 0.25),
            "x2": int(w_raw * 0.75), "y2": int(h_raw * 0.75),
            "width": int(w_raw * 0.5), "height": int(h_raw * 0.5),
            "img_width": w_raw, "img_height": h_raw,
            "percent": {"x": 25.0, "y": 25.0, "width": 50.0, "height": 50.0}
        }
        quality = {
            "passed": True,
            "quality_score": 0.98,
            "lighting_status": "Good",
            "focus_status": "Sharp",
            "distance_status": "Optimal (~10cm)",
            "blur_metric": 210.4,
            "mean_luminance": 132.0,
            "glare_percentage": 0.0,
            "issues": []
        }

    # 3. Generate Scan ID & Save Both Raw and ROI Images
    scan_id = f"SCAN_{datetime.utcnow().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6].upper()}"
    raw_filename = f"{scan_id}_raw.jpg"
    roi_filename = f"{scan_id}_roi.jpg"
    try:
        Image.fromarray(raw_img).save(config.UPLOAD_DIR / raw_filename, format="JPEG", quality=92)
        Image.fromarray(processed_img).save(config.UPLOAD_DIR / roi_filename, format="JPEG", quality=92)
    except Exception:
        pass

    # Extract colorimetric features for visual verification
    extracted_feat = CVPipeline.extract_color_features(processed_img)

    # 4. AI Inference & Cu-PAN Spectral Gating
    prediction = InferenceService.predict(processed_img, model_version=config.DEFAULT_MODEL_VERSION)
    if not prediction.get("spectrum_valid", True):
        raise HTTPException(
            status_code=422,
            detail={
                "error": "INVALID_COLOR_SPECTRUM",
                "foreign_color": prediction.get("foreign_color"),
                "message": prediction["message"],
                "hue_angle": prediction.get("hue_angle"),
                "min_delta_e": prediction.get("min_delta_e"),
                "accepted_spectrum": "Cu-PAN (Purple-Magenta -> Rose-Red -> Coral -> Orange -> Amber -> Yellow). Colors like Green and Blue are physically invalid."
            }
        )

    if payload.simulated_ppm is not None:
        target_val = float(payload.simulated_ppm)
        prediction["predicted_ppm"] = target_val
        for c_k, c_v in config.H2S_CATEGORIES.items():
            if c_v["min_ppm"] <= target_val <= c_v["max_ppm"] or (c_k == "C4" and target_val > 100):
                prediction["predicted_class"] = c_k
                prediction["predicted_ppm_range"] = c_v["ppm_range"]
                prediction["exposure_level"] = c_v["exposure_level"]
                prediction["worker_action"] = c_v["worker_action"]
                prediction["alert_level"] = c_v["alert_level"]
                prediction["color_hex"] = c_v["color_hex"]
                prediction["badge_class"] = c_v["badge_class"]
                break

    # 5. Evaluate Safety Rules & Alerts
    ppm = prediction["predicted_ppm"]
    exceeded, alert_trig, alert_lvl, alert_msg = AlertEngine.evaluate_and_create_alert(
        db, scan_id, payload.worker_id, ppm
    )

    # 6. Update Strip Use Count
    strip.use_count += 1
    if strip.use_count >= strip.max_uses:
        strip.status = "USED"

    # 7. Persist Scan Audit Record (Page 27)
    scan = Scan(
        scan_id=scan_id,
        worker_id=payload.worker_id,
        strip_id=payload.strip_id,
        strip_batch=strip.batch_id,
        timestamp=datetime.utcnow(),
        phone_model=payload.phone_model,
        image_file=raw_filename,
        image_quality_score=quality["quality_score"],
        model_version=prediction["model_version"],
        model_confidence=prediction["model_confidence"],
        predicted_class=prediction["predicted_class"],
        predicted_ppm=prediction["predicted_ppm"],
        predicted_ppm_range=prediction["predicted_ppm_range"],
        safety_threshold_exceeded=exceeded,
        alert_triggered=alert_trig,
        supervisor_reviewed=False,
        approved_for_training=False
    )
    db.add(scan)
    db.commit()

    return ScanResponse(
        scan_id=scan.scan_id,
        worker_id=scan.worker_id,
        strip_id=scan.strip_id,
        strip_batch=scan.strip_batch,
        timestamp=scan.timestamp.isoformat(),
        predicted_class=prediction["predicted_class"],
        predicted_ppm=prediction["predicted_ppm"],
        predicted_ppm_range=prediction["predicted_ppm_range"],
        model_confidence=prediction["model_confidence"],
        model_version=prediction["model_version"],
        exposure_level=prediction["exposure_level"],
        worker_action=prediction["worker_action"],
        alert_level=alert_lvl if alert_lvl else "Green",
        safety_threshold_exceeded=exceeded,
        alert_triggered=alert_trig,
        color_hex=prediction["color_hex"],
        badge_class=prediction["badge_class"],
        image_quality=quality,
        image_url=f"/data/uploads/{raw_filename}",
        raw_image_url=f"/data/uploads/{raw_filename}",
        roi_coordinates=roi_coords,
        extracted_features={
            "mean_rgb": [round(c, 1) for c in extracted_feat["mean_rgb"]],
            "hue_angle": extracted_feat["hue_angle"],
            "chroma": extracted_feat["chroma"],
            "mean_lab": [round(l, 1) for l in extracted_feat["mean_lab"]]
        }
    )

@router.get("")
def list_scans(
    worker_id: Optional[str] = None,
    predicted_class: Optional[str] = None,
    alerts_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List recent scans for supervisor dashboard."""
    q = db.query(Scan)
    if worker_id:
        q = q.filter(Scan.worker_id == worker_id)
    if predicted_class:
        q = q.filter(Scan.predicted_class == predicted_class)
    if alerts_only:
        q = q.filter(Scan.alert_triggered == True)

    scans = q.order_by(Scan.timestamp.desc()).limit(limit).all()
    results = []
    for s in scans:
        cat_info = config.H2S_CATEGORIES.get(s.predicted_class, {})
        worker = db.query(Worker).filter(Worker.id == s.worker_id).first()
        results.append({
            "scan_id": s.scan_id,
            "worker_id": s.worker_id,
            "worker_name": worker.name if worker else s.worker_id,
            "strip_id": s.strip_id,
            "strip_batch": s.strip_batch,
            "timestamp": s.timestamp.isoformat(),
            "predicted_class": s.predicted_class,
            "predicted_ppm": s.predicted_ppm,
            "predicted_ppm_range": s.predicted_ppm_range,
            "model_confidence": s.model_confidence,
            "safety_threshold_exceeded": s.safety_threshold_exceeded,
            "alert_triggered": s.alert_triggered,
            "supervisor_reviewed": s.supervisor_reviewed,
            "image_file": s.image_file,
            "image_url": f"/data/uploads/{s.image_file}" if s.image_file else None,
            "color_hex": cat_info.get("color_hex", "#ffffff"),
            "badge_class": cat_info.get("badge_class", "badge-green"),
            "exposure_level": cat_info.get("exposure_level", "Unknown"),
            "worker_action": cat_info.get("worker_action", "Normal")
        })
    return results

@router.post("/{scan_id}/review")
def review_scan(
    scan_id: str,
    ground_truth_ppm: Optional[float] = Body(None),
    approve_for_training: bool = Body(True),
    notes: Optional[str] = Body(None),
    db: Session = Depends(get_db)
):
    """Supervisor reviews scan and flags it for continuous retraining (Page 22 & 27)."""
    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan.supervisor_reviewed = True
    scan.review_timestamp = datetime.utcnow()
    scan.approved_for_training = approve_for_training
    if ground_truth_ppm is not None:
        scan.ground_truth_ppm = ground_truth_ppm
    if notes:
        scan.notes = notes

    db.commit()
    return {"message": f"Scan {scan_id} reviewed and approved for continuous training dataset."}
