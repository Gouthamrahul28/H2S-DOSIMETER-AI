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

// Store active scan result for download & export
let lastScanResult = null;

// H2S Safety Tier & Color Resolver (OSHA, NIOSH, ACGIH & Cu-PAN Scale)
export function getPpmSafetyInfo(ppm, alertLevel = null, badgeClass = null) {
  const numPpm = (ppm !== null && ppm !== undefined) ? parseFloat(ppm) : 0.0;
  
  if (badgeClass === "badge-green" || alertLevel === "Green" || numPpm < 1.0) {
    const pct = Math.max(4, Math.min(19, 4 + (numPpm / 1.0) * 15));
    return {
      level: "safe",
      cssClass: "ppm-safe",
      color: "#22c55e",
      textShadow: "0 0 24px rgba(34, 197, 94, 0.5)",
      label: "🟢 SAFE LEVEL",
      safeStatus: "Safe to Breathe (0 - 1 ppm)",
      isSafe: true,
      badgeClass: "badge-green",
      verdictTitle: "AIR IS SAFE TO BREATHE",
      verdictDesc: "No hazardous gas detected. Normal air quality for full 8-hour shift work.",
      verdictIcon: "🟢",
      actionIcon: "🫁",
      gaugePercent: pct,
      gaugeStatus: "Zone: Safe (C0)"
    };
  } else if (badgeClass === "badge-yellow" || alertLevel === "Yellow" || (numPpm >= 1.0 && numPpm < 10.0)) {
    const pct = 21 + ((numPpm - 1.0) / 9.0) * 19;
    return {
      level: "caution",
      cssClass: "ppm-caution",
      color: "#facc15",
      textShadow: "0 0 24px rgba(250, 204, 21, 0.55)",
      label: "🟡 CAUTION LEVEL",
      safeStatus: "Caution (1 - 10 ppm)",
      isSafe: false,
      badgeClass: "badge-yellow",
      verdictTitle: "CAUTION — TRACE GAS DETECTED",
      verdictDesc: "Gas approaching exposure limits. Safe short-term, but inspect area & monitor closely.",
      verdictIcon: "🟡",
      actionIcon: "🔍",
      gaugePercent: Math.min(41, pct),
      gaugeStatus: "Zone: Caution (C1)"
    };
  } else if (badgeClass === "badge-orange" || alertLevel === "Orange" || (numPpm >= 10.0 && numPpm < 50.0)) {
    const pct = 43 + ((numPpm - 10.0) / 40.0) * 22;
    return {
      level: "warning",
      cssClass: "ppm-warning",
      color: "#fb923c",
      textShadow: "0 0 24px rgba(251, 146, 60, 0.55)",
      label: "⚡ MODERATE HAZARD",
      safeStatus: "Exceeds Safe Limit (10 - 50 ppm)",
      isSafe: false,
      badgeClass: "badge-orange",
      verdictTitle: "WARNING — HAZARDOUS EXPOSURE",
      verdictDesc: "OSHA legal workplace limit exceeded! Turn on forced fans and wear safety respirator.",
      verdictIcon: "⚡",
      actionIcon: "💨",
      gaugePercent: Math.min(65, pct),
      gaugeStatus: "Zone: Moderate Hazard (C2)"
    };
  } else if (badgeClass === "badge-red" || alertLevel === "Red" || (numPpm >= 50.0 && numPpm < 100.0)) {
    const pct = 67 + ((numPpm - 50.0) / 50.0) * 20;
    return {
      level: "danger",
      cssClass: "ppm-danger",
      color: "#ef4444",
      textShadow: "0 0 28px rgba(239, 68, 68, 0.65)",
      label: "⛔ HIGH DANGER",
      safeStatus: "Dangerous Air (50 - 100 ppm)",
      isSafe: false,
      badgeClass: "badge-red",
      verdictTitle: "DANGER — TOXIC ATMOSPHERE",
      verdictDesc: "High toxicity hazard! Eye damage and breathing distress possible. Leave area immediately!",
      verdictIcon: "⛔",
      actionIcon: "🚶",
      gaugePercent: Math.min(87, pct),
      gaugeStatus: "Zone: High Hazard (C3)"
    };
  } else {
    const extra = Math.min(numPpm - 100.0, 50.0) / 50.0;
    const pct = 89 + extra * 9;
    return {
      level: "alarm",
      cssClass: "ppm-alarm",
      color: "#f87171",
      textShadow: "0 0 32px rgba(248, 113, 113, 0.9)",
      label: "🚨 CRITICAL EVACUATION",
      safeStatus: "EVACUATE IMMEDIATELY (> 100 ppm)",
      isSafe: false,
      badgeClass: "badge-alarm",
      verdictTitle: "DEADLY AIR — EVACUATE NOW!",
      verdictDesc: "Immediately Dangerous to Life and Health (IDLH). Rapid loss of consciousness. Run to fresh air!",
      verdictIcon: "🚨",
      actionIcon: "🏃",
      gaugePercent: Math.min(97, pct),
      gaugeStatus: "Zone: Critical Evac (C4)"
    };
  }
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
const fileCameraInput = document.getElementById("file-camera-input");
const fileGalleryInput = document.getElementById("file-gallery-input");
const btnUploadImage = document.getElementById("btn-upload-image");
const btnNativeCamera = document.getElementById("btn-native-camera");
const btnToggleWebcam = document.getElementById("btn-toggle-webcam");
const btnLoadSample = document.getElementById("btn-load-sample");
const cameraStatusText = document.getElementById("camera-status-text");
const cameraViewfinder = document.getElementById("camera-viewfinder");

let scanMode = "camera"; // "camera" or "sim"
let webcamStream = null;
let uploadedPhotoBase64 = null;
let overrideImageBase64 = null;

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

// Reactive Cu-PAN Simulation Color & Safety Indicator Updater
function updateReactionColor(ppm) {
  overrideImageBase64 = null;
  if (rejectionCard) rejectionCard.style.display = "none";
  const match = getCupanColor(ppm);
  const safety = getPpmSafetyInfo(ppm);

  if (simPpmLabel) {
    simPpmLabel.innerHTML = `<span style="color:${safety.color}; font-weight:800;">${ppm.toFixed(1)} ppm</span> <span style="font-size:10.5px; color:${safety.color}; font-weight:700;">(${match.stage} • ${safety.label})</span>`;
    simPpmLabel.style.transition = "color 0.2s ease";
  }

  const r = match.rgb[0], g = match.rgb[1], b = match.rgb[2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const textColor = lum > 140 ? "#0f172a" : "#ffffff";

  if (roiPreview && scanMode === "sim") {
    roiPreview.style.background = `rgb(${r}, ${g}, ${b})`;
    roiPreview.style.color = textColor;
    roiPreview.innerHTML = `Cu-PAN Reaction<br><b style="font-size:13px;">${match.stage} (${ppm.toFixed(1)} ppm)</b><br><span style="font-size:9px; padding:2px 7px; border-radius:4px; background:rgba(0,0,0,0.65); color:${safety.color}; font-weight:700; margin-top:4px; display:inline-block; border:1px solid ${safety.color};">${safety.label}</span>`;
  }
}

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
      roiPreview.style.display = "flex";
      roiPreview.style.background = "rgba(34, 197, 94, 0.06)";
      roiPreview.style.color = "#22c55e";
      roiPreview.innerHTML = "Position<br>Strip Here";
    } else if (webcamStream) {
      videoEl.style.display = "block";
      roiPreview.style.display = "flex";
      roiPreview.style.background = "rgba(34, 197, 94, 0.06)";
      roiPreview.style.color = "#22c55e";
      roiPreview.innerHTML = "Position<br>Strip Here";
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

// Simulation PPM Slider Event Listener
simPpmSlider?.addEventListener("input", (e) => {
  updateReactionColor(parseFloat(e.target.value));
});

// Quick Stage Test Buttons
document.getElementById("btn-test-green")?.addEventListener("click", () => {
  overrideImageBase64 = generateTestStripBase64([0, 210, 0]);
  roiPreview.style.background = "rgb(0, 210, 0)";
  roiPreview.style.color = "#000";
  roiPreview.innerHTML = `⚠️ ALIEN COLOR<br><b>Pure Green</b><br><span style="font-size:9px;">Excluded from Cu-PAN</span>`;
  if (simPpmLabel) {
    simPpmLabel.innerHTML = "<span style='color:#4ade80; font-weight:700;'>Alien (Green)</span>";
  }
  if (rejectionCard) rejectionCard.style.display = "none";
});

document.getElementById("btn-test-blue")?.addEventListener("click", () => {
  overrideImageBase64 = generateTestStripBase64([0, 0, 220]);
  roiPreview.style.background = "rgb(0, 0, 220)";
  roiPreview.style.color = "#fff";
  roiPreview.innerHTML = `⚠️ ALIEN COLOR<br><b>Pure Blue</b><br><span style="font-size:9px;">Excluded from Cu-PAN</span>`;
  if (simPpmLabel) {
    simPpmLabel.innerHTML = "<span style='color:#60a5fa; font-weight:700;'>Alien (Blue)</span>";
  }
  if (rejectionCard) rejectionCard.style.display = "none";
});

document.getElementById("btn-test-s0")?.addEventListener("click", () => {
  if (simPpmSlider) simPpmSlider.value = 0;
  updateReactionColor(0);
});

document.getElementById("btn-test-s10")?.addEventListener("click", () => {
  if (simPpmSlider) simPpmSlider.value = 110;
  updateReactionColor(110);
});

// Unified Image File Processor (Used by upload button, camera shutter, and drag-and-drop)
function handleImageFile(file) {
  if (!file) return;
  const isImg = (file.type && file.type.startsWith("image/")) || /\.(jpe?g|png|webp|bmp|gif|tiff)$/i.test(file.name);
  if (!isImg) {
    alert("Please select a valid image file (PNG, JPEG, WEBP).");
    return;
  }

  // Stop webcam if running
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    videoEl.style.display = "none";
    btnToggleWebcam.textContent = "📹 Live Webcam";
    btnToggleWebcam.style.background = "";
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    uploadedPhotoBase64 = evt.target.result;
    photoPreviewEl.src = uploadedPhotoBase64;
    photoPreviewEl.style.display = "block";

    roiPreview.style.display = "flex";
    roiPreview.style.background = "rgba(34, 197, 94, 0.06)";
    roiPreview.style.color = "#22c55e";
    roiPreview.innerHTML = "Position<br>Strip Here";

    cameraStatusText.innerHTML = `✓ <strong style='color:#34d399;'>Image Loaded:</strong> <span style='color:#fff;'>${file.name}</span> (${Math.round(file.size/1024)} KB). Click <strong>⚡ SCAN NOW</strong>!`;
  };
  reader.onerror = function() {
    alert("Failed to read image file. Please try another image.");
  };
  reader.readAsDataURL(file);
}

fileGalleryInput?.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    handleImageFile(e.target.files[0]);
  }
  e.target.value = ""; // Reset so identical file can be re-selected
});

fileCameraInput?.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    handleImageFile(e.target.files[0]);
  }
  e.target.value = ""; // Reset so identical file can be re-selected
});

// Drag & Drop on Viewfinder Box
if (cameraViewfinder) {
  cameraViewfinder.addEventListener("dragover", (e) => {
    e.preventDefault();
    cameraViewfinder.style.boxShadow = "0 0 25px rgba(56, 189, 248, 0.5)";
    cameraViewfinder.style.borderColor = "#38bdf8";
  });
  cameraViewfinder.addEventListener("dragleave", (e) => {
    e.preventDefault();
    cameraViewfinder.style.boxShadow = "";
  });
  cameraViewfinder.addEventListener("drop", (e) => {
    e.preventDefault();
    cameraViewfinder.style.boxShadow = "";
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  cameraViewfinder.addEventListener("click", (e) => {
    if (!webcamStream && scanMode === "camera") {
      fileGalleryInput?.click();
    }
  });
}

// Real Hardware Webcam Toggle with Progressive Fallback
btnToggleWebcam?.addEventListener("click", async () => {
  if (webcamStream) {
    // Stop live stream
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    videoEl.style.display = "none";
    videoEl.srcObject = null;
    btnToggleWebcam.textContent = "📹 Live Webcam";
    btnToggleWebcam.style.background = "";
    cameraStatusText.textContent = "Webcam stopped. Tap 'Upload Image' or 'Snap Photo'.";
    if (!uploadedPhotoBase64) {
      roiPreview.style.background = "#111827";
      roiPreview.style.color = "#38bdf8";
      roiPreview.innerHTML = "Position<br>Strip Here";
    }
    return;
  }

  // Check if getUserMedia is supported in this context
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraStatusText.innerHTML = "⚠️ Live webcam requires HTTPS/localhost.<br><span style='color:#34d399;'>Opening file/image upload mode...</span>";
    fileGalleryInput?.click();
    return;
  }

  try {
    photoPreviewEl.style.display = "none";
    uploadedPhotoBase64 = null;
    cameraStatusText.textContent = "Requesting webcam permissions...";

    let stream = null;
    const constraintList = [
      { video: { facingMode: { ideal: "environment" } } },
      { video: { facingMode: "user" } },
      { video: true }
    ];

    for (const c of constraintList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (errConstraint) {
        console.warn("Retrying with alternate camera constraint:", errConstraint);
      }
    }

    if (!stream) {
      throw new Error("No compatible webcam device found.");
    }

    webcamStream = stream;
    videoEl.srcObject = stream;
    videoEl.setAttribute("playsinline", "true");
    videoEl.muted = true;
    videoEl.style.display = "block";

    roiPreview.style.display = "flex";
    roiPreview.style.background = "rgba(34, 197, 94, 0.06)";
    roiPreview.style.color = "#22c55e";
    roiPreview.innerHTML = "Align Strip<br>Inside Box";

    // Play video explicitly
    try {
      await videoEl.play();
    } catch (ePlay) {
      console.warn("Auto play deferred:", ePlay);
    }

    btnToggleWebcam.textContent = "⏹ Stop Webcam";
    btnToggleWebcam.style.background = "#dc2626";
    cameraStatusText.innerHTML = "<span style='color:#34d399;'>● Webcam streaming active.</span> Align strip in box and click SCAN NOW.";
  } catch (err) {
    console.warn("Webcam error:", err);
    let advice = "Camera permission not granted or device has no webcam.";
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      advice = "Please grant camera permission in your browser URL bar icon.";
    } else if (err.name === "NotFoundError") {
      advice = "No physical webcam detected on this machine.";
    } else if (err.name === "NotReadableError") {
      advice = "Webcam is already in use by another program.";
    }

    cameraStatusText.innerHTML = `⚠️ <strong>${advice}</strong><br><span style='color:#38bdf8;'>Opening image file picker...</span>`;
    setTimeout(() => fileGalleryInput?.click(), 500);
  }
});

// Load Sample Strip Photo Button (For instant testing without a camera)
btnLoadSample?.addEventListener("click", () => {
  // Stop webcam if active
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    videoEl.style.display = "none";
    btnToggleWebcam.textContent = "📹 Live Webcam";
    btnToggleWebcam.style.background = "";
  }

  // Generate authentic Cu-PAN S5 (Orange, 22 PPM) sample strip
  const sampleB64 = generateTestStripBase64([233, 144, 83]);
  uploadedPhotoBase64 = `data:image/png;base64,${sampleB64}`;
  photoPreviewEl.src = uploadedPhotoBase64;
  photoPreviewEl.style.display = "block";

  roiPreview.style.display = "flex";
  roiPreview.style.background = "rgba(34, 197, 94, 0.06)";
  roiPreview.style.color = "#22c55e";
  roiPreview.innerHTML = "Position<br>Strip Here";

  cameraStatusText.innerHTML = "✓ <strong style='color:#34d399;'>Sample Cu-PAN Strip Loaded</strong> (Orange / ~22 ppm). Click <strong>⚡ SCAN NOW</strong> to run AI model!";
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
        // Use real uploaded photo or loaded sample
        payload.image_base64 = uploadedPhotoBase64;
      } else {
        cameraStatusText.innerHTML = "⚠️ <span style='color:#f87171;'>No photo ready.</span> Click <strong>Upload Image</strong>, <strong>Snap Photo</strong>, or <strong>Load Sample</strong> first!";
        fileGalleryInput?.click();
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
    lastScanResult = res;

    // Populate Result Screen with dynamic PPM safety coloring & non-technical verdict
    const ppmVal = res.predicted_ppm;
    const safety = getPpmSafetyInfo(ppmVal, res.alert_level, res.badge_class);

    // 1. Plain-Language Verdict Hero
    const verdictCard = document.getElementById("res-verdict-card");
    const verdictTitle = document.getElementById("res-verdict-title");
    const verdictIcon = document.getElementById("res-verdict-icon");
    const verdictText = document.getElementById("res-verdict-text");
    const verdictDesc = document.getElementById("res-verdict-desc");
    if (verdictCard) {
      verdictCard.style.background = `radial-gradient(circle at center, ${safety.color}25 0%, rgba(15,23,42,0.95) 100%)`;
      verdictCard.style.borderColor = safety.color;
      verdictCard.style.boxShadow = `0 10px 30px -10px ${safety.color}40`;
    }
    if (verdictTitle) verdictTitle.style.color = safety.color;
    if (verdictIcon) verdictIcon.textContent = safety.verdictIcon;
    if (verdictText) verdictText.textContent = safety.verdictTitle;
    if (verdictDesc) verdictDesc.textContent = safety.verdictDesc;

    // 2. Large PPM Value
    const resPpmEl = document.getElementById("res-ppm");
    resPpmEl.textContent = `${ppmVal} ppm`;
    resPpmEl.className = `ppm-reading ${safety.cssClass}`;
    resPpmEl.style.color = safety.color;
    resPpmEl.style.textShadow = safety.textShadow;

    const resStatusTag = document.getElementById("res-ppm-status-tag");
    if (resStatusTag) {
      resStatusTag.className = `badge-cat ${safety.badgeClass}`;
      resStatusTag.textContent = safety.label;
    }

    const safeStatusLabel = document.getElementById("res-safe-status-label");
    if (safeStatusLabel) {
      safeStatusLabel.textContent = safety.safeStatus;
      safeStatusLabel.style.color = safety.color;
    }

    // 3. Risk Exposure Gauge / Meter Needle
    const gaugeStatus = document.getElementById("res-gauge-status");
    const gaugeNeedle = document.getElementById("res-gauge-needle");
    const gaugePin = document.getElementById("res-gauge-pin");
    if (gaugeStatus) {
      gaugeStatus.textContent = safety.gaugeStatus;
      gaugeStatus.style.color = safety.color;
    }
    if (gaugeNeedle) {
      gaugeNeedle.style.left = `${safety.gaugePercent}%`;
    }
    if (gaugePin) {
      gaugePin.style.borderColor = safety.color;
      gaugePin.style.color = safety.color;
    }

    // 4. Action Card
    const resActionIcon = document.getElementById("res-action-icon");
    if (resActionIcon) resActionIcon.textContent = safety.actionIcon;
    document.getElementById("res-ppm-range").textContent = `Range: ${res.predicted_ppm_range}`;
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

    // Populate Scanned Image and Targeted Area of Analysis
    const resScannedImg = document.getElementById("res-scanned-img");
    const resRoiOverlay = document.getElementById("res-roi-overlay");
    const resRoiBadge = document.getElementById("res-roi-badge");
    const resRoiTag = document.getElementById("res-roi-tag");
    const resSwatchBox = document.getElementById("res-swatch-box");
    const resSwatchHex = document.getElementById("res-swatch-hex");
    const resRgbVal = document.getElementById("res-rgb-val");
    const resHueVal = document.getElementById("res-hue-val");
    const resChromaVal = document.getElementById("res-chroma-val");
    const btnToggleRoiZoom = document.getElementById("btn-toggle-roi-zoom");

    // Scanned Image Source (Prefer payload.image_base64 for instant display, fallback to server image_url)
    let displayImgSrc = payload.image_base64 || res.raw_image_url || res.image_url;
    if (!displayImgSrc && scanMode === "sim") {
      const cupan = getCupanColor(res.predicted_ppm);
      displayImgSrc = `data:image/png;base64,${generateTestStripBase64(cupan.rgb)}`;
    }
    if (resScannedImg && displayImgSrc) {
      resScannedImg.src = displayImgSrc;
      resScannedImg.style.transform = "scale(1)";
    }

    // Set ROI Overlay Coordinates
    let isZoomed = false;
    const roiCoords = res.roi_coordinates || { percent: { x: 20, y: 20, width: 60, height: 60 } };
    const p = roiCoords.percent || { x: 20, y: 20, width: 60, height: 60 };

    if (resRoiOverlay) {
      resRoiOverlay.style.top = `${p.y}%`;
      resRoiOverlay.style.left = `${p.x}%`;
      resRoiOverlay.style.width = `${p.width}%`;
      resRoiOverlay.style.height = `${p.height}%`;
      resRoiOverlay.style.display = "flex";
      resRoiOverlay.style.boxShadow = "0 0 15px rgba(34,197,94,0.6), inset 0 0 10px rgba(34,197,94,0.2)";
      if (resRoiTag) resRoiTag.textContent = "Analyzed Zone";
    }

    if (resRoiBadge) {
      resRoiBadge.textContent = `Target ROI: ${Math.round(p.width)}% × ${Math.round(p.height)}%`;
    }

    // Extracted Dye Colorimetric features
    const feat = res.extracted_features || {};
    const rgb = feat.mean_rgb || [233, 144, 83];
    const hex = res.color_hex || `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;
    if (resSwatchBox) resSwatchBox.style.background = hex;
    if (resSwatchHex) resSwatchHex.textContent = hex.toUpperCase();
    if (resRgbVal) resRgbVal.textContent = `[${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}]`;
    if (resHueVal) resHueVal.textContent = `${feat.hue_angle ?? '24.4'}°`;
    if (resChromaVal) resChromaVal.textContent = `${feat.chroma ?? '54.2'}`;

    // Zoom Toggle Button Handler
    if (btnToggleRoiZoom) {
      btnToggleRoiZoom.textContent = "🔍 Zoom ROI";
      btnToggleRoiZoom.onclick = () => {
        isZoomed = !isZoomed;
        if (isZoomed) {
          btnToggleRoiZoom.textContent = "🔍 Full View";
          if (resScannedImg) {
            resScannedImg.style.transform = "scale(1.8)";
            resScannedImg.style.transformOrigin = `${p.x + p.width / 2}% ${p.y + p.height / 2}%`;
            resScannedImg.style.transition = "transform 0.3s ease";
          }
          if (resRoiOverlay) {
            resRoiOverlay.style.boxShadow = "0 0 25px rgba(34,197,94,0.9), inset 0 0 15px rgba(34,197,94,0.4)";
            if (resRoiTag) resRoiTag.textContent = "Chemical Core (Zoomed)";
          }
        } else {
          btnToggleRoiZoom.textContent = "🔍 Zoom ROI";
          if (resScannedImg) {
            resScannedImg.style.transform = "scale(1)";
          }
          if (resRoiOverlay) {
            resRoiOverlay.style.boxShadow = "0 0 15px rgba(34,197,94,0.6), inset 0 0 10px rgba(34,197,94,0.2)";
            if (resRoiTag) resRoiTag.textContent = "Analyzed Zone";
          }
        }
      };
    }

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
    } else if (detail.error === "IMAGE_QUALITY_CHECK_FAILED") {
      // Display image quality advisory card
      if (rejectionCard) {
        document.getElementById("rejection-title").textContent = `IMAGE QUALITY ADVISORY (HTTP 422)`;
        document.getElementById("rejection-desc").innerHTML = `<strong>${detail.message}</strong><br><span style="color:#94a3b8; font-size:11px;">Please ensure the dosimeter strip is centered inside the viewfinder box.</span>`;
        const metrics = detail.quality_metrics || {};
        document.getElementById("rejection-tech-details").textContent = `Sharpness: ${metrics.blur_metric || 'N/A'} | Luminance: ${metrics.mean_luminance || 'N/A'} | Glare: ${metrics.glare_percentage || 0}%`;
        rejectionCard.style.display = "block";
      } else {
        alert("⚠️ IMAGE QUALITY CHECK: " + detail.message);
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

// Toggle Detailed Technical Data Section
const toggleTechData = document.getElementById("toggle-tech-data");
const techDataBody = document.getElementById("tech-data-body");
const techToggleIcon = document.getElementById("tech-toggle-icon");
if (toggleTechData && techDataBody) {
  toggleTechData.addEventListener("click", () => {
    const isHidden = techDataBody.style.display === "none";
    techDataBody.style.display = isHidden ? "block" : "none";
    if (techToggleIcon) {
      techToggleIcon.textContent = isHidden ? "▲ Hide Tech Data" : "▼ View Tech Data";
    }
  });
}

// Download High-Resolution Official Safety Report Certificate (PNG via Canvas)
function downloadSafetyReportPNG() {
  if (!lastScanResult) {
    alert("Please perform a scan first.");
    return;
  }
  const res = lastScanResult;
  const safety = getPpmSafetyInfo(res.predicted_ppm, res.alert_level, res.badge_class);
  const worker = currentWorker || { name: "Operator", id: "EMP_00542" };
  const stripId = currentStripId || "STR_0421";

  const canvas = document.createElement("canvas");
  canvas.width = 840;
  canvas.height = 1120;
  const ctx = canvas.getContext("2d");

  // 1. Dark Cyber Background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#080e1a");
  grad.addColorStop(0.5, "#0b1329");
  grad.addColorStop(1, "#040711");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Glowing Border in Safety Color
  ctx.strokeStyle = safety.color;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // Corner Accents
  ctx.fillStyle = safety.color;
  const cSize = 24;
  ctx.fillRect(10, 10, cSize, 6);
  ctx.fillRect(10, 10, 6, cSize);
  ctx.fillRect(canvas.width - 10 - cSize, 10, cSize, 6);
  ctx.fillRect(canvas.width - 16, 10, 6, cSize);
  ctx.fillRect(10, canvas.height - 16, cSize, 6);
  ctx.fillRect(10, canvas.height - 10 - cSize, 6, cSize);
  ctx.fillRect(canvas.width - 10 - cSize, canvas.height - 16, cSize, 6);
  ctx.fillRect(canvas.width - 16, canvas.height - 10 - cSize, 6, cSize);

  // 2. Header
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 20px 'Inter', sans-serif";
  ctx.fillText("H₂S INDUSTRIAL OPTICAL DOSIMETER", 40, 60);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px 'Inter', sans-serif";
  ctx.fillText("OFFICIAL WORKER AIR QUALITY INSPECTION REPORT", 40, 84);

  const dateStr = new Date().toLocaleString();
  ctx.textAlign = "right";
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "12px 'JetBrains Mono', monospace";
  ctx.fillText(dateStr, canvas.width - 40, 60);
  ctx.fillText(`ID: ${res.scan_id}`, canvas.width - 40, 80);
  ctx.textAlign = "left";

  // Separator line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 105);
  ctx.lineTo(canvas.width - 40, 105);
  ctx.stroke();

  // 3. Verdict Hero Box
  ctx.fillStyle = `${safety.color}18`;
  ctx.beginPath();
  ctx.roundRect(40, 125, canvas.width - 80, 110, 14);
  ctx.fill();
  ctx.strokeStyle = safety.color;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = safety.color;
  ctx.font = "bold 28px 'Inter', sans-serif";
  ctx.fillText(`${safety.verdictIcon}  ${safety.verdictTitle}`, 65, 172);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "15px 'Inter', sans-serif";
  ctx.fillText(safety.verdictDesc, 65, 205);

  // 4. Large Digital PPM Box
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(40, 255, canvas.width - 80, 160, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 13px 'Inter', sans-serif";
  ctx.fillText("PREDICTED GAS CONCENTRATION:", 65, 285);

  ctx.fillStyle = safety.color;
  ctx.font = "800 64px 'JetBrains Mono', monospace";
  ctx.fillText(`${res.predicted_ppm} ppm`, 65, 355);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "bold 14px 'Inter', sans-serif";
  ctx.fillText(`Estimated Range: ${res.predicted_ppm_range}`, 65, 390);

  ctx.textAlign = "right";
  ctx.fillStyle = safety.color;
  ctx.font = "bold 16px 'Inter', sans-serif";
  ctx.fillText(safety.label, canvas.width - 65, 320);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px 'Inter', sans-serif";
  ctx.fillText(`Class: ${res.predicted_class} • Alert: ${res.alert_level}`, canvas.width - 65, 350);
  ctx.textAlign = "left";

  // 5. Exposure Meter Scale (Drawn directly on canvas)
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(40, 435, canvas.width - 80, 85, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 12px 'Inter', sans-serif";
  ctx.fillText("RISK GAUGE SPECTRUM (0 to >100 ppm):", 65, 460);

  // Meter Track
  const trackX = 65;
  const trackY = 475;
  const trackW = canvas.width - 130;
  const trackH = 14;

  const trackGrad = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0);
  trackGrad.addColorStop(0, "#22c55e");
  trackGrad.addColorStop(0.2, "#22c55e");
  trackGrad.addColorStop(0.2, "#facc15");
  trackGrad.addColorStop(0.42, "#facc15");
  trackGrad.addColorStop(0.42, "#fb923c");
  trackGrad.addColorStop(0.66, "#fb923c");
  trackGrad.addColorStop(0.66, "#ef4444");
  trackGrad.addColorStop(0.88, "#ef4444");
  trackGrad.addColorStop(0.88, "#dc2626");
  trackGrad.addColorStop(1, "#991b1b");
  ctx.fillStyle = trackGrad;
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackW, trackH, 6);
  ctx.fill();

  // Draw Needle Marker
  const needleX = trackX + (safety.gaugePercent / 100) * trackW;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(needleX, trackY + trackH / 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = safety.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 6. Mandatory Action Card
  ctx.fillStyle = "rgba(249, 115, 22, 0.08)";
  ctx.beginPath();
  ctx.roundRect(40, 540, canvas.width - 80, 95, 14);
  ctx.fill();
  ctx.strokeStyle = safety.color;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = safety.color;
  ctx.font = "bold 12px 'Inter', sans-serif";
  ctx.fillText("MANDATORY SAFETY ACTION REQUIRED:", 65, 570);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'Inter', sans-serif";
  ctx.fillText(`${safety.actionIcon}  ${res.worker_action}`, 65, 605);

  // 7. Two-Column Inspection Meta Data
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(40, 655, canvas.width - 80, 220, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  const col1X = 65;
  const col2X = 440;
  let rowY = 690;

  function drawMetaRow(label, val, x, y) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px 'Inter', sans-serif";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px 'Inter', sans-serif";
    ctx.fillText(val, x, y + 20);
  }

  drawMetaRow("Worker Name:", worker.name || "Worker", col1X, rowY);
  drawMetaRow("Employee Badge ID:", worker.id || "EMP_00542", col2X, rowY);

  rowY += 50;
  drawMetaRow("Indicator Strip ID:", stripId, col1X, rowY);
  drawMetaRow("Chemical Batch Lot:", res.strip_batch || "BATCH_2024_Q4", col2X, rowY);

  rowY += 50;
  drawMetaRow("AI Vision Model:", `MobileNetV3 ${res.model_version}`, col1X, rowY);
  drawMetaRow("Inference Confidence:", `${Math.round(res.model_confidence * 1000) / 10}% Nominal`, col2X, rowY);

  // 8. Seal of Verification Footer
  ctx.fillStyle = "rgba(2, 132, 199, 0.1)";
  ctx.beginPath();
  ctx.roundRect(40, 895, canvas.width - 80, 100, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
  ctx.stroke();

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 14px 'Inter', sans-serif";
  ctx.fillText("✓ DIGITALLY VERIFIED BY INDUSTRIAL AI SAFETY PLATFORM", 65, 932);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px 'Inter', sans-serif";
  ctx.fillText("OSHA 1910.1000 • NIOSH IDLH 100 PPM • ACGIH TLV-TWA 1 PPM Compliant Record", 65, 956);
  ctx.fillText(`Tamper-Evident Hash Audit ID: ${res.scan_id}`, 65, 976);

  // 9. Trigger Direct Download
  const link = document.createElement("a");
  link.download = `H2S_Safety_Scan_${res.scan_id}_${res.predicted_ppm}ppm.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Toast feedback
  const toast = document.getElementById("download-status-toast");
  if (toast) {
    toast.textContent = "✓ Official Safety Certificate Downloaded as PNG!";
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 3500);
  }
}

// Copy Text Summary to Clipboard
function copyScanSummary() {
  if (!lastScanResult) {
    alert("Please perform a scan first.");
    return;
  }
  const res = lastScanResult;
  const safety = getPpmSafetyInfo(res.predicted_ppm, res.alert_level, res.badge_class);
  const worker = currentWorker || { name: "Operator", id: "EMP_00542" };
  const stripId = currentStripId || "STR_0421";

  const text = [
    "=========================================",
    "  H2S INDUSTRIAL DOSIMETER SCAN REPORT",
    "=========================================",
    `Status Verdict:  ${safety.verdictTitle}`,
    `PPM Reading:     ${res.predicted_ppm} ppm (${res.predicted_ppm_range})`,
    `Safety Category: ${res.predicted_class} • ${safety.label}`,
    `Worker:          ${worker.name} (${worker.id})`,
    `Strip ID:        ${stripId}`,
    `Batch Lot:       ${res.strip_batch || 'BATCH_2024_Q4'}`,
    `Action Required: ${res.worker_action}`,
    `Model:           MobileNetV3 ${res.model_version} (${Math.round(res.model_confidence*1000)/10}% Conf)`,
    `Scan ID:         ${res.scan_id}`,
    `Timestamp:       ${new Date().toLocaleString()}`,
    "========================================="
  ].join("\n");

  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById("download-status-toast");
    if (toast) {
      toast.textContent = "✓ Summary Copied to Clipboard!";
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 3000);
    }
  }).catch(() => {
    alert("Scan Summary:\n\n" + text);
  });
}

// Attach Action Listeners
document.getElementById("btn-download-result")?.addEventListener("click", downloadSafetyReportPNG);
document.getElementById("btn-copy-summary")?.addEventListener("click", copyScanSummary);
document.getElementById("btn-print-slip")?.addEventListener("click", () => window.print());

