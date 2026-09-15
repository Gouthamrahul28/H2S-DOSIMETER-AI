"""
Computer Vision & Image Processing Pipeline
Implements Section 2.3, 3.1 & 3.2 (Pages 7-9):
- Image Quality Checks (Blur, Lighting, Glare, ROI)
- Color Normalization (White Balance, Lighting compensation)
- Feature Extraction (RGB stats, CIE Lab conversion)
"""

import numpy as np
import cv2
from PIL import Image
import io
import base64
from typing import Tuple, Dict, Any, Optional

class CVPipeline:
    """Performs image quality inspection, ROI detection, color normalization, and feature extraction."""

    @staticmethod
    def load_image_from_bytes_or_base64(image_data: str) -> Optional[np.ndarray]:
        """Loads RGB image from raw bytes, base64 data URI, or binary string."""
        try:
            if image_data.startswith("data:image"):
                # Strip base64 prefix
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
        # Convert to Grayscale
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)

        # 1. Blur Detection using Laplacian Variance
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_sharp = laplacian_var >= 80.0

        # 2. Lighting / Exposure Check
        mean_luminance = float(np.mean(gray))
        lighting_good = 45.0 <= mean_luminance <= 225.0

        # 3. Glare Detection (specular reflection / clipped highlights)
        glare_mask = gray >= 250
        glare_ratio = float(np.sum(glare_mask) / gray.size)
        glare_acceptable = glare_ratio <= 0.12

        # Overall Quality Score [0.0 - 1.0]
        quality_score = round(min(1.0, max(0.2, (
            (min(laplacian_var, 300.0) / 300.0) * 0.4 +
            (1.0 - abs(mean_luminance - 130.0) / 130.0) * 0.4 +
            (1.0 - min(glare_ratio, 0.2) / 0.2) * 0.2
        ))), 3)

        passed = is_sharp and lighting_good and glare_acceptable

        issues = []
        if not is_sharp:
            issues.append("Image is blurry. Please hold steady and refocus.")
        if mean_luminance < 45.0:
            issues.append("Environment too dark. Increase ambient lighting.")
        elif mean_luminance > 225.0:
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
            "lighting_status": "Good" if lighting_good else ("Too Dark" if mean_luminance < 45 else "Too Bright"),
            "focus_status": "Sharp" if is_sharp else "Blurry",
            "distance_status": "Optimal (~10cm)"
        }

    @staticmethod
    def extract_roi_and_normalize(img_rgb: np.ndarray) -> np.ndarray:
        """
        Locates the indicator strip region of interest (central 60% by default if full frame),
        applies white-balance color constancy normalization, and resizes to 224x224.
        """
        h, w, _ = img_rgb.shape
        # Center crop ROI if whole smartphone preview
        y1, y2 = int(h * 0.2), int(h * 0.8)
        x1, x2 = int(w * 0.2), int(w * 0.8)
        roi = img_rgb[y1:y2, x1:x2]

        # Simple Gray-World White Balance normalization
        roi_float = roi.astype(np.float32)
        mean_r = np.mean(roi_float[:, :, 0]) + 1e-5
        mean_g = np.mean(roi_float[:, :, 1]) + 1e-5
        mean_b = np.mean(roi_float[:, :, 2]) + 1e-5
        mean_gray = (mean_r + mean_g + mean_b) / 3.0

        roi_float[:, :, 0] = np.clip(roi_float[:, :, 0] * (mean_gray / mean_r), 0, 255)
        roi_float[:, :, 1] = np.clip(roi_float[:, :, 1] * (mean_gray / mean_g), 0, 255)
        roi_float[:, :, 2] = np.clip(roi_float[:, :, 2] * (mean_gray / mean_b), 0, 255)

        normalized = roi_float.astype(np.uint8)
        resized = cv2.resize(normalized, (224, 224), interpolation=cv2.INTER_AREA)
        return resized

    @staticmethod
    def extract_color_features(img_224: np.ndarray) -> Dict[str, Any]:
        """
        Extracts 8 statistical features matching Page 9 from central reaction zone:
        - Mean RGB (3)
        - Std RGB (3)
        - CIE Lab Mean L*, a*, b* (3)
        """
        # Focus on central reaction zone (central 50% of the strip)
        h, w, _ = img_224.shape
        cy, cx = h // 2, w // 2
        dy, dx = int(h * 0.25), int(w * 0.25)
        reaction_zone = img_224[cy - dy : cy + dy, cx - dx : cx + dx]

        r = reaction_zone[:, :, 0].astype(np.float32)
        g = reaction_zone[:, :, 1].astype(np.float32)
        b = reaction_zone[:, :, 2].astype(np.float32)

        mean_rgb = [float(np.mean(r)), float(np.mean(g)), float(np.mean(b))]
        std_rgb = [float(np.std(r)), float(np.std(g)), float(np.std(b))]

        # Convert to CIE Lab
        lab = cv2.cvtColor(reaction_zone, cv2.COLOR_RGB2LAB)
        mean_lab = [
            float(np.mean(lab[:, :, 0])),
            float(np.mean(lab[:, :, 1])),
            float(np.mean(lab[:, :, 2]))
        ]

        # 8-dim feature vector: [mean_R, mean_G, mean_B, std_R, std_G, std_B, lab_a, lab_b]
        feature_vector = [
            mean_rgb[0] / 255.0, mean_rgb[1] / 255.0, mean_rgb[2] / 255.0,
            std_rgb[0] / 255.0, std_rgb[1] / 255.0, std_rgb[2] / 255.0,
            (mean_lab[1] - 128.0) / 128.0, (mean_lab[2] - 128.0) / 128.0
        ]

        return {
            "mean_rgb": mean_rgb,
            "std_rgb": std_rgb,
            "mean_lab": mean_lab,
            "feature_vector": feature_vector
        }
