# Technical Stack Specification: H₂S Industrial Safety Platform

> **System Overview:** An enterprise-grade, optical dosimeter worker safety platform combining real-time computer vision, deep learning, chemical colorimetry (Cu-PAN chelate displacement), and a multi-tier undo/versioning architecture for industrial $H_2S$ monitoring.

---

## 1. High-Level Architecture

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

## 2. Backend & Core Application Layer

| Technology / Library | Version / Standard | Role & Purpose in Project |
|---|---|---|
| **Python** | `3.13` | Core runtime language for API services, AI model inference, dataset generation, and system scripting. |
| **FastAPI** | `>=0.110.0` | Asynchronous web framework providing type-safe REST APIs, automatic OpenAPI docs, and high concurrency. |
| **Uvicorn** | `>=0.28.0` | Lightning-fast ASGI web server implementing HTTP/1.1 and WebSocket protocols with hot reload. |
| **Pydantic & Pydantic-Settings** | `>=2.6.0` | Declarative data validation, serialization, and centralized environment configuration management. |
| **Python-Multipart** | `>=0.0.9` | Streaming multi-part form parser for camera photo uploads from mobile worker scanners. |
| **PyJWT** | `>=2.8.0` | Cryptographic JSON Web Token (JWT) signing and verification for worker badge & PIN authentication. |
| **HTTPX** | `>=0.27.0` | Asynchronous HTTP client utilized by the `pytest` test suite and FastAPI `TestClient`. |

---

## 3. Database & State Management

| Component | Technology | Implementation Details |
|---|---|---|
| **Database Engine** | **SQLite 3** (`data/h2s_safety.db`) | Embedded, zero-configuration transactional database with ACID compliance. |
| **Object Relational Mapper** | **SQLAlchemy 2.0** | Modern declarative ORM managing relations, schemas, and queries across 7 core models: |

### Core Database Models:
1. **`Worker`**: Employee profiles, digital badge IDs, hashed PINs, shift assignments, and active work status.
2. **`DosimeterStrip`**: Batch lot tracking, issue dates, 90-day shelf life expiration, and strict single-use gating (`use_count = 1`).
3. **`ExposureScan`**: Scan timestamps, image paths, computed $R, G, B, L^*, a^*, b^*$ statistics, predicted PPM, category, and supervisor review approvals.
4. **`SafetyAlert`**: Alarm records categorizing exposure severity into **Yellow** ($10\text{ ppm}$ OSHA PEL), **Orange** ($15\text{ ppm}$ STEL), **Red** ($20\text{ ppm}$ Ceiling), and **Alarm** ($50\text{ ppm}$ IDLH Evacuation).
5. **`SafetyThresholdHistory`**: Time-stamped snapshots (`CFG_YYYYMMDD_HHMMSS`) of safety configurations enabling 1-click administrative undo.
6. **`AIModelRegistry`**: Versioned registry of production and candidate models (`v0.9`, `v1.0`, `v1.1`) with test accuracy, F1-scores, weights locations, and zero-downtime rollback state.
7. **`AuditLog`**: Immutable logging of all supervisory actions, model approvals, rollbacks, and configuration overrides.

---

## 4. AI, Machine Learning & Computer Vision

| Library / Tool | Version / Spec | Purpose in Pipeline |
|---|---|---|
| **PyTorch (`torch`)** | `>=2.2.0` | Deep learning framework driving dosimeter strip classification and continuous concentration regression. |
| **Torchvision** | `>=0.17.0` | Image tensor transforms, data augmentation (color jitter, lighting, rotation), and MobileNet architecture templates. |
| **MobileNetV3-Small** | Pretrained Backbone | Edge-optimized lightweight Convolutional Neural Network (<50ms inference latency on edge devices) fine-tuned for chemical paper strip analysis. |
| **OpenCV (`opencv-python`)** | `>=4.9.0` | Image preprocessing, ROI (Region of Interest) extraction, color space conversions ($BGR \rightarrow RGB$, $BGR \rightarrow \text{CIE } L^*a^*b^*$). |
| **Pillow (`PIL`)** | `>=10.2.0` | High-level image handling, thumbnail generation, JPEG compression, and synthetic data generation. |
| **Scikit-Learn** | `>=1.4.0` | Zero-leakage data splitting (175 train / 50 val / 25 test physical strips), confusion matrices, and macro F1 metric evaluation. |
| **NumPy** | `>=1.26.0` | Vectorized numerical computation, color channel statistics (mean, variance, skewness), and matrix operations. |
| **Pandas** | `>=2.2.0` | Tabular data processing for calibration manifests, strip metadata, and training dataset index files. |

---

## 5. Chemical & Colorimetric Science Engine

The AI model and CV gatekeepers strictly implement the physics of **Copper 1-(2-Pyridylazo)-2-naphthol (Cu-PAN)** optical dosimetry:

$$\text{Cu(II)-PAN } [\text{Purple-Magenta}] + \text{H}_2\text{S} \longrightarrow \text{CuS}\downarrow [\text{Precipitate}] + \text{Free PAN } [\text{Yellow}] + 2\text{H}^+$$

### Key Colorimetric Implementations:
1. **11-Stage Chemical Reference Ladder (`config.py`)**:
   - **S0 ($0.0\text{ ppm}$)**: `[149, 73, 120]` — Intact Chelate (Deep Purple-Magenta)
   - **S2 ($2.5\text{ ppm}$)**: `[193, 88, 106]` — Rose-Red (Initial Copper Displacement)
   - **S4 ($12.0\text{ ppm}$)**: `[223, 122, 91]` — Salmon-Orange
   - **S6 ($38.0\text{ ppm}$)**: `[236, 164, 76]` — Amber-Orange
   - **S8 ($72.0\text{ ppm}$)**: `[242, 201, 62]` — Golden Yellow
   - **S10 ($110.0\text{ ppm}$)**: `[247, 218, 52]` — Full Free PAN Liberation (Response Ceiling)
2. **CIE $L^*a^*b^*$ & Cylindrical Hue Gating (`backend/services/cv_pipeline.py`)**:
   - Computes cylindrical hue angle: $h = \text{atan2}(b^*, a^*) \times \frac{180}{\pi}$.
   - **Rejects Green** ($106^\circ \le h \le 180^\circ$) with HTTP 422 (`INVALID_COLOR_SPECTRUM`).
   - **Rejects Blue / Cyan** ($181^\circ \le h \le 314^\circ$) with HTTP 422 (`INVALID_COLOR_SPECTRUM`).
   - Physical rationale: Green and blue hues cannot exist in the Cu-PAN reaction space and indicate foreign contaminants, glare, or invalid substrates.
3. **CIEDE2000 ($\Delta E_{00}$)**:
   - Evaluates perceptual color difference against the 11 reference rungs:
     $$\Delta E_{00} = \min_{i \in [0, 10]} \Delta E_{00}(\text{Sample}, \text{Rung}_i)$$
   - Samples exceeding $\Delta E_{00} > 22.0$ are rejected as out-of-gamut anomalies.

---

## 6. Frontend & UI/UX Stack

Designed with **zero external framework bloat** (no React, Angular, or Chart.js dependencies), ensuring instant load times (<100ms), low memory consumption, and extreme reliability:

| Layer | Technology | Key Capabilities & Features |
|---|---|---|
| **Structure** | **HTML5 Semantic Markup** | <ul><li>[`index.html`](file:///d:/H2S%20DOSIMETER%20AI/frontend/index.html): Supervisor Operations, AI Model Center, Safety & Undo Center, Worker Analytics, and Git Audit interfaces</li><li>[`worker.html`](file:///d:/H2S%20DOSIMETER%20AI/frontend/worker.html): Worker Mobile Web Scanner with responsive camera viewfinder and real-time strip validation</li></ul> |
| **Styling** | **Vanilla CSS3** | <ul><li>Modern Industrial Dark Mode (`#0b0f19` canvas, `#111827` surface)</li><li>Glassmorphism (`backdrop-filter: blur(16px)`) with subtle border glows</li><li>CSS Grid & Flexbox adaptive layouts</li><li>CSS Custom Properties (Variables) for unified design tokens</li></ul> |
| **Typography** | **Google Fonts CDN** | <ul><li>**Inter**: High-legibility UI typography</li><li>**JetBrains Mono**: Monospaced font for telemetry, PPM values, coordinates, and system IDs</li></ul> |
| **Logic & State** | **Vanilla ES6+ Modules** | <ul><li>Native JavaScript Modules (`import` / `export`)</li><li>Native `fetch()` API with `async/await` handling REST communication</li><li>Modal state machines, toast alert systems, and tab switching</li></ul> |
| **Visualization** | **Custom Dynamic SVG Engines** | <ul><li>**Learning Curve**: 25-epoch SVG chart with Sky Blue glow filter and epoch hover tooltips</li><li>**Model Progression**: Multi-version accuracy bars comparing v0.9, v1.0, and v1.1 against OSHA benchmark ($95.0\%$)</li><li>**Chemical Sensitivity**: Class-by-class Precision/Recall/F1 bars across stages C0–C4</li><li>**Confusion Matrix**: Dynamic heatmapped 5x5 grid across 1,500 test samples</li><li>**Cu-PAN Calibration**: 3-channel polyline ($R, G, B$ vs. PPM) featuring glowing emerald green free PAN indicator</li><li>**Regression Parity**: 1:1 parity line ($Y = X$), $\pm 10\%$ tolerance cone, and 33 color-coded test scatter points with live error tooltips</li></ul> |
| **Mobile Capture** | **HTML5 Media Capture API** | Hardware camera integration via `navigator.mediaDevices.getUserMedia` with fallback to native mobile photo picker (`capture="environment"`). |

---

## 7. Multi-Tier Undo & Version Control Subsystem

| Level | Tool / Mechanism | Features |
|---|---|---|
| **Tier 1: Code & Repositories** | **Git CLI Automation (`undo.py`)** | Programmatic checkpoint creation, tagged releases (`v1.0.0` through `v1.3.0`), 1-command rollback (`--undo`), and per-file restoration (`--restore <file>`). |
| **Tier 2: Safety Thresholds** | **Database Versioning (`supervisor_safety.py`)** | Version-tagged history table (`CFG_YYYYMMDD_HHMMSS`) recording all threshold modifications with 1-click restore. |
| **Tier 3: AI Models** | **DB Model Registry (`supervisor_ai.py`)** | Instant production rollback (`--rollback-model v1.0`) and promotion without restarting the server or interrupting live monitoring. |

---

## 8. DevOps, Testing & Verification Suite

| Tool | Purpose |
|---|---|
| **`pytest`** `>=8.0.0` | Test runner executing automated suites across API health, auth, strip validation, scan ingestion, alert triggering, model registry rollback, data leakage protection, and spectral rejection. |
| **`pytest-asyncio`** | Async test fixture support for FastAPI endpoints. |
| **`WatchFiles`** | High-performance filesystem watcher providing automatic hot-reload during backend development. |
| **`run.py`** | Platform bootstrapper: handles database table creation, seed data initialization, and launches the Uvicorn ASGI server daemon. |
| **`undo.py`** | Dedicated CLI companion offering terminal-based checkpoints, history inspection, and rollbacks. |

---

## 9. Hardware & Edge Deployment Suitability

- **Low Compute Overhead**: The inference pipeline requires <120MB RAM, allowing execution on embedded industrial edge boxes (Raspberry Pi 4/5, NVIDIA Jetson Nano).
- **Zero Heavy Web Frameworks**: The frontend requires no Node.js runtime, Webpack build step, or virtual DOM overhead; it runs directly in standard mobile browsers.
- **Offline First Strip Validation**: Strips can be validated against expiration and assigned worker profiles with sub-millisecond local SQLite queries.
