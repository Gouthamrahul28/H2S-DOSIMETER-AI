"""
H2S Industrial Safety Platform - System Configuration
Master Plan & Implementation Guide v2.0
"""

import os
from pathlib import Path
from typing import Dict, Any

# Base Directories
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
MODEL_DIR = BASE_DIR / "models"
REPORTS_DIR = DATA_DIR / "reports"
FRONTEND_DIR = BASE_DIR / "frontend"

for directory in [DATA_DIR, UPLOAD_DIR, MODEL_DIR, REPORTS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Database Configuration (SQLite by default, supports PostgreSQL)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'h2s_safety.db'}")

# Security & Authentication
SECRET_KEY = os.getenv("SECRET_KEY", "h2s-industrial-safety-ultra-secure-key-2025")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Server Configuration
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", 8000))

# H2S Concentration Categories (Page 4 Specification)
H2S_CATEGORIES: Dict[str, Dict[str, Any]] = {
    "C0": {
        "class_index": 0,
        "label": "No/Negligible",
        "ppm_range": "0-1 ppm",
        "min_ppm": 0.0,
        "max_ppm": 1.0,
        "exposure_level": "Non-hazardous",
        "worker_action": "None required",
        "alert_level": "Green",
        "color_hex": "#22c55e",
        "badge_class": "badge-green"
    },
    "C1": {
        "class_index": 1,
        "label": "Low",
        "ppm_range": "1-10 ppm",
        "min_ppm": 1.0,
        "max_ppm": 10.0,
        "exposure_level": "Caution zone",
        "worker_action": "Monitor closely",
        "alert_level": "Yellow",
        "color_hex": "#eab308",
        "badge_class": "badge-yellow"
    },
    "C2": {
        "class_index": 2,
        "label": "Medium",
        "ppm_range": "10-50 ppm",
        "min_ppm": 10.0,
        "max_ppm": 50.0,
        "exposure_level": "Moderate hazard",
        "worker_action": "Enhance ventilation",
        "alert_level": "Orange",
        "color_hex": "#f97316",
        "badge_class": "badge-orange"
    },
    "C3": {
        "class_index": 3,
        "label": "High",
        "ppm_range": "50-100 ppm",
        "min_ppm": 50.0,
        "max_ppm": 100.0,
        "exposure_level": "High hazard",
        "worker_action": "Leave area immediately",
        "alert_level": "Red",
        "color_hex": "#ef4444",
        "badge_class": "badge-red"
    },
    "C4": {
        "class_index": 4,
        "label": "Critical",
        "ppm_range": ">100 ppm",
        "min_ppm": 100.0,
        "max_ppm": 500.0,
        "exposure_level": "Extreme hazard",
        "worker_action": "EVACUATE",
        "alert_level": "Red + Alarm",
        "color_hex": "#b91c1c",
        "badge_class": "badge-alarm"
    }
}

# Configurable Safety Thresholds (Page 13 Specification)
DEFAULT_SAFETY_THRESHOLDS = {
    "yellow_ppm": 5.0,    # Caution: Starts mid-C1
    "orange_ppm": 15.0,   # Moderate: Mid C2
    "red_ppm": 50.0,      # High Hazard: C3 and above
    "evac_ppm": 100.0     # Critical: Auto evacuation action
}

# Image & Computer Vision Quality Criteria (Page 7 Specification)
CV_SETTINGS = {
    "input_size": (224, 224),
    "min_blur_score": 100.0,      # Laplacian variance threshold
    "min_brightness": 40,         # Minimum acceptable mean luminance
    "max_brightness": 240,        # Maximum acceptable mean luminance
    "max_glare_percentage": 0.15  # Max proportion of blown-out white pixels
}

# Active AI Model Version
DEFAULT_MODEL_VERSION = "v1.0"
