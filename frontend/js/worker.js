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
    const worker = currentWorker || { name: "John Martinez", id: "EMP_00542" };
    const stripId = currentStripId || "STR_7755";

    // Report Header
    const reportDate = document.getElementById("res-report-date");
    if (reportDate) reportDate.textContent = new Date().toLocaleString();
    const reportAuditId = document.getElementById("res-report-audit-id");
    if (reportAuditId) reportAuditId.textContent = `AUDIT ID: ${res.scan_id}`;

    // 1. Plain-Language Verdict Hero Card (matches reference layout)
    const verdictCard = document.getElementById("res-verdict-card");
    if (verdictCard) {
      verdictCard.style.background = `${safety.color}15`;
    }
    const verdictTitle = document.getElementById("res-verdict-title");
    if (verdictTitle) verdictTitle.style.color = safety.color;
    const verdictIcon = document.getElementById("res-verdict-icon");
    if (verdictIcon) verdictIcon.textContent = safety.verdictIcon;
    const verdictText = document.getElementById("res-verdict-text");
    if (verdictText) verdictText.textContent = safety.verdictTitle;

    // 2. Large PPM Value
    const resPpmEl = document.getElementById("res-ppm");
    if (resPpmEl) {
      resPpmEl.innerHTML = `${ppmVal} <span style="font-size:18px; font-weight:600; opacity:0.8; font-family:'Inter',sans-serif;">ppm</span>`;
      resPpmEl.style.color = safety.color;
      resPpmEl.style.textShadow = safety.textShadow;
    }

    const resActionIcon = document.getElementById("res-action-icon");
    if (resActionIcon) resActionIcon.textContent = safety.actionIcon;
    const resWorkerAction = document.getElementById("res-worker-action");
    if (resWorkerAction) resWorkerAction.textContent = res.worker_action;

    const resPpmRange = document.getElementById("res-ppm-range");
    if (resPpmRange) resPpmRange.textContent = `Est. Range: ${res.predicted_ppm_range}`;

    const safeStatusLabel = document.getElementById("res-safe-status-label");
    if (safeStatusLabel) {
      safeStatusLabel.textContent = safety.label;
      safeStatusLabel.style.color = safety.color;
    }

    const resStatusTag = document.getElementById("res-ppm-status-tag");
    if (resStatusTag) {
      resStatusTag.className = `badge-cat ${safety.badgeClass}`;
      resStatusTag.textContent = safety.label;
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

    // Metadata & Audit fields
    const metaWorker = document.getElementById("res-meta-worker-name");
    if (metaWorker) metaWorker.textContent = worker.name;
    const metaBadge = document.getElementById("res-meta-badge-id");
    if (metaBadge) metaBadge.textContent = worker.id;
    const metaStrip = document.getElementById("res-meta-strip-id");
    if (metaStrip) metaStrip.textContent = stripId;
    const metaBatch = document.getElementById("res-meta-batch");
    if (metaBatch) metaBatch.textContent = res.strip_batch || "BATCH_2024_Q4_LOT_03";
    const metaModel = document.getElementById("res-meta-model-ver");
    if (metaModel) metaModel.textContent = `MobileNetV3 ${res.model_version}`;
    const metaCompliance = document.getElementById("res-meta-compliance");
    if (metaCompliance) metaCompliance.textContent = "OSHA 1910.1000 / NIOSH IDLH";

    const verifiedLine = document.getElementById("res-verified-audit-line");
    if (verifiedLine) verifiedLine.textContent = `Cryptographic Audit ID: ${res.scan_id} • Instant Exposure Assessment`;

    document.getElementById("res-confidence").textContent = `${Math.round(res.model_confidence * 1000) / 10}%`;
    document.getElementById("res-model-ver").textContent = `MobileNetV3 ${res.model_version}`;
    document.getElementById("res-scan-id").textContent = res.scan_id;

    const reactionVal = document.getElementById("res-reaction-val");
    if (reactionVal) reactionVal.textContent = "Cu-PAN Displacement";
    const confidenceVal = document.getElementById("res-confidence-val");
    if (confidenceVal) confidenceVal.textContent = `${Math.round(res.model_confidence * 1000) / 10}% Nominal`;

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
    res._displayImgSrc = displayImgSrc;
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
    } else if (!navigator.onLine || (err.name === "TypeError" && !err.status) || (err.message && err.message.includes("Failed to fetch"))) {
      // Plant Dead-Zone Offline Vaulting
      const offlineId = `OFFLINE_${Date.now().toString(36).toUpperCase()}`;
      await vaultScanOffline({
        worker_id: currentWorker?.id || "EMP_00542",
        strip_id: currentStripId || "STR_OFFLINE",
        image_base64: payload.image_base64,
        simulated_ppm: payload.simulated_ppm || 5.0,
        phone_model: "Worker PWA (Plant Dead Zone)"
      });
      alert(`📡 PLANT DEAD ZONE DETECTED (Offline)\n\nNetwork unavailable in this industrial area.\nYour scan has been securely saved to the Offline Vault (ID: ${offlineId}).\nIt will automatically synchronize as soon as Wi-Fi or cellular signal returns.`);
      showScreen(screenStrip);
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
// Includes Scanned Picture, Highlighted Target Analysis Area, and NO Borders
async function downloadSafetyReportPNG() {
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
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");

  // 1. Sleek Frameless Background Gradient (NO BORDERS)
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#080e1a");
  grad.addColorStop(0.5, "#0b1328");
  grad.addColorStop(1, "#040711");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // NOTE: Zero outer stroke borders or corner frames for pure modern aesthetic

  // 2. Header
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 21px 'Inter', sans-serif";
  ctx.fillText("H₂S INDUSTRIAL OPTICAL DOSIMETER", 44, 52);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px 'Inter', sans-serif";
  ctx.fillText("OFFICIAL AIR QUALITY INSPECTION REPORT", 44, 74);

  const dateStr = new Date().toLocaleString();
  ctx.textAlign = "right";
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "12px 'JetBrains Mono', monospace";
  ctx.fillText(dateStr, canvas.width - 44, 52);
  ctx.fillText(`AUDIT ID: ${res.scan_id}`, canvas.width - 44, 74);
  ctx.textAlign = "left";

  // Subtle separation line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(44, 92);
  ctx.lineTo(canvas.width - 44, 92);
  ctx.stroke();

  // 3. Verdict Hero Card (Soft borderless rounded fill)
  ctx.fillStyle = `${safety.color}15`;
  ctx.beginPath();
  ctx.roundRect(44, 108, canvas.width - 88, 110, 14);
  ctx.fill();

  // Left: Verdict & Action Directive
  ctx.fillStyle = safety.color;
  ctx.font = "bold 24px 'Inter', sans-serif";
  ctx.fillText(`${safety.verdictIcon}  ${safety.verdictTitle}`, 68, 150);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px 'Inter', sans-serif";
  ctx.fillText(`Required Action:  ${safety.actionIcon} ${res.worker_action}`, 68, 188);

  // Right: Large PPM Readout
  ctx.textAlign = "right";
  ctx.fillStyle = safety.color;
  ctx.font = "800 48px 'JetBrains Mono', monospace";
  ctx.fillText(`${res.predicted_ppm} ppm`, canvas.width - 68, 156);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px 'Inter', sans-serif";
  ctx.fillText(`Est. Range: ${res.predicted_ppm_range} • ${safety.label}`, canvas.width - 68, 188);
  ctx.textAlign = "left";

  // 4. SCANNED STRIP & ANALYSIS AREA (THE PIC & ANALYSIS AREA!)
  const picCardY = 234;
  const picCardH = 340;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(44, picCardY, canvas.width - 88, picCardH, 14);
  ctx.fill();

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 13px 'Inter', sans-serif";
  ctx.fillText("📷 SCANNED DOSIMETER & TARGET ANALYSIS AREA (ROI)", 68, picCardY + 30);

  const roiCoords = res.roi_coordinates || { percent: { x: 20, y: 20, width: 60, height: 60 } };
  const p = roiCoords.percent || { x: 20, y: 20, width: 60, height: 60 };

  ctx.textAlign = "right";
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  ctx.fillText(`TARGET ROI: ${Math.round(p.width)}% × ${Math.round(p.height)}%`, canvas.width - 68, picCardY + 30);
  ctx.textAlign = "left";

  // Load the Scanned Strip Image (real uploaded photo, raw url, or generated strip)
  let imgSrc = res._displayImgSrc || document.getElementById("res-scanned-img")?.src;
  if (!imgSrc && scanMode === "sim") {
    const cupan = getCupanColor(res.predicted_ppm);
    imgSrc = `data:image/png;base64,${generateTestStripBase64(cupan.rgb)}`;
  }

  let loadedImg = null;
  if (imgSrc) {
    try {
      loadedImg = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = imgSrc;
      });
    } catch (e) {
      console.warn("Could not load image for canvas export:", e);
    }
  }

  // Draw Photo Container Box
  const photoBoxX = 68;
  const photoBoxY = picCardY + 46;
  const photoBoxW = 450;
  const photoBoxH = 264;

  ctx.fillStyle = "#020617";
  ctx.beginPath();
  ctx.roundRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 10);
  ctx.fill();

  if (loadedImg && loadedImg.width > 0 && loadedImg.height > 0) {
    const imgAspect = loadedImg.width / loadedImg.height;
    const boxAspect = photoBoxW / photoBoxH;
    let drawW, drawH, drawX, drawY;

    if (imgAspect > boxAspect) {
      drawW = photoBoxW;
      drawH = photoBoxW / imgAspect;
      drawX = photoBoxX;
      drawY = photoBoxY + (photoBoxH - drawH) / 2;
    } else {
      drawH = photoBoxH;
      drawW = photoBoxH * imgAspect;
      drawX = photoBoxX + (photoBoxW - drawW) / 2;
      drawY = photoBoxY;
    }

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 10);
    ctx.clip();
    ctx.drawImage(loadedImg, drawX, drawY, drawW, drawH);

    // DRAW THE ANALYSIS AREA (ROI) OVERLAY OVER THE STRIP PHOTO
    const roiX = drawX + (p.x / 100) * drawW;
    const roiY = drawY + (p.y / 100) * drawH;
    const roiW = (p.width / 100) * drawW;
    const roiH = (p.height / 100) * drawH;

    // Glowing highlight over the analyzed chemical core
    ctx.fillStyle = "rgba(34, 197, 94, 0.22)";
    ctx.fillRect(roiX, roiY, roiW, roiH);

    // Precision bounding border
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(roiX, roiY, roiW, roiH);

    // Corner reticle accents
    const rCorner = Math.min(12, roiW / 4, roiH / 4);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    // TL
    ctx.beginPath();
    ctx.moveTo(roiX, roiY + rCorner); ctx.lineTo(roiX, roiY); ctx.lineTo(roiX + rCorner, roiY);
    ctx.stroke();
    // TR
    ctx.beginPath();
    ctx.moveTo(roiX + roiW - rCorner, roiY); ctx.lineTo(roiX + roiW, roiY); ctx.lineTo(roiX + roiW, roiY + rCorner);
    ctx.stroke();
    // BL
    ctx.beginPath();
    ctx.moveTo(roiX, roiY + roiH - rCorner); ctx.lineTo(roiX, roiY + roiH); ctx.lineTo(roiX + rCorner, roiY + roiH);
    ctx.stroke();
    // BR
    ctx.beginPath();
    ctx.moveTo(roiX + roiW - rCorner, roiY + roiH); ctx.lineTo(roiX + roiW, roiY + roiH); ctx.lineTo(roiX + roiW, roiY + roiH - rCorner);
    ctx.stroke();

    // Floating ROI Label Tag
    const tagH = 20;
    const tagW = 120;
    const tagX = roiX + (roiW - tagW) / 2;
    const tagY = roiY + (roiH - tagH) / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagW, tagH, 4);
    ctx.fill();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 9px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ANALYZED ZONE", tagX + tagW / 2, tagY + 14);
    ctx.textAlign = "left";

    ctx.restore();
  } else {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Dosimeter Scan Visual Record Attached", photoBoxX + photoBoxW / 2, photoBoxY + photoBoxH / 2);
    ctx.textAlign = "left";
  }

  // Side Panel: Sampled Dye Colorimetry (Beside the picture)
  const sideX = photoBoxX + photoBoxW + 24;
  const feat = res.extracted_features || {};
  const rgb = feat.mean_rgb || [233, 144, 83];
  const hex = res.color_hex || "#E99053";

  // Swatch Box
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.roundRect(sideX, photoBoxY + 8, 48, 48, 10);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px 'JetBrains Mono', monospace";
  ctx.fillText(hex.toUpperCase(), sideX + 60, photoBoxY + 28);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px 'Inter', sans-serif";
  ctx.fillText("Sampled Dye Color", sideX + 60, photoBoxY + 46);

  // Optical metrics
  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'Inter', sans-serif";
  ctx.fillText("RGB CHANNELS:", sideX, photoBoxY + 84);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px 'JetBrains Mono', monospace";
  ctx.fillText(`[${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}]`, sideX, photoBoxY + 102);

  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'Inter', sans-serif";
  ctx.fillText("HUE & CHROMA:", sideX, photoBoxY + 130);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 13px 'JetBrains Mono', monospace";
  ctx.fillText(`Hue: ${feat.hue_angle ?? '24.4'}° | Chroma: ${feat.chroma ?? '54.2'}`, sideX, photoBoxY + 148);

  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'Inter', sans-serif";
  ctx.fillText("CHEMICAL REACTION:", sideX, photoBoxY + 176);
  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 12px 'Inter', sans-serif";
  ctx.fillText("Cu-PAN Displacement", sideX, photoBoxY + 194);

  ctx.fillStyle = "#64748b";
  ctx.font = "11px 'Inter', sans-serif";
  ctx.fillText("AI VISION CONFIDENCE:", sideX, photoBoxY + 222);
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 13px 'Inter', sans-serif";
  ctx.fillText(`${Math.round(res.model_confidence * 1000) / 10}% Nominal`, sideX, photoBoxY + 240);

  // 5. Exposure Meter Gauge (Soft dark fill, no border)
  const gaugeY = 590;
  const gaugeH = 88;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(44, gaugeY, canvas.width - 88, gaugeH, 14);
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 11px 'Inter', sans-serif";
  ctx.fillText("GAS EXPOSURE METER SPECTRUM (0 TO >100 PPM):", 68, gaugeY + 24);

  // Gauge Track
  const gTrackX = 68;
  const gTrackY = gaugeY + 36;
  const gTrackW = canvas.width - 136;
  const gTrackH = 12;

  const tGrad = ctx.createLinearGradient(gTrackX, 0, gTrackX + gTrackW, 0);
  tGrad.addColorStop(0, "#22c55e");
  tGrad.addColorStop(0.2, "#22c55e");
  tGrad.addColorStop(0.2, "#facc15");
  tGrad.addColorStop(0.42, "#facc15");
  tGrad.addColorStop(0.42, "#fb923c");
  tGrad.addColorStop(0.66, "#fb923c");
  tGrad.addColorStop(0.66, "#ef4444");
  tGrad.addColorStop(0.88, "#ef4444");
  tGrad.addColorStop(0.88, "#dc2626");
  tGrad.addColorStop(1, "#991b1b");
  ctx.fillStyle = tGrad;
  ctx.beginPath();
  ctx.roundRect(gTrackX, gTrackY, gTrackW, gTrackH, 6);
  ctx.fill();

  // Pin needle
  const pinX = gTrackX + (safety.gaugePercent / 100) * gTrackW;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(pinX, gTrackY + gTrackH / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = safety.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Gauge scale labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px 'Inter', sans-serif";
  ctx.fillText("Safe (0-1)", gTrackX, gTrackY + 28);
  ctx.fillText("Caution (1-10)", gTrackX + gTrackW * 0.22, gTrackY + 28);
  ctx.fillText("Warning (10-50)", gTrackX + gTrackW * 0.44, gTrackY + 28);
  ctx.fillText("Danger (50-100)", gTrackX + gTrackW * 0.68, gTrackY + 28);
  ctx.textAlign = "right";
  ctx.fillText("Evac (>100)", gTrackX + gTrackW, gTrackY + 28);
  ctx.textAlign = "left";

  // 6. Inspection Metadata (Soft dark fill, no border)
  const metaY = 692;
  const metaH = 146;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(44, metaY, canvas.width - 88, metaH, 14);
  ctx.fill();

  const c1 = 68;
  const c2 = 330;
  const c3 = 580;
  let mY = metaY + 34;

  function drawCell(label, val, x, y) {
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Inter', sans-serif";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Inter', sans-serif";
    ctx.fillText(val, x, y + 20);
  }

  drawCell("Worker Name:", worker.name || "Operator", c1, mY);
  drawCell("Employee Badge ID:", worker.id || "EMP_00542", c2, mY);
  drawCell("Dosimeter Strip ID:", stripId, c3, mY);

  mY += 54;
  drawCell("Chemical Batch:", res.strip_batch || "BATCH_2024_Q4", c1, mY);
  drawCell("AI Model Version:", `MobileNetV3 ${res.model_version}`, c2, mY);
  drawCell("Standard Compliance:", "OSHA 1910.1000 / NIOSH IDLH", c3, mY);

  // 7. Verified Stamp Footer
  const footerY = 852;
  const footerH = 92;
  ctx.fillStyle = "rgba(2, 132, 199, 0.08)";
  ctx.beginPath();
  ctx.roundRect(44, footerY, canvas.width - 88, footerH, 14);
  ctx.fill();

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 13px 'Inter', sans-serif";
  ctx.fillText("✓ DIGITALLY VERIFIED INDUSTRIAL AI SAFETY CERTIFICATE", 68, footerY + 30);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px 'Inter', sans-serif";
  ctx.fillText(`Cryptographic Audit ID: ${res.scan_id} • Instant Exposure Assessment`, 68, footerY + 52);
  ctx.fillText("Standard: OSHA PEL (10-20 ppm), ACGIH TLV (1 ppm), NIOSH IDLH (100 ppm)", 68, footerY + 68);

  // 8. Trigger Direct PNG Download
  const link = document.createElement("a");
  link.download = `H2S_Safety_Scan_${res.scan_id}_${res.predicted_ppm}ppm.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Toast feedback
  const toast = document.getElementById("download-status-toast");
  if (toast) {
    toast.textContent = "✓ Safety Result & Analysis Zone downloaded as PNG!";
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

// ============================================================================
// Section 7: Workers Roster & Wristband QR Auto-Binding
// ============================================================================
const modalQr = document.getElementById("modal-wristband-qr");
const btnOpenQr = document.getElementById("btn-open-qr-modal");
const btnCloseQr = document.getElementById("btn-close-qr-modal");
const btnSimulateQr = document.getElementById("btn-simulate-qr-scan");
const btnApplyManualQr = document.getElementById("btn-apply-manual-qr");
const manualQrInput = document.getElementById("manual-qr-payload");

btnOpenQr?.addEventListener("click", () => {
  if (modalQr) modalQr.style.display = "flex";
});
btnCloseQr?.addEventListener("click", () => {
  if (modalQr) modalQr.style.display = "none";
});

function applyParsedQRPayload(parsed) {
  if (!parsed || !parsed.stripId) {
    alert("Invalid QR format. Expected H2S://V2?w=...&b=...&s=...&m=...");
    return;
  }
  document.getElementById("strip-input-id").value = parsed.stripId;
  const lockCard = document.getElementById("wristband-locked-card");
  const lockInfo = document.getElementById("wb-lock-info");
  if (lockCard && lockInfo) {
    lockCard.style.display = "block";
    lockInfo.innerHTML = `
      <strong>Worker:</strong> ${parsed.workerId || (currentWorker ? currentWorker.id : 'Auto')} • 
      <strong>Batch:</strong> ${parsed.batchId || 'BATCH_2026_Q1_01'}<br>
      <strong>Strip:</strong> <span class="font-mono">${parsed.stripId}</span> • 
      <strong>Method:</strong> <span style="color:#38bdf8; font-weight:700;">${(parsed.methodKey || 'CUPAN_OPTICAL').toUpperCase()}</span> • 
      <strong>Exp:</strong> ${parsed.expiry || 'Active'}
    `;
  }
  if (modalQr) modalQr.style.display = "none";
}

btnSimulateQr?.addEventListener("click", () => {
  const wId = currentWorker ? currentWorker.id : "EMP_00542";
  const sId = `STR_Q1_${Math.floor(1000 + Math.random() * 9000)}`;
  const simPayload = `H2S://V2?w=${wId}&b=BATCH_2026_Q1_01&s=${sId}&m=cupan_optical&exp=2026-06-15`;
  const parsed = window.QRGenerator ? window.QRGenerator.parsePayload(simPayload) : {
    workerId: wId, batchId: "BATCH_2026_Q1_01", stripId: sId, methodKey: "cupan_optical", expiry: "2026-06-15"
  };
  applyParsedQRPayload(parsed);
});

btnApplyManualQr?.addEventListener("click", () => {
  const raw = manualQrInput ? manualQrInput.value.trim() : "";
  if (!raw) return;
  const parsed = window.QRGenerator ? window.QRGenerator.parsePayload(raw) : null;
  if (!parsed) {
    alert("Could not parse wristband QR payload. Check syntax.");
    return;
  }
  applyParsedQRPayload(parsed);
});

// ============================================================================
// Section 8: Trust Certificate Modal Viewer
// ============================================================================
const modalTrust = document.getElementById("modal-trust-cert");
const btnCloseTrust = document.getElementById("btn-close-trust-modal");
const trustModalBody = document.getElementById("trust-modal-body");

btnCloseTrust?.addEventListener("click", () => {
  if (modalTrust) modalTrust.style.display = "none";
});

async function openTrustCertificateModal(scanId) {
  if (!scanId || !modalTrust || !trustModalBody) return;
  modalTrust.style.display = "flex";
  trustModalBody.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8;">Verifying cryptographic audit trail...</div>`;

  try {
    const cert = await API.getAuditCertificate(scanId);
    trustModalBody.innerHTML = `
      <div style="background:rgba(2,132,199,0.1); border:1px solid rgba(56,189,248,0.25); border-radius:12px; padding:12px; margin-bottom:12px;">
        <div style="color:#38bdf8; font-weight:800; font-size:11px; margin-bottom:4px;">CRYPTOGRAPHIC SEAL</div>
        <div style="font-family:'JetBrains Mono'; font-size:11px; color:#ffffff; word-break:break-all;">${cert.cryptographic_seal}</div>
        <div style="font-size:10px; color:#94a3b8; margin-top:4px;">Algorithm: ${cert.hash_algorithm} • Certified Immutable</div>
      </div>

      <div style="background:#1e293b; border-radius:10px; padding:10px; margin-bottom:12px; font-size:11px; display:flex; flex-direction:column; gap:6px;">
        <div><span style="color:#94a3b8;">Raw Optical Hash (SHA-256):</span><br><strong style="font-family:'JetBrains Mono'; color:#38bdf8; font-size:10px; word-break:break-all;">${cert.raw_image_hash}</strong></div>
        <div><span style="color:#94a3b8;">CV Pipeline Version:</span> <strong style="color:#fff;">${cert.pipeline_version}</strong></div>
        <div><span style="color:#94a3b8;">Calibration Ladder ID:</span> <strong style="color:#fff;">${cert.calibration_version} (${cert.calibration_curve_id})</strong></div>
        <div><span style="color:#94a3b8;">Logged Operator:</span> <strong style="color:#fff;">${cert.operator_id} (${cert.worker_name})</strong></div>
        <div><span style="color:#94a3b8;">Timestamp:</span> <strong style="color:#fff;">${cert.timestamp}</strong></div>
      </div>

      <div style="background:rgba(255,255,255,0.02); border:1px solid #334155; border-radius:10px; padding:10px; margin-bottom:12px;">
        <div style="color:#f59e0b; font-weight:700; font-size:11px; margin-bottom:4px;">HOW DO WE TRUST THIS NUMBER?</div>
        <pre style="white-space:pre-wrap; font-size:10.5px; color:#cbd5e1; font-family:inherit; margin:0; line-height:1.4;">${cert.trust_explanation}</pre>
      </div>

      <button type="button" class="btn btn-secondary" onclick="window.print()" style="width:100%; justify-content:center; padding:8px; font-size:11px;">
        🖨️ Print Trust Certificate Slip
      </button>
    `;
  } catch (err) {
    trustModalBody.innerHTML = `<div style="color:#f87171; padding:14px; text-align:center;">Failed to load certificate: ${err.detail || 'Audit record unavailable'}</div>`;
  }
}

// Make certificate clickable from result screen
const certBanner = document.querySelector("#screen-result div[style*='DIGITALLY VERIFIED INDUSTRIAL AI SAFETY CERTIFICATE']")?.parentElement;
if (certBanner) {
  certBanner.style.cursor = "pointer";
  certBanner.title = "Click to inspect cryptographic audit certificate";
  certBanner.addEventListener("click", () => {
    if (lastScanResult && lastScanResult.scan_id) {
      openTrustCertificateModal(lastScanResult.scan_id);
    }
  });
}

// ============================================================================
// Section 10: Offline PWA & Plant Dead-Zone IndexedDB Vault
// ============================================================================
const DB_NAME = "H2SPlantDeadZoneVault";
const STORE_NAME = "offline_scans";

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "vault_id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function vaultScanOffline(payload) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const item = { ...payload, vaulted_at: new Date().toISOString() };
    const req = store.add(item);
    req.onsuccess = () => {
      updateOfflineVaultUI();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getVaultedScans() {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function clearVaultedScan(vaultId) {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(vaultId);
    tx.oncomplete = () => {
      updateOfflineVaultUI();
      resolve();
    };
  });
}

async function updateOfflineVaultUI() {
  const statusDot = document.getElementById("pwa-status-dot");
  const statusText = document.getElementById("pwa-status-text");
  const syncPill = document.getElementById("pwa-sync-pill");
  const isOnline = navigator.onLine;

  const vaulted = await getVaultedScans();

  if (isOnline) {
    if (statusDot) {
      statusDot.style.background = "#22c55e";
      statusDot.style.boxShadow = "0 0 8px #22c55e";
    }
    if (statusText) statusText.textContent = "Plant Network Online";
  } else {
    if (statusDot) {
      statusDot.style.background = "#f59e0b";
      statusDot.style.boxShadow = "0 0 8px #f59e0b";
    }
    if (statusText) statusText.textContent = "Plant Dead Zone (Offline Vault Active)";
  }

  if (syncPill) {
    if (vaulted.length > 0) {
      syncPill.style.display = "inline-block";
      syncPill.textContent = `${vaulted.length} Vaulted`;
    } else {
      syncPill.style.display = "none";
    }
  }
}

async function syncOfflineVault() {
  if (!navigator.onLine) return;
  const vaulted = await getVaultedScans();
  if (vaulted.length === 0) return;

  const statusText = document.getElementById("pwa-status-text");
  if (statusText) statusText.textContent = `🔄 Syncing ${vaulted.length} vaulted scan(s)...`;

  for (const item of vaulted) {
    try {
      const uploadPayload = {
        worker_id: item.worker_id,
        strip_id: item.strip_id,
        image_base64: item.image_base64,
        simulated_ppm: item.simulated_ppm,
        phone_model: item.phone_model || "Offline Plant Scanner PWA"
      };
      await API.submitScan(uploadPayload);
      await clearVaultedScan(item.vault_id);
    } catch (err) {
      console.warn("Could not sync item:", err);
    }
  }
  await updateOfflineVaultUI();
}

// Service Worker & Connectivity Listeners
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(() => {
      console.log("[PWA] Plant Safety ServiceWorker active");
    }).catch(e => console.warn("[PWA] ServiceWorker error:", e));
  });
}

window.addEventListener("online", () => {
  updateOfflineVaultUI();
  syncOfflineVault();
});
window.addEventListener("offline", () => {
  updateOfflineVaultUI();
});

// Initialize status on start
updateOfflineVaultUI();

// 7. Complete Scan & Return Listener
document.getElementById("btn-finish-scan")?.addEventListener("click", () => {
  if (rejectionCard) rejectionCard.style.display = "none";
  showScreen(screenStrip);
});

// ============================================================================
// Section 7: Wristband QR Auto-Binding in Worker Scanner
// ============================================================================
const modalWristbandQr = document.getElementById("modal-wristband-qr");
const btnOpenQrModal = document.getElementById("btn-open-qr-modal");
const btnCloseQrModal = document.getElementById("btn-close-qr-modal");
const btnSimulateQrScan = document.getElementById("btn-simulate-qr-scan");
const manualQrPayload = document.getElementById("manual-qr-payload");
const btnApplyManualQr = document.getElementById("btn-apply-manual-qr");
const wristbandLockedCard = document.getElementById("wristband-locked-card");
const wbLockInfo = document.getElementById("wb-lock-info");

let boundWristbandData = null;

btnOpenQrModal?.addEventListener("click", () => {
  if (modalWristbandQr) modalWristbandQr.style.display = "flex";
});
btnCloseQrModal?.addEventListener("click", () => {
  if (modalWristbandQr) modalWristbandQr.style.display = "none";
});

function applyWristbandData(data) {
  boundWristbandData = data;
  if (data.strip_id) {
    document.getElementById("strip-input-id").value = data.strip_id;
  }
  if (wristbandLockedCard && wbLockInfo) {
    wbLockInfo.innerHTML = `
      Worker: <strong style="color:#fff;">${data.worker_id || currentWorker?.id || 'EMP_00542'}</strong> • 
      Batch: <strong style="color:#38bdf8;">${data.batch_id || 'BATCH_2026_Q1_01'}</strong> • 
      Method: <strong style="color:#facc15;">${data.method_key || 'cupan_optical'}</strong>
    `;
    wristbandLockedCard.style.display = "block";
  }
  if (modalWristbandQr) modalWristbandQr.style.display = "none";
}

btnSimulateQrScan?.addEventListener("click", async () => {
  const workerId = currentWorker ? currentWorker.id : "EMP_00542";
  const batchId = "BATCH_2026_Q1_01";
  const stripId = `STR_WB_${Math.floor(1000 + Math.random() * 9000)}`;
  const methodKey = "cupan_optical";
  const expiry = "2026-06-15";
  
  try {
    await API.createStrip(stripId, batchId, workerId, 90);
  } catch (e) {
    console.warn("Auto-issue strip notice:", e);
  }
  
  applyWristbandData({
    worker_id: workerId,
    batch_id: batchId,
    strip_id: stripId,
    method_key: methodKey,
    expiry_date: expiry
  });
});

btnApplyManualQr?.addEventListener("click", () => {
  const raw = (manualQrPayload?.value || "").trim();
  if (!raw) return;
  
  let data = {};
  if (window.QRGenerator && window.QRGenerator.parseWristbandPayload) {
    data = window.QRGenerator.parseWristbandPayload(raw) || {};
  } else {
    try {
      const qs = raw.includes("?") ? raw.split("?")[1] : raw;
      const params = new URLSearchParams(qs);
      data = {
        worker_id: params.get("w"),
        batch_id: params.get("b"),
        strip_id: params.get("s"),
        method_key: params.get("m"),
        expiry_date: params.get("exp")
      };
    } catch (e) {
      console.warn("Manual QR parse error:", e);
    }
  }
  
  if (data.strip_id || data.batch_id) {
    applyWristbandData(data);
  } else {
    alert("Invalid QR payload format. Expected: H2S://V2?w=...&b=...&s=...&m=...");
  }
});

// ============================================================================
// Section 8: Cryptographic Trust Certificate Inspection in Worker Screen
// ============================================================================
const modalTrustCert = document.getElementById("modal-trust-cert");
const trustModalBody = document.getElementById("trust-modal-body");

async function openTrustCertForWorker() {
  if (!modalTrustCert || !trustModalBody) return;
  modalTrustCert.style.display = "flex";
  
  const scanId = lastScanResult?.scan_id || document.getElementById("res-scan-id")?.textContent || "SCAN_20260916_361C16";
  trustModalBody.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8;">Verifying cryptographic audit trail...</div>`;
  
  try {
    const cert = await API.getAuditCertificate(scanId);
    trustModalBody.innerHTML = `
      <div class="trust-cert-seal">
        <div style="color:#38bdf8; font-weight:800; font-size:10px; letter-spacing:1px; margin-bottom:4px;">CRYPTOGRAPHIC DIGITAL SEAL</div>
        <div style="font-family:'JetBrains Mono'; font-size:11px; color:#ffffff; font-weight:700;">${cert.cryptographic_seal}</div>
        <div style="font-size:9.5px; color:#94a3b8; margin-top:4px;">Hash Algorithm: ${cert.hash_algorithm}</div>
      </div>

      <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:10px; margin-bottom:12px; font-size:11px; display:flex; flex-direction:column; gap:5px;">
        <div><span style="color:#94a3b8;">Worker / Operator:</span> <strong style="color:#fff;">${cert.worker_name} (${cert.worker_id})</strong></div>
        <div><span style="color:#94a3b8;">Exposure Reading:</span> <strong style="color:#38bdf8;">${cert.predicted_ppm} ppm (${cert.exposure_level})</strong></div>
        <div><span style="color:#94a3b8;">Raw Optical Image Hash (SHA-256):</span><br><code class="trust-hash-badge">${cert.raw_image_hash}</code></div>
        <div><span style="color:#94a3b8;">Vision Pipeline:</span> <strong style="color:#fff;">${cert.pipeline_version}</strong></div>
        <div><span style="color:#94a3b8;">Calibration Version:</span> <strong style="color:#fff;">${cert.calibration_version}</strong></div>
        <div><span style="color:#94a3b8;">Batch Lot:</span> <strong style="color:#fff;">${cert.strip_batch}</strong></div>
        <div><span style="color:#94a3b8;">Timestamp:</span> <strong style="color:#fff;">${cert.timestamp}</strong></div>
      </div>

      <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:10px; padding:10px; margin-bottom:12px;">
        <div style="color:#f59e0b; font-weight:800; font-size:10px; margin-bottom:4px;">HOW DO WE TRUST THIS NUMBER?</div>
        <pre style="white-space:pre-wrap; font-size:10px; color:#cbd5e1; font-family:inherit; margin:0; line-height:1.4;">${cert.trust_explanation}</pre>
      </div>

      <button type="button" class="btn btn-secondary" id="btn-close-trust-inner" style="width:100%; justify-content:center; padding:8px; font-size:11px;">Close Certificate</button>
    `;
    document.getElementById("btn-close-trust-inner")?.addEventListener("click", () => {
      modalTrustCert.style.display = "none";
    });
  } catch (err) {
    trustModalBody.innerHTML = `<div style="color:#f87171; padding:20px; text-align:center;">Failed to load certificate: ${err.detail || 'Audit record unavailable'}</div>`;
  }
}

document.getElementById("btn-inspect-trust-cert")?.addEventListener("click", openTrustCertForWorker);
document.getElementById("res-verified-audit-line")?.addEventListener("click", openTrustCertForWorker);
document.getElementById("btn-close-trust-modal")?.addEventListener("click", () => {
  if (modalTrustCert) modalTrustCert.style.display = "none";
});

