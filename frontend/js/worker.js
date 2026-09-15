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

const modeBtnCamera = document.getElementById("mode-btn-camera");
const modeBtnSim = document.getElementById("mode-btn-sim");
const cameraControls = document.getElementById("camera-mode-controls");
const simControls = document.getElementById("sim-mode-controls");
const videoEl = document.getElementById("webcam-video");
const photoPreviewEl = document.getElementById("photo-preview-img");
const fileInputEl = document.getElementById("file-strip-input");
const btnToggleWebcam = document.getElementById("btn-toggle-webcam");
const cameraStatusText = document.getElementById("camera-status-text");

let scanMode = "camera"; // "camera" or "sim"
let webcamStream = null;
let uploadedPhotoBase64 = null;
let overrideImageBase64 = null;

// Mode Switching
function setScanMode(mode) {
  scanMode = mode;
  if (rejectionCard) rejectionCard.style.display = "none";

  if (mode === "camera") {
    modeBtnCamera.style.background = "#0284c7";
    modeBtnCamera.style.color = "#fff";
    modeBtnCamera.style.fontWeight = "700";

    modeBtnSim.style.background = "transparent";
    modeBtnSim.style.color = "#94a3b8";
    modeBtnSim.style.fontWeight = "normal";

    cameraControls.style.display = "block";
    simControls.style.display = "none";

    // Restore camera view
    if (uploadedPhotoBase64) {
      photoPreviewEl.style.display = "block";
      roiPreview.style.display = "none";
    } else if (webcamStream) {
      videoEl.style.display = "block";
      roiPreview.style.display = "none";
    } else {
      roiPreview.style.display = "flex";
      roiPreview.style.background = "#111827";
      roiPreview.style.color = "#38bdf8";
      roiPreview.innerHTML = "Position<br>Strip Here";
    }
  } else {
    modeBtnSim.style.background = "#0284c7";
    modeBtnSim.style.color = "#fff";
    modeBtnSim.style.fontWeight = "700";

    modeBtnCamera.style.background = "transparent";
    modeBtnCamera.style.color = "#94a3b8";
    modeBtnCamera.style.fontWeight = "normal";

    cameraControls.style.display = "none";
    simControls.style.display = "block";

    videoEl.style.display = "none";
    photoPreviewEl.style.display = "none";
    roiPreview.style.display = "flex";
    updateReactionColor(parseFloat(simPpmSlider.value));
  }
}

modeBtnCamera?.addEventListener("click", () => setScanMode("camera"));
modeBtnSim?.addEventListener("click", () => setScanMode("sim"));

// Real Hardware Webcam Toggle
btnToggleWebcam?.addEventListener("click", async () => {
  if (webcamStream) {
    // Stop live stream
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    videoEl.style.display = "none";
    videoEl.srcObject = null;
    btnToggleWebcam.textContent = "📹 Start Camera";
    btnToggleWebcam.style.background = "";
    cameraStatusText.textContent = "Camera stopped. Pick photo or start camera.";
    if (!uploadedPhotoBase64) {
      roiPreview.style.display = "flex";
    }
  } else {
    // Start live stream
    try {
      photoPreviewEl.style.display = "none";
      uploadedPhotoBase64 = null;
      cameraStatusText.textContent = "Requesting device camera access...";

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      webcamStream = stream;
      videoEl.srcObject = stream;
      videoEl.style.display = "block";
      roiPreview.style.display = "none";
      btnToggleWebcam.textContent = "⏹ Stop Camera";
      btnToggleWebcam.style.background = "#dc2626";
      cameraStatusText.textContent = "✓ Camera active. Align strip in guide.";
    } catch (err) {
      console.warn("Webcam access error:", err);
      cameraStatusText.textContent = "⚠️ Camera not available. Use 'Pick Photo'.";
      alert("Hardware Camera Unavailable: " + err.message + "\n\nYou can use the 'Pick Photo' button to select or take any photo on your device!");
    }
  }
});

// Real Photo File Input
fileInputEl?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Stop webcam if running
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    videoEl.style.display = "none";
    videoEl.srcObject = null;
    btnToggleWebcam.textContent = "📹 Start Camera";
    btnToggleWebcam.style.background = "";
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    uploadedPhotoBase64 = evt.target.result;
    photoPreviewEl.src = uploadedPhotoBase64;
    photoPreviewEl.style.display = "block";
    roiPreview.style.display = "none";
    cameraStatusText.textContent = `✓ Loaded photo: ${file.name}`;
  };
  reader.readAsDataURL(file);
});

// 4. Capture & Scan Submission
document.getElementById("btn-capture-scan").addEventListener("click", async () => {
  const btn = document.getElementById("btn-capture-scan");
  btn.textContent = "Analyzing Color & Chemistry...";
  btn.disabled = true;
  if (rejectionCard) rejectionCard.style.display = "none";

  try {
    const payload = {
      worker_id: currentWorker.id,
      strip_id: currentStripId
    };

    if (scanMode === "camera") {
      if (webcamStream && videoEl.videoWidth > 0) {
        // Snap frame from hardware webcam
        const canvas = document.getElementById("capture-canvas");
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        payload.image_base64 = canvas.toDataURL("image/jpeg", 0.9);
      } else if (uploadedPhotoBase64) {
        // Use real uploaded photo
        payload.image_base64 = uploadedPhotoBase64;
      } else {
        alert("Please click 'Start Camera' or 'Pick Photo' to provide a real strip image, or switch to 'Chemical Sim' mode!");
        btn.textContent = "⚡ SCAN NOW (AI Analysis)";
        btn.disabled = false;
        return;
      }
    } else {
      // Simulation mode
      if (overrideImageBase64) {
        payload.image_base64 = overrideImageBase64;
      } else {
        payload.simulated_ppm = parseFloat(simPpmSlider.value);
      }
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

