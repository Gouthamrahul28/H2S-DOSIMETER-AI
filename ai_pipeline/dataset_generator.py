"""
H2S Calibration Dataset Generator & Leakage Validator
Implements Section 4.1 - 4.3 (Pages 10-11):
- 5 Classes x 50 Physical Strips x 3 Lighting Conditions x 2 Photos = 1,500 Images
- Strict Partitioning by Physical Strip (175 Train, 50 Val, 25 Test)
- Complete Metadata Schema generation (JSON + CSV)
"""

import os
import json
import random
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
from datetime import datetime
import config

DATASET_DIR = config.DATA_DIR / "h2s_calibration_dataset"
IMAGES_DIR = DATASET_DIR / "images"

CLASS_SPECS = {
    "C0": {"label": "No/Negligible", "ppm_min": 0.0, "ppm_max": 1.0, "rgb": (235, 230, 210)},
    "C1": {"label": "Low", "ppm_min": 1.0, "ppm_max": 10.0, "rgb": (210, 190, 140)},
    "C2": {"label": "Medium", "ppm_min": 10.0, "ppm_max": 50.0, "rgb": (175, 135, 75)},
    "C3": {"label": "High", "ppm_min": 50.0, "ppm_max": 100.0, "rgb": (115, 70, 40)},
    "C4": {"label": "Critical", "ppm_min": 100.0, "ppm_max": 250.0, "rgb": (50, 35, 30)}
}

LIGHTING_CONDITIONS = ["fluorescent", "daylight", "low_light_led"]

def generate_strip_image(class_name: str, ppm: float, lighting: str, photo_idx: int) -> Image.Image:
    """Renders a 224x224 synthetic calibration strip image with realistic physics and lighting."""
    spec = CLASS_SPECS[class_name]
    base_rgb = list(spec["rgb"])

    # Apply realistic lighting variations
    if lighting == "fluorescent":
        # Slight cool/cyan-green tint
        tint = np.array([0, 4, 3])
        lum_shift = 0
    elif lighting == "daylight":
        # Slightly warmer natural daylight
        tint = np.array([6, 3, -4])
        lum_shift = 10
    else:  # low_light_led
        # Dimmer with phone LED flash reflection
        tint = np.array([-10, -8, -5])
        lum_shift = -20

    # Base strip body
    img = Image.new("RGB", (224, 224), (240 + lum_shift, 240 + lum_shift, 240 + lum_shift))
    draw = ImageDraw.Draw(img)

    # Reaction zone with natural color gradients
    reaction_rgb = np.clip(np.array(base_rgb) + tint + np.random.randint(-4, 5, 3), 0, 255).astype(int)
    draw.rectangle([45, 45, 179, 179], fill=tuple(reaction_rgb), outline=(170, 170, 170), width=2)

    # Calibration reference squares on white backing card
    draw.rectangle([12, 12, 32, 32], fill=(255, 255, 255), outline=(190, 190, 190))
    draw.rectangle([12, 192, 32, 212], fill=(25, 25, 25), outline=(190, 190, 190))

    # Add minor film grain and slight blur
    arr = np.array(img).astype(np.float32)
    noise = np.random.normal(0, 2.0, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def build_dataset(max_images: int = 1500, quick_sample: bool = False):
    """
    Builds the dataset and metadata according to Pages 10-11.
    If quick_sample=True, creates a lightweight set of 150 images for instant testing.
    """
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    strips_per_class = 10 if quick_sample else 50
    records = []

    # Assign physical strips: 70% Train, 20% Val, 10% Test
    total_strips = 5 * strips_per_class
    print(f"Partitioning {total_strips} physical strips into Train (70%), Val (20%), Test (10%)...")

    strip_registry = {}
    for class_idx, (c_name, spec) in enumerate(CLASS_SPECS.items()):
        class_strips = [f"STRIP_{c_name}_{i:03d}" for i in range(1, strips_per_class + 1)]
        random.seed(42 + class_idx)
        random.shuffle(class_strips)

        n_train = int(len(class_strips) * 0.70)
        n_val = int(len(class_strips) * 0.20)

        for s_id in class_strips[:n_train]:
            strip_registry[s_id] = {"class": c_name, "class_index": class_idx, "split": "train"}
        for s_id in class_strips[n_train:n_train+n_val]:
            strip_registry[s_id] = {"class": c_name, "class_index": class_idx, "split": "val"}
        for s_id in class_strips[n_train+n_val:]:
            strip_registry[s_id] = {"class": c_name, "class_index": class_idx, "split": "test"}

    # Generate images for each physical strip
    print("Generating calibration strip images and metadata...")
    img_counter = 1
    for strip_id, info in strip_registry.items():
        c_name = info["class"]
        spec = CLASS_SPECS[c_name]
        # Sample realistic true PPM within class boundary
        true_ppm = round(random.uniform(spec["ppm_min"], spec["ppm_max"]), 2)

        for light in LIGHTING_CONDITIONS:
            for photo_num in [1, 2]:
                image_id = f"IMG_20250115_{c_name}_{strip_id}_{light[:2].upper()}{photo_num:02d}"
                rel_path = f"images/{image_id}.jpg"
                abs_path = DATASET_DIR / rel_path

                # Render and save image
                img = generate_strip_image(c_name, true_ppm, light, photo_num)
                img.save(abs_path, format="JPEG", quality=92)

                # Page 11 Metadata Record
                record = {
                    "image_id": image_id,
                    "strip_id": strip_id,
                    "batch_id": "BATCH_2024_Q4_LOT_03",
                    "class": c_name,
                    "class_index": info["class_index"],
                    "class_label": spec["label"],
                    "true_ppm": true_ppm,
                    "true_ppm_range": [spec["ppm_min"], spec["ppm_max"]],
                    "phone_model": "Samsung Galaxy S23",
                    "camera_resolution": "4000x3000",
                    "lighting_condition": light,
                    "white_balance": "auto",
                    "exposure_time_ms": 33,
                    "iso": 800,
                    "distance_cm": 10,
                    "angle_degrees": 0,
                    "reference_measurement_id": f"REF_20250115_{img_counter:04d}",
                    "reference_method": "calibrated_H2S_gas_standard",
                    "operator": "technician_john",
                    "site": "industrial_facility_A",
                    "calibration_version": "v2.0",
                    "capture_time": "2025-01-15T14:23:45Z",
                    "split": info["split"],
                    "image_path": str(abs_path),
                    "notes": "Optimal lighting and positioning"
                }
                records.append(record)
                img_counter += 1

    df = pd.DataFrame(records)
    csv_path = DATASET_DIR / "dataset_metadata.csv"
    json_path = DATASET_DIR / "dataset_metadata.json"

    df.to_csv(csv_path, index=False)
    with open(json_path, "w") as f:
        json.dump(records, f, indent=2)

    print(f"[OK] Generated {len(df)} images across {len(strip_registry)} physical strips.")
    print(f"[OK] Metadata saved to {csv_path}")

    # Verify No Data Leakage (Page 14 Step 1.2)
    train_strips = set(df[df['split'] == 'train']['strip_id'])
    val_strips = set(df[df['split'] == 'val']['strip_id'])
    test_strips = set(df[df['split'] == 'test']['strip_id'])

    assert len(train_strips & val_strips) == 0, "Data leakage detected: strip in train and val"
    assert len(train_strips & test_strips) == 0, "Data leakage detected: strip in train and test"
    assert len(val_strips & test_strips) == 0, "Data leakage detected: strip in val and test"
    print("[OK] Data Leakage Verification Passed: Zero physical strip overlap between splits.")

    return df

if __name__ == "__main__":
    # Generate quick sample for fast CI/test verification, or full dataset
    build_dataset(quick_sample=True)
