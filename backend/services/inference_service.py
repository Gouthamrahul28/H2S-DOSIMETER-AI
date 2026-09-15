"""
AI Inference Service - Cu-PAN Reference Scale & PPM Estimation
Implements Sections 3.1 & 3.2 with SIH26118 Cu-PAN (Purple -> Yellow) Calibration Target:
- Enforces strict chemical spectrum validation: Rejects alien colors (Green, Blue, Cyan).
- Maps to Cu-PAN ladder stages (S0 to S10).
- Calculates exact PPM and category (C0-C4).
"""

import numpy as np
from typing import Dict, Any, Tuple
import config
from backend.services.cv_pipeline import CVPipeline

class InferenceService:
    """Performs inference using the SIH26118 Cu-PAN calibration scale and strict spectral gating."""

    @classmethod
    def predict(cls, img_224: np.ndarray, model_version: str = "v1.0") -> Dict[str, Any]:
        """
        Executes Cu-PAN inference:
        1. Validates color spectrum (Must be within Purple-Magenta -> Coral -> Orange -> Yellow).
           Rejects green, blue, cyan, or out-of-gamut colors.
        2. Matches against the 11 Cu-PAN calibration rungs (S0 - S10).
        3. Computes continuous PPM estimation and category (C0 - C4).
        """
        # Step 1: Spectral Gatekeeper
        spectral_check = CVPipeline.validate_cupan_spectrum(img_224)
        if not spectral_check["valid"]:
            return {
                "spectrum_valid": False,
                "reason_code": spectral_check["reason_code"],
                "foreign_color": spectral_check["foreign_color"],
                "message": spectral_check["message"],
                "hue_angle": spectral_check["hue_angle"],
                "min_delta_e": spectral_check["min_delta_e"],
                "predicted_class": "INVALID",
                "predicted_ppm": 0.0,
                "predicted_ppm_range": "Invalid Spectrum",
                "model_confidence": 0.0,
                "model_version": model_version,
                "exposure_level": "Unrecognized Reagent / Contamination",
                "worker_action": "REJECTED: Foreign color detected (Green/Blue). Re-photograph genuine Cu-PAN indicator strip.",
                "alert_level": "Rejected",
                "color_hex": "#64748b",
                "badge_class": "badge-cat"
            }

        # Step 2: Extract color features and match to Cu-PAN ladder
        features = CVPipeline.extract_color_features(img_224)
        matched_stage_id = spectral_check["matched_stage"]
        stage_idx = int(matched_stage_id[1:])  # 0 to 10
        stage_info = config.CUPAN_LADDER[stage_idx]

        predicted_class = stage_info["category"]
        cat_info = config.H2S_CATEGORIES[predicted_class]

        # Step 3: Continuous PPM estimation along the 11 rungs
        # S0-S1 (C0): 0.0 - 1.0 ppm
        # S2-S3 (C1): 1.0 - 10.0 ppm
        # S4-S6 (C2): 10.0 - 50.0 ppm
        # S7-S8 (C3): 50.0 - 100.0 ppm
        # S9-S10 (C4): >100.0 ppm (Ceiling)
        min_p = cat_info["min_ppm"]
        max_p = cat_info["max_ppm"]

        if stage_idx <= 1:
            ppm = 0.1 + 0.9 * (stage_idx / 1.0)
            ppm_range = "0-1 ppm"
        elif stage_idx <= 3:
            ppm = 1.0 + 9.0 * ((stage_idx - 2) / 1.5 + 0.2)
            ppm = min(10.0, max(1.0, ppm))
            ppm_range = f"{max(1.0, round(ppm - 1.5, 1))}-{min(10.0, round(ppm + 1.5, 1))} ppm"
        elif stage_idx <= 6:
            ppm = 10.0 + 40.0 * ((stage_idx - 4) / 2.0)
            ppm = min(50.0, max(10.0, ppm))
            ppm_range = f"{max(10.0, round(ppm - 3.0, 1))}-{min(50.0, round(ppm + 3.0, 1))} ppm"
        elif stage_idx <= 8:
            ppm = 50.0 + 50.0 * ((stage_idx - 7) / 1.5 + 0.1)
            ppm = min(100.0, max(50.0, ppm))
            ppm_range = f"{max(50.0, round(ppm - 5.0, 1))}-{min(100.0, round(ppm + 5.0, 1))} ppm"
        else:
            ppm = 100.0 + 50.0 * (stage_idx - 9 + 0.5)
            ppm_range = ">100 ppm (CRITICAL)"

        # Confidence is derived from CIEDE2000 closeness (lower delta-E = higher confidence)
        confidence = max(0.70, round(1.0 - (spectral_check["min_delta_e"] / 35.0), 3))

        return {
            "spectrum_valid": True,
            "matched_stage": stage_info["id"],
            "stage_name": stage_info["stage"],
            "appearance": stage_info["appearance"],
            "predicted_class": predicted_class,
            "predicted_ppm": round(float(ppm), 2),
            "predicted_ppm_range": ppm_range,
            "model_confidence": confidence,
            "model_version": model_version,
            "min_delta_e": spectral_check["min_delta_e"],
            "hue_angle": spectral_check["hue_angle"],
            "features": features,
            "exposure_level": cat_info["exposure_level"],
            "worker_action": cat_info["worker_action"],
            "alert_level": cat_info["alert_level"],
            "color_hex": stage_info["hex"],
            "badge_class": cat_info["badge_class"]
        }
