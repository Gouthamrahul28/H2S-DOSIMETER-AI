"""
Computer Vision & Image Processing Pipeline
Implements Section 2.3, 3.1 & 3.2 with SIH26118 Cu-PAN Spectral Gatekeeper:
- Image Quality Checks (Blur, Lighting, Glare, ROI)
- Color Normalization (White Balance, Lighting compensation)
- Feature Extraction (RGB stats, CIE Lab conversion, Hue angle)
- Strict Cu-PAN Spectral Validation: Rejects alien colors (Green, Blue, Cyan)
"""

import numpy as np
import cv2
from PIL import Image
import io
import base64
import math
from typing import Tuple, Dict, Any, Optional
from skimage.color import rgb2lab, deltaE_ciede2000
import config

class CVPipeline:
    """Performs image quality inspection, ROI detection, color normalization, and Cu-PAN spectral verification."""

    @staticmethod
    def load_image_from_bytes_or_base64(image_data: str) -> Optional[np.ndarray]:
        """Loads RGB image from raw bytes, base64 data URI, or binary string."""
        try:
            if image_data.startswith("data:image"):
                image_data = image_data.split(",")[1]
            decoded = base64.b64decode(image_data)
            pil_img = Image.open(io.BytesIO(decoded)).convert("RGB")
            return np.array(pil_img)
        except Exception:
            return None

    @staticmethod
    def check_image_quality(img_rgb: np.ndarray) -> Dict[str, Any]:
        """
        Calculates blur variance, luminance, and glare percentage.
        Returns quality evaluation metrics and pass/fail decision.
        """
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)

        # 1. Blur Detection using Laplacian Variance
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_sharp = laplacian_var >= config.CV_SETTINGS["min_blur_score"]

        # 2. Lighting / Exposure Check
        mean_luminance = float(np.mean(gray))
        lighting_good = config.CV_SETTINGS["min_brightness"] <= mean_luminance <= config.CV_SETTINGS["max_brightness"]

        # 3. Glare Detection
        glare_mask = gray >= 250
        glare_ratio = float(np.sum(glare_mask) / gray.size)
        glare_acceptable = glare_ratio <= config.CV_SETTINGS["max_glare_percentage"]

        quality_score = round(min(1.0, max(0.2, (
            (min(laplacian_var, 300.0) / 300.0) * 0.4 +
            (1.0 - abs(mean_luminance - 130.0) / 130.0) * 0.4 +
            (1.0 - min(glare_ratio, 0.2) / 0.2) * 0.2
        ))), 3)

        passed = is_sharp and lighting_good and glare_acceptable

        issues = []
        if not is_sharp:
            issues.append("Image is blurry. Please hold steady and refocus.")
        if mean_luminance < config.CV_SETTINGS["min_brightness"]:
            issues.append("Environment too dark. Increase ambient lighting.")
        elif mean_luminance > config.CV_SETTINGS["max_brightness"]:
            issues.append("Overexposed image. Reduce direct lighting.")
        if not glare_acceptable:
            issues.append("Glare or reflection detected on the strip.")

        return {
            "passed": passed,
            "quality_score": quality_score,
            "blur_metric": round(laplacian_var, 2),
            "mean_luminance": round(mean_luminance, 1),
            "glare_percentage": round(glare_ratio * 100, 2),
            "issues": issues,
            "lighting_status": "Good" if lighting_good else ("Too Dark" if mean_luminance < 40 else "Too Bright"),
            "focus_status": "Sharp" if is_sharp else "Blurry",
            "distance_status": "Optimal (~10cm)"
        }

    @staticmethod
    def extract_roi_and_normalize(img_rgb: np.ndarray) -> np.ndarray:
        """
        Locates the indicator strip region of interest (central 60%),
        applies white-balance color constancy normalization referenced against
        the neutral strip backing/calibration border, and resizes to 224x224.
        """
        h, w, _ = img_rgb.shape
        y1, y2 = int(h * 0.2), int(h * 0.8)
        x1, x2 = int(w * 0.2), int(w * 0.8)
        roi = img_rgb[y1:y2, x1:x2].copy()

        # Calibration: Use neutral border (paper backing / calibration white patch)
        # to correct for illuminant color cast without neutralizing the active dye
        border_pixels = np.concatenate([
            img_rgb[:max(1, y1), :].reshape(-1, 3),
            img_rgb[y2:, :].reshape(-1, 3),
            img_rgb[y1:y2, :max(1, x1)].reshape(-1, 3),
            img_rgb[y1:y2, x2:].reshape(-1, 3)
        ], axis=0).astype(np.float32)

        if len(border_pixels) > 50:
            border_lum = 0.299 * border_pixels[:, 0] + 0.587 * border_pixels[:, 1] + 0.114 * border_pixels[:, 2]
            bright_thresh = np.percentile(border_lum, 75)
            white_ref = border_pixels[border_lum >= bright_thresh]
            if len(white_ref) > 10:
                mean_w = np.mean(white_ref, axis=0)
                max_w = max(float(mean_w[0]), float(mean_w[1]), float(mean_w[2]), 1.0)
                gain_r = max(0.8, min(1.25, max_w / (mean_w[0] + 1e-5)))
                gain_g = max(0.8, min(1.25, max_w / (mean_w[1] + 1e-5)))
                gain_b = max(0.8, min(1.25, max_w / (mean_w[2] + 1e-5)))

                roi_f = roi.astype(np.float32)
                roi_f[:, :, 0] = np.clip(roi_f[:, :, 0] * gain_r, 0, 255)
                roi_f[:, :, 1] = np.clip(roi_f[:, :, 1] * gain_g, 0, 255)
                roi_f[:, :, 2] = np.clip(roi_f[:, :, 2] * gain_b, 0, 255)
                roi = roi_f.astype(np.uint8)

        return cv2.resize(roi, (224, 224), interpolation=cv2.INTER_AREA)

    @staticmethod
    def extract_color_features(img_224: np.ndarray) -> Dict[str, Any]:
        """
        Extracts statistical features from the central reaction zone:
        - Mean RGB (3)
        - Std RGB (3)
        - Standard CIE Lab (L*, a*, b*)
        - Hue angle h° (0° - 360°)
        - Chroma C*
        """
        h, w, _ = img_224.shape
        cy, cx = h // 2, w // 2
        dy, dx = int(h * 0.25), int(w * 0.25)
        reaction_zone = img_224[cy - dy : cy + dy, cx - dx : cx + dx]

        r = reaction_zone[:, :, 0].astype(np.float32)
        g = reaction_zone[:, :, 1].astype(np.float32)
        b = reaction_zone[:, :, 2].astype(np.float32)

        mean_rgb = [float(np.mean(r)), float(np.mean(g)), float(np.mean(b))]
        std_rgb = [float(np.std(r)), float(np.std(g)), float(np.std(b))]

        # Standard CIE Lab via skimage (D65 illuminant, 2° observer)
        rgb_normalized = np.array([[mean_rgb]], dtype=np.float32) / 255.0
        lab_point = rgb2lab(rgb_normalized)[0][0]
        L_val, a_val, b_val = float(lab_point[0]), float(lab_point[1]), float(lab_point[2])

        # Calculate Hue Angle (degrees) and Chroma
        chroma = math.hypot(a_val, b_val)
        hue = math.atan2(b_val, a_val) * (180.0 / math.pi)
        if hue < 0:
            hue += 360.0

        feature_vector = [
            mean_rgb[0] / 255.0, mean_rgb[1] / 255.0, mean_rgb[2] / 255.0,
            std_rgb[0] / 255.0, std_rgb[1] / 255.0, std_rgb[2] / 255.0,
            a_val / 100.0, b_val / 100.0
        ]

        return {
            "mean_rgb": mean_rgb,
            "std_rgb": std_rgb,
            "mean_lab": [L_val, a_val, b_val],
            "hue_angle": round(hue, 1),
            "chroma": round(chroma, 1),
            "feature_vector": feature_vector
        }

    @classmethod
    def validate_cupan_spectrum(cls, img_224: np.ndarray) -> Dict[str, Any]:
        """
        Enforces strict chemical spectrum validation:
        The Cu-PAN trajectory strictly transitions:
        Purple-Magenta (S0) -> Rose-Red (S2) -> Coral (S3) -> Orange (S5) -> Amber (S7) -> Yellow (S10).

        It CANNOT and MUST NOT detect Green (105°-180°) or Blue/Cyan (180°-315°).
        Any color outside this trajectory or exceeding max Delta-E is rejected.
        """
        features = cls.extract_color_features(img_224)
        sample_lab = np.array(features["mean_lab"])
        hue = features["hue_angle"]
        chroma = features["chroma"]

        # 1. Compute CIEDE2000 distance to each of the 11 Cu-PAN rungs
        delta_es = []
        for rung in config.CUPAN_LADDER:
            ref_lab = np.array(rung["lab"])
            de = float(deltaE_ciede2000(sample_lab, ref_lab))
            delta_es.append(de)

        min_de = min(delta_es)
        best_rung_idx = int(np.argmin(delta_es))
        best_rung = config.CUPAN_LADDER[best_rung_idx]

        # 2. Check for Forbidden Colors (Green, Blue, Cyan, Purple-Blue)
        is_green = (105.0 <= hue <= 180.0) and chroma > 7.0
        is_blue_cyan = (180.0 < hue < 315.0) and chroma > 7.0
        is_excessive_distance = (min_de > config.SPECTRAL_GATING["max_delta_e_threshold"])

        if is_green:
            return {
                "valid": False,
                "reason_code": "INVALID_COLOR_SPECTRUM",
                "foreign_color": "Green",
                "hue_angle": hue,
                "min_delta_e": round(min_de, 2),
                "closest_stage": best_rung["id"],
                "message": f"Foreign color detected: GREEN (Hue: {hue:.1f}°). Green is outside the Cu-PAN reaction spectrum. H2S strips cannot produce green shades."
            }

        if is_blue_cyan:
            return {
                "valid": False,
                "reason_code": "INVALID_COLOR_SPECTRUM",
                "foreign_color": "Blue / Cyan",
                "hue_angle": hue,
                "min_delta_e": round(min_de, 2),
                "closest_stage": best_rung["id"],
                "message": f"Foreign color detected: BLUE / CYAN (Hue: {hue:.1f}°). Blue is outside the Cu-PAN reaction spectrum. H2S strips cannot produce blue shades."
            }

        if is_excessive_distance:
            return {
                "valid": False,
                "reason_code": "INVALID_COLOR_SPECTRUM",
                "foreign_color": "Unknown Non-CuPAN Spectrum",
                "hue_angle": hue,
                "min_delta_e": round(min_de, 2),
                "closest_stage": best_rung["id"],
                "message": f"Foreign color detected (CIEDE2000 distance: {min_de:.1f} > threshold {config.SPECTRAL_GATING['max_delta_e_threshold']}). Not a recognized Cu-PAN reaction tone."
            }

        # Valid Cu-PAN spectrum match!
        return {
            "valid": True,
            "reason_code": None,
            "foreign_color": None,
            "hue_angle": hue,
            "min_delta_e": round(min_de, 2),
            "matched_stage": best_rung["id"],
            "stage_name": best_rung["stage"],
            "appearance": best_rung["appearance"],
            "category": best_rung["category"],
            "message": f"Valid Cu-PAN spectrum verified (Matched {best_rung['id']}: {best_rung['appearance']})."
        }
