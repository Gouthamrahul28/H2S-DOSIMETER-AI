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

// Quick Issue Fresh Strip for Logged-In Worker
const btnQuickIssue = document.getElementById("btn-worker-quick-issue");
if (btnQuickIssue) {
  btnQuickIssue.addEventListener("click", async () => {
    if (!currentWorker) return;
    const randId = `STR_${Math.floor(1000 + Math.random() * 9000)}`;
    const errBanner = document.getElementById("strip-error-banner");
    try {
      await API.createStrip(randId, "BATCH_2024_Q4_LOT_03", currentWorker.id, 90);
      document.getElementById("strip-input-id").value = randId;
      errBanner.style.background = "rgba(16, 185, 129, 0.2)";
      errBanner.style.borderColor = "rgba(16, 185, 129, 0.5)";
      errBanner.style.color = "#34d399";
      errBanner.innerHTML = `<strong>✓ Fresh Strip Issued!</strong><br>${randId} is active and assigned to you. Click "Verify Strip Validity".`;
      errBanner.style.display = "block";
    } catch (err) {
      alert("Error issuing strip: " + (err.detail || "Service error"));
    }
  });
}

document.getElementById("btn-back-strip").addEventListener("click", () => {
  showScreen(screenStrip);
});

// Cu-PAN Reference Color Ladder (SIH26118)
const CUPAN_LADDER_JS = [
  { id: "S0", ppm: 0.0, rgb: [149, 73, 120], hex: "#954978", name: "Intact Cu-PAN (Purple-Magenta)" },
  { id: "S1", ppm: 0.8, rgb: [168, 77, 114], hex: "#A84D72", name: "Magenta-Violet" },
  { id: "S2", ppm: 2.5, rgb: [193, 88, 106], hex: "#C1586A", name: "Rose-Red" },
  { id: "S3", ppm: 6.0, rgb: [211, 107, 95], hex: "#D36B5F", name: "Coral" },
  { id: "S4", ppm: 12.0, rgb: [223, 122, 91], hex: "#DF7A5B", name: "Salmon-Orange" },
  { id: "S5", ppm: 22.0, rgb: [233, 144, 83], hex: "#E99053", name: "Orange" },
  { id: "S6", ppm: 38.0, rgb: [236, 164, 76], hex: "#ECA44C", name: "Amber-Orange" },
  { id: "S7", ppm: 55.0, rgb: [238, 185, 68], hex: "#EEB944", name: "Amber" },
  { id: "S8", ppm: 72.0, rgb: [242, 201, 62], hex: "#F2C93E", name: "Golden Yellow" },
  { id: "S9", ppm: 90.0, rgb: [244, 211, 56], hex: "#F4D338", name: "Yellow" },
  { id: "S10", ppm: 110.0, rgb: [247, 218, 52], hex: "#F7DA34", name: "Free PAN Yellow" }
];

function getCupanColor(ppm) {
  if (ppm <= CUPAN_LADDER_JS[0].ppm) {
    return { rgb: CUPAN_LADDER_JS[0].rgb, stage: CUPAN_LADDER_JS[0].id, name: CUPAN_LADDER_JS[0].name };
  }
  const last = CUPAN_LADDER_JS[CUPAN_LADDER_JS.length - 1];
  if (ppm >= last.ppm) {
    return { rgb: last.rgb, stage: last.id, name: last.name };
  }
  for (let i = 0; i < CUPAN_LADDER_JS.length - 1; i++) {
    const r1 = CUPAN_LADDER_JS[i];
    const r2 = CUPAN_LADDER_JS[i + 1];
    if (ppm >= r1.ppm && ppm <= r2.ppm) {
      const frac = (ppm - r1.ppm) / (r2.ppm - r1.ppm);
      const rgb = [
        Math.round(r1.rgb[0] + frac * (r2.rgb[0] - r1.rgb[0])),
        Math.round(r1.rgb[1] + frac * (r2.rgb[1] - r1.rgb[1])),
        Math.round(r1.rgb[2] + frac * (r2.rgb[2] - r1.rgb[2]))
      ];
      return { rgb, stage: frac < 0.5 ? r1.id : r2.id, name: frac < 0.5 ? r1.name : r2.name };
    }
  }
  return { rgb: last.rgb, stage: last.id, name: last.name };
}

// 3. Camera Viewfinder & Reactive Cu-PAN Simulation
const simPpmSlider = document.getElementById("worker-sim-ppm");
const simPpmLabel = document.getElementById("worker-sim-ppm-val");
const roiPreview = document.getElementById("strip-reaction-preview");
const rejectionCard = document.getElementById("scan-rejection-card");

let overrideImageBase64 = null;

function updateReactionColor(ppm) {
  overrideImageBase64 = null;
  if (rejectionCard) rejectionCard.style.display = "none";
  const match = getCupanColor(ppm);
  simPpmLabel.textContent = `${ppm.toFixed(1)} ppm (${match.stage})`;

  const r = match.rgb[0], g = match.rgb[1], b = match.rgb[2];
  // Calculate relative luminance for text contrast
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const textColor = lum > 140 ? "#0f172a" : "#ffffff";

  roiPreview.style.background = `rgb(${r}, ${g}, ${b})`;
  roiPreview.style.color = textColor;
  roiPreview.innerHTML = `Cu-PAN Reaction<br><b>${match.stage} (${ppm} ppm)</b><br><span style="font-size:9px; opacity:0.85;">${match.name}</span>`;
}

simPpmSlider.addEventListener("input", (e) => {
  updateReactionColor(parseFloat(e.target.value));
});

// Helper to synthesize a realistic 224x224 test strip in canvas
function generateTestStripBase64(rgb) {
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, 224, 224);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(10, 10, 20, 20);
  ctx.fillStyle = "#141414";
  ctx.fillRect(10, 194, 20, 20);
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  ctx.fillRect(40, 40, 144, 144);
  const imgData = ctx.getImageData(0, 0, 224, 224);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 6;
    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
    imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] + noise));
    imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}

// Quick Test Buttons
document.getElementById("btn-test-green")?.addEventListener("click", () => {
  overrideImageBase64 = generateTestStripBase64([0, 210, 0]);
  roiPreview.style.background = "rgb(0, 210, 0)";
  roiPreview.style.color = "#000";
  roiPreview.innerHTML = `⚠️ ALIEN COLOR<br><b>Pure Green</b><br><span style="font-size:9px;">Excluded from Cu-PAN</span>`;
  simPpmLabel.textContent = "Alien (Green)";
  if (rejectionCard) rejectionCard.style.display = "none";
});

document.getElementById("btn-test-blue")?.addEventListener("click", () => {
  overrideImageBase64 = generateTestStripBase64([0, 0, 220]);
  roiPreview.style.background = "rgb(0, 0, 220)";
  roiPreview.style.color = "#fff";
  roiPreview.innerHTML = `⚠️ ALIEN COLOR<br><b>Pure Blue</b><br><span style="font-size:9px;">Excluded from Cu-PAN</span>`;
  simPpmLabel.textContent = "Alien (Blue)";
  if (rejectionCard) rejectionCard.style.display = "none";
});

document.getElementById("btn-test-s0")?.addEventListener("click", () => {
  simPpmSlider.value = 0;
  updateReactionColor(0);
});

document.getElementById("btn-test-s10")?.addEventListener("click", () => {
  simPpmSlider.value = 110;
  updateReactionColor(110);
});

// Initialize color
updateReactionColor(18.5);

// 4. Capture & Scan Submission
document.getElementById("btn-capture-scan").addEventListener("click", async () => {
  const btn = document.getElementById("btn-capture-scan");
  btn.textContent = "Analyzing Color & Chemistry...";
  btn.disabled = true;
  if (rejectionCard) rejectionCard.style.display = "none";

  const ppm = parseFloat(simPpmSlider.value);

  try {
    const payload = {
      worker_id: currentWorker.id,
      strip_id: currentStripId
    };

    if (overrideImageBase64) {
      payload.image_base64 = overrideImageBase64;
    } else {
      payload.simulated_ppm = ppm;
    }

    const res = await API.submitScan(payload);

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
    const detail = err.detail || {};
    if (detail.error === "INVALID_COLOR_SPECTRUM") {
      // Display dedicated spectral gatekeeper rejection alert card
      if (rejectionCard) {
        document.getElementById("rejection-title").textContent = `SPECTRAL REJECTION (HTTP 422: ${detail.foreign_color || 'Alien Color'})`;
        document.getElementById("rejection-desc").innerHTML = `<strong>${detail.message}</strong><br><span style="color:#94a3b8; font-size:11px;">H₂S strips react with Cu-PAN through displacement, transitioning strictly Purple-Magenta → Coral → Orange → Amber → Yellow. Greens and Blues do not exist in this reaction.</span>`;
        document.getElementById("rejection-tech-details").textContent = `Hue Angle: ${detail.hue_angle}° | CIEDE2000 ΔE₀₀: ${detail.min_delta_e} (Max Allowed: 22.0)`;
        rejectionCard.style.display = "block";
      } else {
        alert("⛔ SPECTRAL REJECTION: " + detail.message);
      }
    } else {
      const errorMsg = typeof detail === "object" ? (detail.message || JSON.stringify(detail)) : (err.detail || "Scan failed");
      alert("Scan error: " + errorMsg);
    }
  } finally {
    btn.textContent = "⚡ SCAN NOW (AI Analysis)";
    btn.disabled = false;
  }
});

document.getElementById("btn-finish-scan").addEventListener("click", () => {
  showScreen(screenStrip);
});

