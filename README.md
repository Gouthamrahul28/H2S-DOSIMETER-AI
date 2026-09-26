# 🏭 H₂S Industrial Worker Safety Platform (v2.0)

[![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.2+-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![OpenCV](https://img.shields.io/badge/OpenCV-4.9+-5C3EE8?logo=opencv&logoColor=white)](https://opencv.org/)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release: v2.0.0](https://img.shields.io/badge/Release-v2.0.0-emerald)](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v2.0.0)

> **Next-Generation Cyber-Physical Optical Dosimeter & Industrial Safety Platform**  
> Transforms standard smartphone cameras into lab-grade colorimetric sensors to quantify toxic **Hydrogen Sulfide ($H_2S$)** gas exposure from **Cu-PAN chemical strips**, rejects counterfeit reactions using spectral physics, and tracks plant-wide OSHA/ACGIH shift dosimetry with tamper-evident cryptographic trust.

---

## 📑 Table of Contents

- [The Industrial Challenge](#-the-industrial-challenge)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
  - [1. Cu-PAN Optical Chemistry & 11-Stage Reference Ladder](#1-cu-pan-optical-chemistry--11-stage-reference-ladder)
  - [2. Computer Vision Pipeline & Spectral Physics Gatekeeper](#2-computer-vision-pipeline--spectral-physics-gatekeeper)
  - [3. Dual Edge AI Inference Engine](#3-dual-edge-ai-inference-engine)
  - [4. Supervisor Operations & Dosimetry Center](#4-supervisor-operations--dosimetry-center)
  - [5. Worker Smartphone PWA Scanner](#5-worker-smartphone-pwa-scanner)
  - [6. Badge Stock, Wristband Lab & Virgin QC](#6-badge-stock-wristband-lab--virgin-qc)
  - [7. Multi-Tier Versioning & Undo Engine](#7-multi-tier-versioning--undo-engine)
- [Project Directory Structure](#-project-directory-structure)
- [Quick Start Guide](#-quick-start-guide)
  - [Prerequisites](#prerequisites)
  - [Installation & Launch](#installation--launch)
  - [Pre-Seeded Test Credentials](#pre-seeded-test-credentials)
- [Automated Test Suite](#-automated-test-suite)
- [Cloud & Container Deployment](#-cloud--container-deployment)
- [Git Version History & Legacy Rollback](#-git-version-history--legacy-rollback)
- [Scientific & Regulatory Standards](#-scientific--regulatory-standards)
- [License](#-license)

---

## ☠️ The Industrial Challenge

**Hydrogen Sulfide ($H_2S$)** is a lethal, colorless gas prevalent in petroleum refineries, drilling rigs, wastewater treatment plants, and chemical synthesis units:

* **10 ppm** — OSHA Permissible Exposure Limit (PEL) 8-hour Time-Weighted Average (TWA).
* **15 ppm** — ACGIH Short-Term Exposure Limit (STEL, 15 minutes).
* **50 ppm** — NIOSH Immediately Dangerous to Life or Health (IDLH).
* **100 ppm** — Complete olfactory nerve paralysis (**sense of smell disappears instantly**; victims believe the hazard has passed).
* **500–1000 ppm** — Immediate respiratory collapse and fatal asphyxiation within breaths.

**The Flaw with Legacy Hardware:**  
Traditional electrochemical personal gas monitors cost **$1,500+ each**, suffer from sensor poisoning, require frequent recalibration gas bottles, and fail silently without immediate visual indication. 

**The H₂S Dosimeter AI Solution:**  
Every frontline worker already carries a smartphone with an ultra-high-resolution 4K camera. By pairing low-cost, disposable **Cu-PAN chemical indicator strips / wristbands** with edge AI computer vision, this platform turns smartphone cameras into verified, lab-grade gas dosimeters with continuous exposure records, audit trails, and instant emergency alerts.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND PRESENTATION                           │
│  Supervisor Dashboard (index.html)   │   Worker Mobile PWA (worker.html)│
│  Vanilla ES6+ Modules, Responsive    │   HTML5 Media Capture, Camera API│
│  Custom SVG Charting Engines         │   Instant Cu-PAN Color Feedback  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST / JSON / Multipart
┌───────────────────────────────────▼────────────────────────────────────┐
│                        BACKEND API & SERVICES                          │
│  FastAPI (Asynchronous Python 3.13) + Uvicorn ASGI Server               │
│  JWT Authentication  │  Single-Use Strip Gating  │  OSHA Alert Engine  │
└──────────────────┬─────────────────┬───────────────────┬───────────────┘
                   │                 │                   │
┌──────────────────▼────────┐ ┌──────▼─────────────┐ ┌───▼───────────────┐
│     AI & COMPUTER VISION  │ │  DATABASE & STATE  │ │   UNDO & ROLLBACK │
│ MobileNetV3-Small (PyTorch│ │ SQLite 3           │ │ Git Subprocess    │
│ OpenCV (BGR→Lab, Hue)     │ │ SQLAlchemy 2.0 ORM │ │ Model Registry    │
│ CIEDE2000 ΔE00 Gating     │ │ Pydantic v2 Models │ │ Threshold History │
└───────────────────────────┘ └────────────────────┘ └───────────────────┘
```

---

## ✨ Key Features

### 1. Cu-PAN Optical Chemistry & 11-Stage Reference Ladder
The sensing medium is based on **Copper(II) 1-(2-Pyridylazo)-2-naphthol (Cu-PAN)** chelation chemistry. When exposed to airborne $H_2S$, copper ions are scavenged to form insoluble copper sulfide precipitate, liberating yellow free PAN ligand:

$$\text{Cu(II)-PAN } [\text{Deep Purple-Magenta}] + \text{H}_2\text{S} \longrightarrow \text{CuS}\downarrow + \text{Free PAN } [\text{Yellow}] + 2\text{H}^+$$

The system models the reaction across an **11-stage reference scale ($S_0 \rightarrow S_{10}$)**:
* **$S_0$ ($0.0\text{ ppm}$)**: `#954978` (Deep Purple-Magenta, Intact Chelate)
* **$S_2$ ($2.5\text{ ppm}$)**: `#C1586A` (Rose-Red, First copper displacement)
* **$S_4$ ($12.0\text{ ppm}$)**: `#DF7A5B` (Salmon-Orange, OSHA PEL threshold)
* **$S_6$ ($38.0\text{ ppm}$)**: `#ECA44C` (Amber-Orange, Severe hazard)
* **$S_8$ ($72.0\text{ ppm}$)**: `#F2C93E` (Golden Yellow, IDLH zone)
* **$S_{10}$ ($110.0\text{ ppm}$)**: `#F7DA34` (Intense Yellow, Full chemical saturation)

---

### 2. Computer Vision Pipeline & Spectral Physics Gatekeeper
Every camera scan undergoes rigorous physical verification before AI processing:
1. **Perspective Rectification & ROI Extraction**: Normalizes perspective angle and crops to the central 60% chemical core.
2. **Shadow & Illumination Compensation**: Converts $BGR \rightarrow \text{CIE } L^*a^*b^*$ to isolate chromaticity from ambient lighting variance.
3. **Spectral Hue Gatekeeper**:
   - Computes cylindrical hue angle: $h = \text{atan2}(b^*, a^*) \times \frac{180}{\pi}$.
   - **Strictly rejects Green ($106^\circ \le h \le 180^\circ$) and Blue/Cyan ($181^\circ \le h \le 314^\circ$)** with `HTTP 422 INVALID_COLOR_SPECTRUM`. Green and blue colors are physically impossible in Cu-PAN reactions and indicate alien stains, glare, or tampering.
4. **CIEDE2000 ($\Delta E_{00}$) Out-of-Gamut Detection**:
   $$\Delta E_{00} = \min_{i \in [0, 10]} \Delta E_{00}(\text{Sample}, \text{Rung}_i)$$
   Samples exceeding $\Delta E_{00} > 22.0$ are flagged as invalid/counterfeit.

---

### 3. Dual Edge AI Inference Engine
- **PyTorch MobileNetV3-Small**: Ultra-lightweight deep convolutional neural network fine-tuned for chemical paper substrates with sub-50ms inference latency.
- **CIELAB $a^*$ Polynomial Regression**: Linear dynamic range fit:
  $$a^* = 4.65 + 4.34 \cdot [\text{H}_2\text{S}] \quad (R^2 = 0.99070)$$
  Provides continuous PPM estimation with smooth saturation plateauing at $a^* = 11.0$.

---

### 4. Supervisor Operations & Dosimetry Center
- **Live Plant Operations**: Real-time worker cards, facility telemetry, and instant hazard alerts.
- **Facility Spatiotemporal Risk Heatmap**: Tracks localized gas accumulation across plant sectors.
- **OSHA 8-Hour TWA Dosimetry**: Calculates cumulative Time-Weighted Average exposure per worker across work shifts.
- **Zero-Dependency SVG Charting**:
  - Interactive Cu-PAN Calibration Curve ($R^2 = 0.99070$)
  - 1:1 Regression Parity Plot with $\pm 10\%$ tolerance cone
  - 25-epoch AI training learning curve with hover tooltips
  - 5x5 Confusion Matrix across 1,500 test samples

---

### 5. Worker Smartphone PWA Scanner
- **Zero-Install PWA**: Operates in any mobile browser with service worker offline caching.
- **Camera Viewfinder**: HTML5 Media Capture API with tap-to-focus, camera torch support, and live ROI targeting guides.
- **One-Tap Demo Presets**: Instant simulation of unexposed, PEL threshold, and emergency evacuation strips for training drills.
- **Immediate Worker Feedback**: Clear color-coded hazard badges (Safe, Warning, Critical Evacuation) with audible cues.

---

### 6. Badge Stock, Wristband Lab & Virgin QC
- **Batch Tracking**: Tracks badge rolls, lot numbers, 90-day shelf life, and remaining inventory.
- **Virgin Baseline QC Certification**: Enforces pre-deployment $\Delta E_{00} \le 3.0$ tolerance testing against unreacted purple-magenta baseline.
- **Wristband QR Auto-Binding**:
  - Built-in zero-dependency SVG QR generator ([`qr_generator.js`](file:///d:/H2S%20DOSIMETER%20AI%20-%20Copy/frontend/js/qr_generator.js)).
  - Encodes Worker ID, Batch ID, and chemistry for 1-tap smartphone binding and label printing.
- **3D Hardware Libraries**: Includes Three.js and OrbitControls vendor bundles for physical wristband visualization.

---

### 7. Multi-Tier Versioning & Undo Engine
- **Tier 1 (Code & Deployment)**: Automated Git checkpoints, tagged releases, and programmatic 1-command rollback ([`undo.py`](file:///d:/H2S%20DOSIMETER%20AI%20-%20Copy/undo.py)).
- **Tier 2 (Safety Thresholds)**: Database versioning table (`SafetyThresholdHistory`) recording timestamped snapshots of alarm thresholds (`CFG_YYYYMMDD_HHMMSS`) with 1-click restore.
- **Tier 3 (AI Model Registry)**: Zero-downtime hot-swapping between model versions (`v0.9`, `v1.0`, `v1.1`) without server restarts.
- **Cryptographic Audit Trail**: Every scan and supervisor approval is sealed with an immutable SHA-256 digital fingerprint.

---

## 📁 Project Directory Structure

```text
H2S-DOSIMETER-AI/
├── ai_pipeline/                  # Deep learning training & evaluation pipelines
│   ├── dataset_generator.py      # Synthetic Cu-PAN image generation engine
│   ├── model.py                  # PyTorch MobileNetV3-Small architecture
│   └── train.py                  # Multi-epoch training & validation loop
├── backend/                      # FastAPI asynchronous application
│   ├── main.py                   # FastAPI app entrypoint, middleware & routing
│   ├── database.py               # SQLAlchemy ORM session & engine setup
│   ├── models.py                 # SQLite database schema models
│   ├── seed_data.py              # Pre-seeded workers, batches, and historical scans
│   ├── routers/                  # Modular API controllers
│   │   ├── auth.py               # Worker & supervisor authentication (JWT)
│   │   ├── workers.py            # Worker roster & shift analytics
│   │   ├── strips.py             # Single-use strip gating & batch QC
│   │   ├── scans.py              # Camera upload & inference endpoints
│   │   ├── supervisor_monitoring.py # Plant telemetry & OSHA TWA monitor
│   │   ├── supervisor_ai.py      # Model registry & calibration curves
│   │   ├── supervisor_safety.py  # Safety threshold history & 1-click undo
│   │   └── audit.py              # Immutable cryptographic audit trail
│   └── services/                 # Business logic & algorithms
│       ├── cv_pipeline.py        # OpenCV ROI extraction & CIE Lab conversion
│       ├── ai_inference.py       # PyTorch & regression prediction engine
│       └── colorimetry.py        # CIEDE2000 ΔE00 & spectral hue validation
├── frontend/                     # Pure Vanilla ES6+ Web Applications
│   ├── index.html                # Supervisor Operations Dashboard
│   ├── worker.html               # Worker Mobile Camera PWA Scanner
│   ├── sw.js                     # Offline Service Worker
│   ├── manifest.json             # Progressive Web App manifest
│   ├── css/
│   │   └── style.css             # Cyber-industrial design system (Dark mode)
│   └── js/
│       ├── app.js                # Supervisor dashboard state machine & SVG charts
│       ├── worker.js             # Mobile camera capture & scan submission
│       ├── api.js                # Centralized REST client
│       ├── qr_generator.js       # Zero-dependency SVG QR code generator
│       └── vendor/               # 3D hardware visualizer dependencies
│           ├── three.min.js      # Three.js 3D WebGL engine
│           └── OrbitControls.js  # Camera controls
├── data/                         # Persistent storage
│   ├── h2s_safety.db             # SQLite operational database
│   ├── uploads/                  # Uploaded dosimeter scan images
│   └── h2s_calibration_dataset/  # Reference calibration image dataset
├── tests/                        # Comprehensive automated test suite
│   ├── conftest.py               # Test fixtures & temporary test databases
│   └── test_platform.py          # End-to-end API, CV, and safety tests
├── config.py                     # Centralized system & chemical ladder config
├── run.py                        # Application bootstrapper & local IP discovery
├── undo.py                       # CLI versioning, checkpoint & rollback tool
├── Dockerfile                    # Containerization specification
├── render.yaml                   # Cloud deployment manifest (Render.com)
├── Procfile                      # Process file for cloud container runners
├── requirements.txt              # Production Python dependencies
├── requirements-train.txt        # Model training dependencies (PyTorch/Torchvision)
└── TECH_STACK.md                 # In-depth technical specification
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10 to 3.13** installed
- Git CLI

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI.git
   cd H2S-DOSIMETER-AI
   ```

2. **Create and activate a virtual environment:**
   ```bash
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Launch the platform:**
   ```bash
   python run.py
   ```

5. **Open in your browser:**
   - 🖥️ **Supervisor Dashboard**: [http://localhost:8000/](http://localhost:8000/)
   - 📱 **Worker Mobile Scanner**: [http://localhost:8000/worker](http://localhost:8000/worker)
   - 📖 **Interactive API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - 🩺 **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

### 🔑 Pre-Seeded Test Credentials

| Role | Worker / Badge ID | PIN | Name | Department |
| :--- | :--- | :--- | :--- | :--- |
| **Worker 1** | `EMP_00542` / `BDG-542` | `1234` | John Martinez | Refinery Operations |
| **Worker 2** | `EMP_00108` / `BDG-108` | `5678` | Sarah Jenkins | Sulfur Recovery Unit |
| **Worker 3** | `EMP_00329` / `BDG-329` | `9012` | David Chen | Pipeline Distribution |

---

## 🧪 Automated Test Suite

The project includes an end-to-end test suite covering API endpoints, single-use gating, CIEDE2000 colorimetric rejection, batch baseline Delta-E testing, and model rollbacks:

```bash
# Run all tests
pytest tests/ -v

# Run with coverage report
pytest --cov=backend tests/
```

---

## 🐳 Cloud & Container Deployment

### Running with Docker
```bash
# Build the Docker image
docker build -t h2s-dosimeter-ai:v2.0 .

# Run the container
docker run -d -p 8000:8000 --name h2s-platform h2s-dosimeter-ai:v2.0
```

### 1-Click Cloud Deployment (Render / Railway)
The project includes ready-to-deploy cloud manifests:
- [`render.yaml`](file:///d:/H2S%20DOSIMETER%20AI%20-%20Copy/render.yaml): Configured for Render Web Services.
- [`Procfile`](file:///d:/H2S%20DOSIMETER%20AI%20-%20Copy/Procfile): Compatible with Heroku, Railway, and Dokku.

---

## 🔄 Git Version History & Legacy Rollback

This repository maintains full version continuity with immutable release tags and a dedicated legacy branch:

| Version | Git Reference | Purpose |
| :--- | :--- | :--- |
| **Current Platform** | `main` / [`v2.0.0`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v2.0.0) | Complete v2.0 release: Cu-PAN calibration, worker PWA, supervisor telemetry, and 3D vendor libraries |
| **Previous Stable** | [`v1-legacy`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/tree/v1-legacy) / [`v1.4.1`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v1.4.1) | Preserved legacy branch before v2.0 upgrade |
| **Milestone v1.4** | [`v1.4.0`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v1.4.0) | AI Feature Correlation Heatmap & Facility Spatiotemporal Risk Heatmap |
| **Milestone v1.3** | [`v1.3.0`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v1.3.0) | Interactive Cu-PAN Calibration Curve & Regression Parity Plot |
| **Milestone v1.2** | [`v1.2.0`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v1.2.0) | AI Model accuracy graphs (25-epoch curve, sensitivity breakdown) |
| **Milestone v1.1** | [`v1.1.0`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v1.1.0) | 11-stage reference scale and spectral rejection of blues/greens |
| **Initial Base** | [`v1.0.0`](https://github.com/Gouthamrahul28/H2S-DOSIMETER-AI/releases/tag/v1.0.0) | Initial full platform implementation |

### How to Switch Back to the Previous Version Anytime:
```bash
# Switch to the legacy branch
git checkout v1-legacy

# Or switch to the specific v1.4.1 release tag
git checkout tags/v1.4.1

# Switch back to the latest v2.0.0 release
git checkout main
```

---

## 📜 Scientific & Regulatory Standards

- **OSHA Standard 1910.1000 Table Z-2**: 8-hour TWA Permissible Exposure Limit ($10\text{ ppm}$), Acceptable Ceiling ($20\text{ ppm}$), Peak Excursion ($50\text{ ppm}$).
- **ACGIH TLV-TWA**: Threshold Limit Value ($1\text{ ppm}$ TWA, $5\text{ ppm}$ STEL).
- **NIOSH REL**: Recommended Exposure Limit Ceiling ($10\text{ ppm}$ for 10 min), IDLH ($50\text{ ppm}$).
- **CIE $L^*a^*b^*$ (CIELAB) & CIEDE2000**: ISO/CIE 11664-6:2014 color difference formula for physical colorimetry.
- **Cu-PAN Colorimetry**: Spectrophotometric measurement of copper-complex displacement in gas sensing papers.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
