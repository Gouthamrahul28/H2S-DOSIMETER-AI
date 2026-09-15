"""
H2S Industrial Safety Platform - System Configuration
Master Plan & Implementation Guide v2.0
Featuring SIH26118 Cu-PAN (Purple -> Yellow) Calibration Color Reference Scale
"""

import os
from pathlib import Path
from typing import Dict, Any, List

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

# ============================================================================
# SIH26118 Cu-PAN Chemical Indicator Reference Ladder (Tier 2 Scientific Spec)
# Reaction: Cu(II)–PAN + H2S -> CuS (solid) + PAN (free ligand) + 2 H+
# Trajectory: Deep Purple-Magenta -> Coral -> Orange -> Amber -> Yellow
# Dominant Axis: Hue angle h° with rising L*
# ============================================================================
CUPAN_LADDER: List[Dict[str, Any]] = [
    {
        "id": "S0", "index": 0, "stage": "Intact Cu(II)–PAN",
        "lab": [42.0, 38.0, -12.0], "rgb": [149, 73, 120], "hex": "#954978",
        "hue": 342.5, "appearance": "Intact Cu(II)–PAN complex, deep purple-magenta", "category": "C0"
    },
    {
        "id": "S1", "index": 1, "stage": "First Cu displacement",
        "lab": [46.0, 42.0, -2.0], "rgb": [171, 78, 114], "hex": "#AB4E72",
        "hue": 357.3, "appearance": "Magenta, first copper displacement", "category": "C0"
    },
    {
        "id": "S2", "index": 2, "stage": "Rose-Red",
        "lab": [51.0, 44.0, 10.0], "rgb": [193, 88, 106], "hex": "#C1586A",
        "hue": 12.8, "appearance": "Rose-red", "category": "C1"
    },
    {
        "id": "S3", "index": 3, "stage": "Coral",
        "lab": [56.0, 42.0, 22.0], "rgb": [209, 102, 98], "hex": "#D16662",
        "hue": 27.6, "appearance": "Coral — hue rotating out of magenta quadrant", "category": "C1"
    },
    {
        "id": "S4", "index": 4, "stage": "Salmon-Orange",
        "lab": [62.0, 36.0, 34.0], "rgb": [223, 122, 91], "hex": "#DF7A5B",
        "hue": 43.4, "appearance": "Salmon-orange", "category": "C2"
    },
    {
        "id": "S5", "index": 5, "stage": "Orange",
        "lab": [68.0, 28.0, 46.0], "rgb": [233, 144, 83], "hex": "#E99053",
        "hue": 58.7, "appearance": "Orange", "category": "C2"
    },
    {
        "id": "S6", "index": 6, "stage": "Amber-Orange",
        "lab": [73.0, 18.0, 56.0], "rgb": [236, 165, 74], "hex": "#ECA54A",
        "hue": 72.2, "appearance": "Amber-orange", "category": "C2"
    },
    {
        "id": "S7", "index": 7, "stage": "Amber",
        "lab": [78.0, 8.0, 64.0], "rgb": [238, 185, 68], "hex": "#EEB944",
        "hue": 82.9, "appearance": "Amber", "category": "C3"
    },
    {
        "id": "S8", "index": 8, "stage": "Golden Yellow",
        "lab": [82.0, 0.0, 70.0], "rgb": [239, 201, 62], "hex": "#EFC93E",
        "hue": 90.0, "appearance": "Golden yellow", "category": "C3"
    },
    {
        "id": "S9", "index": 9, "stage": "Yellow",
        "lab": [85.0, -4.0, 74.0], "rgb": [243, 211, 59], "hex": "#F3D33B",
        "hue": 93.1, "appearance": "Yellow, most copper displaced as CuS", "category": "C4"
    },
    {
        "id": "S10", "index": 10, "stage": "Free PAN (Ceiling)",
        "lab": [87.0, -6.0, 78.0], "rgb": [247, 218, 52], "hex": "#F7DA34",
        "hue": 94.4, "appearance": "Free PAN — response ceiling, full yellow", "category": "C4"
    }
]

# Strict Spectral Gating Constraints
# Cu-PAN reaction only spans Purple-Magenta (320°-360°) and Red-Coral-Orange-Yellow (0°-105°).
# Greens (106°-179°) and Blues (180°-319°) are strictly rejected.
SPECTRAL_GATING = {
    "allowed_hue_ranges": [(315.0, 360.0), (0.0, 105.0)],
    "forbidden_zones": [
        {"name": "Green", "hue_range": (106.0, 180.0)},
        {"name": "Cyan / Blue", "hue_range": (181.0, 270.0)},
        {"name": "Indigo / Violet", "hue_range": (271.0, 314.0)}
    ],
    "max_delta_e_threshold": 22.0  # Max CIEDE2000 from nearest Cu-PAN ladder rung
}

# H2S Concentration Categories (Mapped to Cu-PAN Chemistry)
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
        "color_hex": "#954978",  # Cu-PAN S0 Purple-Magenta
        "badge_class": "badge-green",
        "chemical_appearance": "Deep Purple-Magenta (Intact Cu(II)-PAN)"
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
        "color_hex": "#C1586A",  # Cu-PAN S2 Rose-Red / S3 Coral
        "badge_class": "badge-yellow",
        "chemical_appearance": "Rose-Red to Coral"
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
        "color_hex": "#DF7A5B",  # Cu-PAN S4 Salmon / S5 Orange
        "badge_class": "badge-orange",
        "chemical_appearance": "Salmon-Orange to Amber-Orange"
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
        "color_hex": "#EEB944",  # Cu-PAN S7 Amber / S8 Golden Yellow
        "badge_class": "badge-red",
        "chemical_appearance": "Amber to Golden Yellow"
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
        "color_hex": "#F7DA34",  # Cu-PAN S10 Pure Yellow
        "badge_class": "badge-alarm",
        "chemical_appearance": "Free PAN Yellow (Full Copper Stripped)"
    }
}

# Configurable Safety Thresholds (Page 13 Specification)
DEFAULT_SAFETY_THRESHOLDS = {
    "yellow_ppm": 5.0,    # Caution: Starts mid-C1
    "orange_ppm": 15.0,   # Moderate: Mid C2
    "red_ppm": 50.0,      # High Hazard: C3 and above
    "evac_ppm": 100.0     # Critical: Auto evacuation action
}

# Image & Computer Vision Quality Criteria
CV_SETTINGS = {
    "input_size": (224, 224),
    "min_blur_score": 80.0,
    "min_brightness": 40,
    "max_brightness": 240,
    "max_glare_percentage": 0.15
}

# Active AI Model Version
DEFAULT_MODEL_VERSION = "v1.0"
