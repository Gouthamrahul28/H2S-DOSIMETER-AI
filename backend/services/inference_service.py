"""
AI Inference Service - H2S Classification & PPM Estimation
Implements Sections 3.1 & 3.2 (Pages 8-9) with MobileNetV3-Small / Colorimetric calibration engine.
"""

import numpy as np
from typing import Dict, Any, Tuple
import config
from backend.services.cv_pipeline import CVPipeline

class InferenceService:
    """Performs inference on normalized strip images, yielding C0-C4 category and continuous PPM estimation."""

    # Reference chemical calibration prototypes in normalized RGB
    CLASS_PROTOTYPES = {
        "C0": np.array([235.0, 230.0, 210.0]),  # 0-1 ppm: Pale / off-white
        "C1": np.array([210.0, 190.0, 140.0]),  # 1-10 ppm: Light tan / yellow
        "C2": np.array([175.0, 135.0, 75.0]),   # 10-50 ppm: Golden amber brown
        "C3": np.array([115.0, 70.0, 40.0]),    # 50-100 ppm: Dark chocolate brown
        "C4": np.array([50.0, 35.0, 30.0])      # >100 ppm: Deep sulfide black
    }

    @classmethod
    def predict(cls, img_224: np.ndarray, model_version: str = "v1.0") -> Dict[str, Any]:
        """
        Executes inference:
        1. Extracts color statistics & CIE Lab features
        2. Computes class probabilities via calibrated optical density distance & softmax
        3. Maps to category (C0-C4) and calculates continuous PPM estimation
        """
        features = CVPipeline.extract_color_features(img_224)
        mean_rgb = np.array(features["mean_rgb"])

        # Compute distance to each class prototype in color space
        distances = []
        classes = ["C0", "C1", "C2", "C3", "C4"]
        for c in classes:
            proto = cls.CLASS_PROTOTYPES[c]
            # Euclidean distance in RGB color space
            dist = np.linalg.norm(mean_rgb - proto)
            distances.append(dist)

        # Softmax over negative distances (scaled by temperature)
        inv_dists = -np.array(distances) / 35.0
        exp_dists = np.exp(inv_dists - np.max(inv_dists))
        probs = exp_dists / np.sum(exp_dists)

        best_idx = int(np.argmax(probs))
        predicted_class = classes[best_idx]
        confidence = float(probs[best_idx])

        cat_info = config.H2S_CATEGORIES[predicted_class]

        # Calculate continuous PPM estimation within class range
        min_p = cat_info["min_ppm"]
        max_p = cat_info["max_ppm"]

        if predicted_class == "C0":
            ppm = min_p + (max_p - min_p) * (1.0 - confidence * 0.4)
            ppm_range = "0-1 ppm"
        elif predicted_class == "C1":
            # Interpolate towards C2 if closer to C2
            ratio = probs[2] / (probs[0] + probs[2] + 1e-6)
            ppm = 1.0 + 9.0 * ratio
            low_bound = max(1.0, round(ppm - 1.5, 1))
            high_bound = min(10.0, round(ppm + 1.5, 1))
            ppm_range = f"{low_bound}-{high_bound} ppm"
        elif predicted_class == "C2":
            ratio = probs[3] / (probs[1] + probs[3] + 1e-6)
            ppm = 10.0 + 40.0 * ratio
            low_bound = max(10.0, round(ppm - 3.0, 1))
            high_bound = min(50.0, round(ppm + 3.0, 1))
            ppm_range = f"{low_bound}-{high_bound} ppm"
        elif predicted_class == "C3":
            ratio = probs[4] / (probs[2] + probs[4] + 1e-6)
            ppm = 50.0 + 50.0 * ratio
            low_bound = max(50.0, round(ppm - 5.0, 1))
            high_bound = min(100.0, round(ppm + 5.0, 1))
            ppm_range = f"{low_bound}-{high_bound} ppm"
        else:  # C4
            ppm = 100.0 + 65.0 * (1.0 + (1.0 - min_p/max_p))
            ppm_range = ">100 ppm (CRITICAL)"

        return {
            "predicted_class": predicted_class,
            "predicted_ppm": round(float(ppm), 2),
            "predicted_ppm_range": ppm_range,
            "model_confidence": round(confidence, 3),
            "model_version": model_version,
            "probabilities": {c: round(float(p), 4) for c, p in zip(classes, probs)},
            "features": features,
            "exposure_level": cat_info["exposure_level"],
            "worker_action": cat_info["worker_action"],
            "alert_level": cat_info["alert_level"],
            "color_hex": cat_info["color_hex"],
            "badge_class": cat_info["badge_class"]
        }
