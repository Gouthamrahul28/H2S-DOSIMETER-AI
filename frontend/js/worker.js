/**
 * Worker Mobile Scanner Simulation Logic
 */

import { API } from "./api.js";

let currentWorker = null;
let currentStripId = null;

// Screen Elements
const screenLogin = document.getElementById("screen-login");
const screenStrip = document.getElementById("screen-strip-validate");
const screenCamera = document.getElementById("screen-camera");
const screenResult = document.getElementById("screen-result");

function showScreen(screen) {
  [screenLogin, screenStrip, screenCamera, screenResult].forEach(s => s.classList.remove("active"));
  screen.classList.add("active");
}

// 1. Worker Login
document.getElementById("btn-login").addEventListener("click", async () => {
  const workerId = document.getElementById("login-worker-id").value.trim();
  const pin = document.getElementById("login-pin").value.trim();
  const errDiv = document.getElementById("login-error");

  try {
    const res = await API.workerLogin(workerId, pin);
    currentWorker = res.user_info;
    document.getElementById("worker-profile-pill").textContent = `${currentWorker.name} (${currentWorker.id})`;
    errDiv.style.display = "none";
    showScreen(screenStrip);
  } catch (err) {
    errDiv.textContent = err.detail || "Authentication failed. Check worker ID and PIN.";
    errDiv.style.display = "block";
  }
});

// 2. Strip Validation (Section 2.2)
document.getElementById("btn-verify-strip").addEventListener("click", async () => {
  const stripId = document.getElementById("strip-input-id").value.trim();
  const errBanner = document.getElementById("strip-error-banner");

  if (!stripId) {
    errBanner.textContent = "Please enter a Strip ID.";
    errBanner.style.display = "block";
    return;
  }

  try {
    const res = await API.validateStrip(currentWorker.id, stripId);
    if (!res.valid) {
      // Display failure reason to worker matching Page 6
      errBanner.innerHTML = `<strong>⚠️ Validation Failed (${res.reason_code})</strong><br>${res.message}`;
      errBanner.style.display = "block";
    } else {
      errBanner.style.display = "none";
      currentStripId = stripId;
      showScreen(screenCamera);
    }
  } catch (err) {
    errBanner.textContent = "Strip validation service unavailable.";
    errBanner.style.display = "block";
  }
});

document.getElementById("btn-back-strip").addEventListener("click", () => {
  showScreen(screenStrip);
});

// 3. Camera Viewfinder & Reactive PPM Simulation
const simPpmSlider = document.getElementById("worker-sim-ppm");
const simPpmLabel = document.getElementById("worker-sim-ppm-val");
const roiPreview = document.getElementById("strip-reaction-preview");

function updateReactionColor(ppm) {
  simPpmLabel.textContent = `${ppm} ppm`;
  // Interpolate optical strip reaction color
  let r, g, b, textColor;
  if (ppm <= 1.0) {
    r = 235; g = 230; b = 210; textColor = "#111827";
  } else if (ppm <= 10.0) {
    const f = (ppm - 1.0) / 9.0;
    r = 235 - 25 * f; g = 230 - 40 * f; b = 210 - 70 * f; textColor = "#111827";
  } else if (ppm <= 50.0) {
    const f = (ppm - 10.0) / 40.0;
    r = 210 - 35 * f; g = 190 - 55 * f; b = 140 - 65 * f; textColor = "#111827";
  } else if (ppm <= 100.0) {
    const f = (ppm - 50.0) / 50.0;
    r = 175 - 60 * f; g = 135 - 65 * f; b = 75 - 35 * f; textColor = "#fff";
  } else {
    const f = Math.min(1.0, (ppm - 100.0) / 100.0);
    r = 115 - 65 * f; g = 70 - 35 * f; b = 40 - 10 * f; textColor = "#fff";
  }

  roiPreview.style.background = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  roiPreview.style.color = textColor;
  roiPreview.innerHTML = `Strip Reaction<br><b>${ppm} ppm</b>`;
}

simPpmSlider.addEventListener("input", (e) => {
  updateReactionColor(parseFloat(e.target.value));
});

// Initialize color
updateReactionColor(18.5);

// 4. Capture & Scan Submission
document.getElementById("btn-capture-scan").addEventListener("click", async () => {
  const btn = document.getElementById("btn-capture-scan");
  btn.textContent = "Analyzing Color & Chemistry...";
  btn.disabled = true;

  const ppm = parseFloat(simPpmSlider.value);

  try {
    const res = await API.submitScan({
      worker_id: currentWorker.id,
      strip_id: currentStripId,
      simulated_ppm: ppm
    });

    // Populate Result Screen (Section 3.1 & Page 8)
    document.getElementById("res-ppm").textContent = `${res.predicted_ppm} ppm`;
    document.getElementById("res-ppm-range").textContent = `Estimated Range: ${res.predicted_ppm_range}`;
    document.getElementById("res-worker-action").textContent = res.worker_action;
    document.getElementById("res-exposure-level").textContent = `Exposure Status: ${res.exposure_level} (${res.alert_level} Alert)`;
    document.getElementById("res-confidence").textContent = `${Math.round(res.model_confidence * 1000) / 10}%`;
    document.getElementById("res-model-ver").textContent = `MobileNetV3 ${res.model_version}`;
    document.getElementById("res-scan-id").textContent = res.scan_id;

    const badge = document.getElementById("res-badge");
    badge.className = `badge-cat ${res.badge_class}`;
    badge.textContent = `${res.predicted_class} • ${res.exposure_level}`;

    const guidanceBox = document.getElementById("res-guidance-box");
    guidanceBox.style.borderLeft = `4px solid ${res.color_hex}`;

    showScreen(screenResult);
  } catch (err) {
    const errorMsg = err.detail ? (typeof err.detail === "object" ? err.detail.message : err.detail) : "Scan failed";
    alert("Scan error: " + errorMsg);
  } finally {
    btn.textContent = "⚡ SCAN NOW (AI Analysis)";
    btn.disabled = false;
  }
});

document.getElementById("btn-finish-scan").addEventListener("click", () => {
  showScreen(screenStrip);
});
