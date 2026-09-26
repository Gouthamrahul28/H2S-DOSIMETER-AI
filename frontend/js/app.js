/**
 * Supervisor Dashboard Interactive Logic
 */

import { API } from "./api.js";

// Tab Navigation
const tabButtons = document.querySelectorAll(".nav-item[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    tabPanels.forEach(p => p.classList.remove("active"));

    btn.classList.add("active");
    const targetId = btn.getAttribute("data-tab");
    document.getElementById(targetId).classList.add("active");

    const titles = {
      "tab-operations": "Shift Monitor (Supervisor Home) & Operations Dashboard",
      "tab-batches": "Badge Stock / Wristband Lab & Virgin Baseline QC",
      "tab-ai-model": "AI Model Center & Version Registry",
      "tab-safety": "Safety Center & Threshold Version Control",
      "tab-workers": "Worker & Analytics Explorer",
      "tab-audit": "Audit Logs & Git Version History"
    };
    document.getElementById("page-title").textContent = titles[targetId] || "Dashboard";
  });
});

// Theme Controller (Light / Dark Mode)
let activeModelCache = null;

function initTheme() {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  const toggleText = document.getElementById("theme-toggle-text");

  function updateToggleUI(theme) {
    if (toggleText) {
      toggleText.textContent = theme === "light" ? "Light" : "Dark";
    }
  }

  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  updateToggleUI(currentTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const active = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = active === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", nextTheme);
      try {
        localStorage.setItem("theme", nextTheme);
      } catch (e) {}
      updateToggleUI(nextTheme);

      // Re-render graphs so that SVG dynamic elements update to new theme
      if (activeModelCache) {
        renderLearningCurve(activeModelCache.training_curve || []);
        renderVersionComparison(activeModelCache.model_comparison || []);
        renderPerClassAccuracy(activeModelCache.per_class_metrics || []);
        renderConfusionMatrix(activeModelCache.confusion_matrix, activeModelCache.classes);
        renderCalibrationCurve(activeModelCache.calibration_curve || []);
        renderParityPlot(activeModelCache.parity_plot || {});
      }
    });
  }

  // Cross-tab synchronization
  window.addEventListener("storage", (e) => {
    if (e.key === "theme" && e.newValue) {
      document.documentElement.setAttribute("data-theme", e.newValue);
      updateToggleUI(e.newValue);
      if (activeModelCache) {
        renderLearningCurve(activeModelCache.training_curve || []);
        renderVersionComparison(activeModelCache.model_comparison || []);
        renderPerClassAccuracy(activeModelCache.per_class_metrics || []);
        renderConfusionMatrix(activeModelCache.confusion_matrix, activeModelCache.classes);
        renderCalibrationCurve(activeModelCache.calibration_curve || []);
        renderParityPlot(activeModelCache.parity_plot || {});
      }
    }
  });
}

// Shift Monitor State
let currentStandard = "FACTORIES_ACT";
let shiftWorkersCache = [];

// Load All Dashboard Data
async function loadDashboard() {
  try {
    await Promise.all([
      loadShiftMonitor(),
      loadBatches(),
      loadKPIs(),
      loadScans(),
      loadAlerts(),
      loadAIModelCenter(),
      loadSafetyCenter(),
      loadWorkers(),
      loadAuditAndGit()
    ]);
  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

// 0. Shift Monitor & Cumulative Dose Engine
async function loadShiftMonitor() {
  try {
    const data = await API.getShiftMonitor(currentStandard);
    if (!data) return;

    // Shift Info Header
    const shift = data.shift_info;
    const std = data.standard_applied;
    const nameEl = document.getElementById("shift-display-name");
    if (nameEl) nameEl.textContent = shift.shift_name;

    const badgeEl = document.getElementById("shift-elapsed-badge");
    if (badgeEl) badgeEl.textContent = `⏱️ ${shift.elapsed_hours}h elapsed / ${shift.total_shift_hours}h shift`;

    // Standard description
    const descEl = document.getElementById("shift-standard-desc");
    if (descEl) {
      if (currentStandard === "DUAL") {
        descEl.innerHTML = `<strong>Dual Compliance Mode:</strong> Comparing live shift exposure against both <em>Factories Act, 1948</em> (10 ppm TWA / 15 ppm STEL) and <em>ACGIH</em> (1 ppm TWA / 5 ppm STEL).`;
      } else {
        descEl.innerHTML = `<strong>${std.name}:</strong> 8-hr TWA ceiling: <strong>${std.twa_ppm} ppm</strong> (${std.shift_dose_limit_ppm_h} ppm·h) | 15-min STEL: <strong>${std.stel_ppm} ppm</strong>. Each method computes dose with its specific curve.`;
      }
    }

    // Active Standard Badge
    const activeBadge = document.getElementById("active-std-badge");
    if (activeBadge) {
      activeBadge.textContent = currentStandard === "DUAL" ? "Dual Compliance View" : std.name;
    }

    // Shift KPIs
    const kpis = data.summary_kpis;
    const totalEl = document.getElementById("shift-kpi-total");
    if (totalEl) totalEl.textContent = kpis.monitored_workers;
    const emEl = document.getElementById("shift-kpi-emerald");
    if (emEl) emEl.textContent = kpis.emerald_count;
    const amEl = document.getElementById("shift-kpi-amber");
    if (amEl) amEl.textContent = kpis.amber_count;
    const redEl = document.getElementById("shift-kpi-red");
    if (redEl) redEl.textContent = kpis.red_count;
    const avgEl = document.getElementById("shift-kpi-avg-dose");
    if (avgEl) avgEl.textContent = `${kpis.avg_shift_dose_ppm_h} ppm·h`;

    // Cache workers for search
    shiftWorkersCache = data.workers || [];
    renderShiftWorkersTable(shiftWorkersCache, currentStandard);
  } catch (err) {
    console.error("Error loading shift monitor:", err);
  }
}

function renderShiftWorkersTable(workers, standard) {
  const tbody = document.getElementById("shift-workers-table-body");
  if (!tbody) return;

  if (!workers || workers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">No workers match the search criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = workers.map(w => {
    const tier = w.tier;
    const tierClass = tier.tier_code === "RED" ? "tier-red" : (tier.tier_code === "AMBER" ? "tier-amber" : "tier-emerald");
    const tierIcon = tier.tier_code === "RED" ? "🚨" : (tier.tier_code === "AMBER" ? "⚠️" : "✓");

    // Method badge class & icon
    const mKey = w.method_key;
    const mBadgeClass = mKey === "CUPAN_OPTICAL" ? "method-cupan" : (mKey === "LEAD_ACETATE" ? "method-lead" : (mKey === "ELECTROCHEMICAL" ? "method-elec" : "method-nano"));
    const methodInfo = w.method || {};

    // Compliance Bar Calculation
    const comp = w.compliance || {};
    const pct = standard === "ACGIH" ? comp.acgih_pct : comp.factories_act_pct;
    const barColor = pct >= 100 ? "#ef4444" : (pct >= 50 ? "#f59e0b" : "#10b981");

    const initials = (w.name || "W").split(" ").map(p => p[0]).slice(0, 2).join("");

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:34px; height:34px; border-radius:9px; background:linear-gradient(135deg, rgba(16,185,129,0.22), rgba(5,150,105,0.15)); border:1px solid rgba(16,185,129,0.35); display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--accent-mint); font-size:12px; font-family:'Plus Jakarta Sans'; flex-shrink:0;">${initials}</div>
            <div>
              <div style="font-weight:700; color:var(--text-primary); font-size:13.5px;">${w.name}</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono';">${w.badge_number} • ${w.department}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="method-badge ${mBadgeClass}" title="${methodInfo.name} - Calibration: ${methodInfo.formula || 'Calibrated'}">
            <span>${methodInfo.icon || '🧪'}</span>
            <span>${methodInfo.short_badge || w.method_key}</span>
          </span>
          <div style="font-size:10px; color:var(--text-muted); margin-top:3px; font-family:'JetBrains Mono';">${methodInfo.formula || ''}</div>
        </td>
        <td>
          <div class="dose-val-display" style="color:var(--accent-mint);">${w.cumulative_dose_ppm_h.toFixed(2)} <span style="font-size:11px; color:var(--text-muted);">ppm·h</span></div>
          <div style="font-size:10.5px; color:var(--text-muted);">TWA: ${w.twa_current_ppm.toFixed(2)} ppm</div>
        </td>
        <td>
          <span class="tier-badge ${tierClass}">
            <span>${tierIcon}</span>
            <span>${tier.tier_badge}</span>
          </span>
          <div style="font-size:10px; color:${tier.color_hex}; margin-top:3px; font-weight:600;">${tier.status_text}</div>
        </td>
        <td>
          <div style="font-weight:600; color:var(--text-secondary);">${w.last_read_str}</div>
          <div style="font-size:10.5px; color:var(--text-muted);">${w.last_ppm.toFixed(1)} ppm • ${w.scan_count} scans</div>
        </td>
        <td>
          <div class="comp-meter-container">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
              <span style="font-weight:700; color:${barColor};">${pct.toFixed(0)}% Limit</span>
              <span style="font-size:10px; color:var(--text-muted);">Peak: ${w.stel_peak_ppm.toFixed(1)} ppm</span>
            </div>
            <div class="comp-meter-bar-wrapper">
              <div class="comp-meter-fill" style="width:${Math.min(100, pct)}%; background:${barColor};"></div>
              <!-- 50% Amber marker line -->
              <div class="comp-marker-twa" style="left:50%;" title="50% Amber Caution Threshold"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:9.5px; color:var(--text-muted);">
              <span>0</span>
              <span style="color:#facc15;">50%</span>
              <span style="color:#ef4444;">100%</span>
            </div>
          </div>
        </td>
        <td>
          <button class="btn btn-secondary" style="padding:5px 10px; font-size:11px; display:inline-flex; align-items:center; gap:4px; color:var(--accent-primary); border-color:rgba(249,115,22,0.35);" onclick="window.openWorkerDoseModal('${w.worker_id}')">
            📈 Dose Curve
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// 1. Operations KPIs
async function loadKPIs() {
  const kpis = await API.getKPIs();
  document.getElementById("kpi-active-workers").textContent = kpis.active_workers;
  document.getElementById("kpi-scans-today").textContent = kpis.scans_today;
  document.getElementById("kpi-avg-ppm").textContent = kpis.avg_ppm_today;
  document.getElementById("kpi-alerts-total").textContent = kpis.total_alerts_24h;
  document.getElementById("kpi-yellow-cnt").textContent = kpis.yellow_alerts;
  document.getElementById("kpi-orange-cnt").textContent = kpis.orange_alerts;
  document.getElementById("kpi-red-cnt").textContent = kpis.red_alerts + kpis.evac_alerts;
  document.getElementById("kpi-model-version").textContent = kpis.active_model_version;
  document.getElementById("sidebar-active-model").textContent = kpis.active_model_version;
}

// Scans Table
async function loadScans() {
  const scans = await API.listScans(15);
  const tbody = document.getElementById("scans-table-body");
  if (!scans || scans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No recent scans recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = scans.map(s => {
    const timeFormatted = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const statusPill = s.safety_threshold_exceeded
      ? `<span class="alert-pill pill-red">⚠ Exceeded</span>`
      : `<span class="badge-cat badge-green">✓ Safe</span>`;

    return `
      <tr>
        <td style="font-weight:600; color:var(--text-primary);">${s.worker_name} (${s.worker_id})</td>
        <td>${timeFormatted}</td>
        <td><code style="color:var(--accent-mint); font-weight:700;">${s.strip_id}</code></td>
        <td><span class="badge-cat ${s.badge_class}">${s.predicted_class}</span></td>
        <td style="font-weight:700;">${s.predicted_ppm} ppm <span style="font-size:11px; color:var(--text-muted);">(${s.predicted_ppm_range})</span></td>
        <td>${statusPill}</td>
        <td>${Math.round(s.model_confidence * 100)}%</td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="window.reviewScan('${s.scan_id}')">
              ${s.supervisor_reviewed ? "✓ Reviewed" : "Approve"}
            </button>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:var(--accent-primary); border-color:rgba(249,115,22,0.4);" onclick="window.openAuditCertificateModal('${s.scan_id}')" title="Inspect cryptographic SHA-256 hash & certified calibration curve">
              🛡️ Audit
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

window.reviewScan = async function(scanId) {
  try {
    const res = await fetch(`/api/scans/${scanId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve_for_training: true, notes: "Supervisor verified" })
    });
    alert(`Scan ${scanId} approved for continuous dataset training!`);
    loadScans();
  } catch (err) {
    alert("Error approving scan.");
  }
};

// Alerts Table
async function loadAlerts() {
  const alerts = await API.getAlerts();
  const tbody = document.getElementById("alerts-table-body");
  if (!alerts || alerts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No active safety alerts. All readings within nominal limits.</td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(a => {
    const pillClass = a.alert_level.includes("Alarm") ? "pill-alarm" : (a.alert_level === "Red" ? "pill-red" : (a.alert_level === "Orange" ? "pill-orange" : "pill-yellow"));
    return `
      <tr>
        <td><code>${a.alert_id}</code></td>
        <td style="font-weight:600; color:var(--text-primary);">${a.worker_name}</td>
        <td><span class="alert-pill ${pillClass}">${a.alert_level}</span></td>
        <td style="font-weight:700;">${a.ppm_value} ppm</td>
        <td style="max-width:280px;">${a.message}</td>
        <td><span style="color:#f59e0b; font-weight:700;">${a.status}</span></td>
        <td>
          ${a.status === "ACTIVE" ? `
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="window.ackAlert('${a.alert_id}')">
              Acknowledge
            </button>
          ` : `<span style="color:var(--accent-mint); font-size:12px; font-weight:700;">Acknowledged</span>`}
        </td>
      </tr>
    `;
  }).join("");
}

window.ackAlert = async function(alertId) {
  await API.acknowledgeAlert(alertId);
  loadAlerts();
  loadKPIs();
};

// 2. AI Model Center
async function loadAIModelCenter() {
  const activeModel = await API.getActiveModel();
  activeModelCache = activeModel;
  document.getElementById("model-center-active-ver").textContent = activeModel.version;
  document.getElementById("model-center-acc").textContent = `${Math.round(activeModel.test_accuracy * 1000) / 10}%`;
  document.getElementById("model-center-status").textContent = activeModel.approval_status;

  const f1El = document.getElementById("model-center-f1");
  if (f1El && activeModel.metrics && activeModel.metrics.f1_macro) {
    f1El.textContent = `${Math.round(activeModel.metrics.f1_macro * 1000) / 10}%`;
  }

  // Render All Accuracy & Calibration Graphs
  renderLearningCurve(activeModel.training_curve || []);
  renderVersionComparison(activeModel.model_comparison || []);
  renderPerClassAccuracy(activeModel.per_class_metrics || []);
  renderConfusionMatrix(activeModel.confusion_matrix, activeModel.classes);
  renderCalibrationCurve(activeModel.calibration_curve || []);
  renderParityPlot(activeModel.parity_plot || {});

  const models = await API.getModels();
  const tbody = document.getElementById("models-table-body");
  tbody.innerHTML = models.map(m => {
    const isAct = m.is_active;
    const badge = isAct ? `<span class="badge-cat badge-green">Active</span>` : `<span class="badge-cat badge-yellow">${m.approval_status}</span>`;
    let actionBtn = "";
    if (!isAct && m.approval_status.includes("Candidate")) {
      actionBtn = `<button class="btn btn-primary" style="padding:4px 8px; font-size:11px;" onclick="window.approveModel('${m.version}')">Approve</button>`;
    } else if (!isAct) {
      actionBtn = `<button class="btn btn-undo" style="padding:4px 8px; font-size:11px;" onclick="window.quickRollback('${m.version}')">Rollback To This</button>`;
    } else {
      actionBtn = `<span style="color:var(--accent-mint); font-size:12px; font-weight:700;">✓ In Production</span>`;
    }

    const f1Score = (m.metrics && m.metrics.f1_macro) ? `${Math.round(m.metrics.f1_macro * 1000) / 10}%` : `${Math.round(m.test_accuracy * 995) / 10}%`;

    return `
      <tr>
        <td style="font-weight:700; color:var(--accent-mint);">${m.version}</td>
        <td>${m.model_name}</td>
        <td style="font-weight:700; color:var(--accent-mint);">${Math.round(m.test_accuracy * 1000) / 10}%</td>
        <td style="color:var(--accent-mint);">${f1Score}</td>
        <td>${badge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join("");

  // Populate rollback modal options
  const select = document.getElementById("modal-select-model");
  select.innerHTML = models.map(m => `<option value="${m.version}">${m.version} (${m.model_name}) - ${Math.round(m.test_accuracy*100)}% Acc</option>`).join("");
}

// Graph 1: Interactive SVG Training & Validation Accuracy Learning Curve
function renderLearningCurve(curve) {
  const svg = document.getElementById("learning-curve-svg");
  if (!svg || !curve || curve.length === 0) return;

  const w = 500, h = 220;
  const padL = 48, padR = 20, padT = 18, padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const n = curve.length;
  const x = i => padL + (i / (n - 1)) * plotW;
  // Accuracy: 50% to 100%
  const yAcc = a => padT + ((100 - a) / 50) * plotH;
  // Loss: 0.0 to 1.0
  const yLoss = l => padT + (l / 1.0) * plotH;

  // Build grid lines
  let gridLines = "";
  [50, 60, 70, 80, 90, 100].forEach(val => {
    const yPos = yAcc(val);
    gridLines += `
      <line x1="${padL}" y1="${yPos}" x2="${w - padR}" y2="${yPos}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
      <text x="${padL - 6}" y="${yPos + 3}" fill="#64748b" font-size="9" text-anchor="end">${val}%</text>
    `;
  });

  // Epoch markers
  [1, 5, 10, 15, 20, 25].forEach(ep => {
    const idx = ep - 1;
    if (idx < n) {
      const xPos = x(idx);
      gridLines += `
        <line x1="${xPos}" y1="${padT}" x2="${xPos}" y2="${h - padB}" stroke="rgba(255,255,255,0.04)" />
        <text x="${xPos}" y="${h - padB + 13}" fill="#64748b" font-size="9" text-anchor="middle">Ep ${ep}</text>
      `;
    }
  });

  // Polyline coordinates
  const trainPts = curve.map((pt, i) => `${x(i).toFixed(1)},${yAcc(pt.train_accuracy).toFixed(1)}`).join(" ");
  const valPts = curve.map((pt, i) => `${x(i).toFixed(1)},${yAcc(pt.val_accuracy).toFixed(1)}`).join(" ");
  const lossPts = curve.map((pt, i) => `${x(i).toFixed(1)},${yLoss(pt.loss).toFixed(1)}`).join(" ");

  // Gradient area under validation curve
  const areaPts = `${x(0)},${h - padB} ` + valPts + ` ${x(n - 1)},${h - padB}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f97316" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#f97316" stop-opacity="0.0" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    ${gridLines}
    <!-- Axis Baselines -->
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" />
    <!-- Axis Titles -->
    <text x="${padL + plotW / 2}" y="${h - 4}" fill="#cbd5e1" font-size="9.5" font-weight="700" text-anchor="middle" letter-spacing="0.4">Training Epochs (1–25) →</text>
    <text transform="rotate(-90)" x="${-(padT + plotH / 2)}" y="13" fill="#cbd5e1" font-size="9.5" font-weight="700" text-anchor="middle" letter-spacing="0.4">← Accuracy (%) / Loss</text>
    <!-- Area Under Val Acc -->
    <polygon points="${areaPts}" fill="url(#valGrad)" />
    <!-- Loss curve -->
    <polyline points="${lossPts}" fill="none" stroke="#f43f5e" stroke-width="1.8" stroke-dasharray="4,3" opacity="0.85" />
    <!-- Train Acc curve -->
    <polyline points="${trainPts}" fill="none" stroke="#f59e0b" stroke-width="2.2" opacity="0.9" />
    <!-- Val Acc curve -->
    <polyline points="${valPts}" fill="none" stroke="#f97316" stroke-width="2.8" filter="url(#glow)" />
    <!-- Data points -->
    ${curve.map((pt, i) => `
      <circle cx="${x(i).toFixed(1)}" cy="${yAcc(pt.val_accuracy).toFixed(1)}" r="3" fill="#181412" stroke="#f97316" stroke-width="1.5" class="chart-point" data-epoch="${pt.epoch}" data-train="${pt.train_accuracy}" data-val="${pt.val_accuracy}" data-loss="${pt.loss}" style="cursor:pointer;" />
    `).join("")}
  `;

  // Tooltip Interaction
  const tooltip = document.getElementById("chart-tooltip");
  const container = document.getElementById("curve-chart-container");
  if (tooltip && container) {
    const points = svg.querySelectorAll(".chart-point");
    points.forEach(p => {
      p.addEventListener("mouseenter", (e) => {
        const ep = e.target.getAttribute("data-epoch");
        const tr = e.target.getAttribute("data-train");
        const va = e.target.getAttribute("data-val");
        const lo = e.target.getAttribute("data-loss");

        const rect = container.getBoundingClientRect();
        const ptX = (e.clientX - rect.left);
        const ptY = (e.clientY - rect.top);

        tooltip.style.left = `${ptX}px`;
        tooltip.style.top = `${ptY}px`;
        tooltip.innerHTML = `<strong>Epoch ${ep}/25</strong><br><span style="color:#f59e0b;">Train: ${tr}%</span> | <span style="color:#f97316;">Val: ${va}%</span><br><span style="color:#f43f5e;">Loss: ${lo}</span>`;
        tooltip.style.display = "block";
      });
      p.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });
  }
}

// Graph 2: Model Version Accuracy Progression Bar Chart
function renderVersionComparison(models) {
  const container = document.getElementById("version-comparison-bars");
  if (!container || !models || models.length === 0) return;

  const colors = {
    "v0.9": "linear-gradient(90deg, #475569, #64748b)",
    "v1.0": "linear-gradient(90deg, #ea580c, #f97316)",
    "v1.1": "linear-gradient(90deg, #f97316, #fb923c)"
  };

  let html = "";
  models.forEach(m => {
    const fill = colors[m.version] || "linear-gradient(90deg, #f97316, #f43f5e)";
    const isActive = m.is_active;
    const activeBadge = isActive ? `<span class="badge-cat badge-orange" style="font-size:10px; padding:2px 6px; margin-left:6px;">ACTIVE</span>` : "";

    html += `
      <div class="acc-bar-item">
        <div class="acc-bar-label">
          <span>
            <strong style="color:${isActive ? '#fb923c' : '#fff'};">${m.version}</strong>
            <span style="color:var(--text-muted); font-size:12px; margin-left:4px;">(${m.model_name})</span>
            ${activeBadge}
          </span>
          <span style="font-family:'JetBrains Mono'; font-weight:700; color:${isActive ? '#fb923c' : '#f97316'}; font-size:13px;">
            ${m.test_accuracy}%
          </span>
        </div>
        <div class="acc-bar-track">
          <div class="acc-bar-fill" style="width:${m.test_accuracy}%; background:${fill};"></div>
        </div>
      </div>
    `;
  });

  // OSHA Standard Reference Marker (95%)
  html += `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11px; color:var(--text-muted);">
      <span>0%</span>
      <span style="color:#f59e0b; display:flex; align-items:center; gap:4px;">
        ▲ 95.0% OSHA Industrial Benchmark
      </span>
      <span>100%</span>
    </div>
  `;

  container.innerHTML = html;
}

// Graph 3: Class-by-Class Chemical Stage Accuracy Breakdown
function renderPerClassAccuracy(classes) {
  const container = document.getElementById("per-class-accuracy-list");
  if (!container || !classes || classes.length === 0) return;

  let html = "";
  classes.forEach(c => {
    html += `
      <div class="cat-acc-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:12px; height:12px; border-radius:3px; background:${c.color}; display:inline-block; box-shadow:0 0 8px ${c.color}66;"></span>
            <span style="font-weight:700; font-size:13px; color:var(--text-primary);">${c.class_id}: ${c.label}</span>
          </div>
          <span style="font-family:'JetBrains Mono'; font-weight:700; color:var(--accent-mint); font-size:14px;">${c.accuracy}% Acc</span>
        </div>
        <div class="acc-bar-track" style="height:6px; margin-bottom:6px;">
          <div class="acc-bar-fill" style="width:${c.accuracy}%; background:${c.color};"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono';">
          <span>Precision: <b style="color:var(--text-secondary);">${c.precision}%</b></span>
          <span>Recall: <b style="color:var(--text-secondary);">${c.recall}%</b></span>
          <span>F1: <b style="color:var(--accent-mint);">${c.f1_score}%</b></span>
          <span>Tested: <b style="color:var(--text-secondary);">${c.samples} strips</b></span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderConfusionMatrix(matrix, classes) {
  const container = document.getElementById("confusion-matrix-container");
  if (!matrix || matrix.length === 0) {
    container.innerHTML = "<p>No confusion matrix data available.</p>";
    return;
  }

  const shortNames = ["C0", "C1", "C2", "C3", "C4"];
  let html = `<div class="matrix-wrapper"><div class="matrix-grid">`;
  html += `<div class="matrix-header">True/Pred</div>`;
  shortNames.forEach(n => html += `<div class="matrix-header">${n}</div>`);

  for (let i = 0; i < 5; i++) {
    html += `<div class="matrix-header" style="text-align:right; padding-right:8px;">${shortNames[i]}</div>`;
    for (let j = 0; j < 5; j++) {
      const val = matrix[i] ? matrix[i][j] : 0;
      const isDiag = (i === j);
      const bg = isDiag ? `rgba(59, 130, 246, ${Math.min(1.0, val / 300 + 0.3)})` : (val > 0 ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.03)");
      html += `<div class="matrix-cell" style="background:${bg};">${val}</div>`;
    }
  }
  html += `</div></div>`;
  container.innerHTML = html;
}

// Shared Cu-PAN Chemical Optical Spectrum Ladder (Purple-Magenta -> Rose -> Coral -> Orange -> Yellow)
const CUPAN_SPECTRUM_LADDER = [
  { ppm: 0.0, rgb: [149, 73, 120], hex: "#954978", name: "Intact Cu-PAN (Purple-Magenta)" },
  { ppm: 0.8, rgb: [171, 78, 114], hex: "#AB4E72", name: "Magenta-Violet" },
  { ppm: 2.5, rgb: [193, 88, 106], hex: "#C1586A", name: "Rose-Red" },
  { ppm: 6.0, rgb: [209, 102, 98], hex: "#D16662", name: "Coral" },
  { ppm: 12.0, rgb: [223, 122, 91], hex: "#DF7A5B", name: "Salmon-Orange" },
  { ppm: 22.0, rgb: [233, 144, 83], hex: "#E99053", name: "Orange" },
  { ppm: 38.0, rgb: [236, 165, 74], hex: "#ECA54A", name: "Amber-Orange" },
  { ppm: 55.0, rgb: [238, 185, 68], hex: "#EEB944", name: "Amber" },
  { ppm: 72.0, rgb: [239, 201, 62], hex: "#EFC93E", name: "Golden Yellow" },
  { ppm: 90.0, rgb: [243, 211, 59], hex: "#F3D33B", name: "Yellow" },
  { ppm: 110.0, rgb: [247, 218, 52], hex: "#F7DA34", name: "Free PAN Yellow" }
];

function getCupanSpectrumColor(ppm) {
  const p = Math.max(0.0, parseFloat(ppm) || 0.0);
  if (p <= CUPAN_SPECTRUM_LADDER[0].ppm) return CUPAN_SPECTRUM_LADDER[0].hex;
  const last = CUPAN_SPECTRUM_LADDER[CUPAN_SPECTRUM_LADDER.length - 1];
  if (p >= last.ppm) return last.hex;
  for (let i = 0; i < CUPAN_SPECTRUM_LADDER.length - 1; i++) {
    const a1 = CUPAN_SPECTRUM_LADDER[i];
    const a2 = CUPAN_SPECTRUM_LADDER[i + 1];
    if (p >= a1.ppm && p <= a2.ppm) {
      const frac = (p - a1.ppm) / (a2.ppm - a1.ppm);
      const r = Math.round(a1.rgb[0] + frac * (a2.rgb[0] - a1.rgb[0]));
      const g = Math.round(a1.rgb[1] + frac * (a2.rgb[1] - a1.rgb[1]));
      const b = Math.round(a1.rgb[2] + frac * (a2.rgb[2] - a1.rgb[2]));
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
  }
  return last.hex;
}

function getCupanSpectrumRgb(ppm) {
  const p = Math.max(0.0, parseFloat(ppm) || 0.0);
  if (p <= CUPAN_SPECTRUM_LADDER[0].ppm) return CUPAN_SPECTRUM_LADDER[0].rgb;
  const last = CUPAN_SPECTRUM_LADDER[CUPAN_SPECTRUM_LADDER.length - 1];
  if (p >= last.ppm) return last.rgb;
  for (let i = 0; i < CUPAN_SPECTRUM_LADDER.length - 1; i++) {
    const a1 = CUPAN_SPECTRUM_LADDER[i];
    const a2 = CUPAN_SPECTRUM_LADDER[i + 1];
    if (p >= a1.ppm && p <= a2.ppm) {
      const frac = (p - a1.ppm) / (a2.ppm - a1.ppm);
      const r = Math.round(a1.rgb[0] + frac * (a2.rgb[0] - a1.rgb[0]));
      const g = Math.round(a1.rgb[1] + frac * (a2.rgb[1] - a1.rgb[1]));
      const b = Math.round(a1.rgb[2] + frac * (a2.rgb[2] - a1.rgb[2]));
      return [r, g, b];
    }
  }
  return last.rgb;
}

function getSpectrumStageName(ppm) {
  const p = Math.max(0.0, parseFloat(ppm) || 0.0);
  if (p <= 0.4) return "Intact Cu-PAN (Purple)";
  if (p <= 1.5) return "Magenta-Violet";
  if (p <= 4.0) return "Rose-Red";
  if (p <= 8.0) return "Coral";
  if (p <= 16.0) return "Salmon-Orange";
  if (p <= 28.0) return "Orange";
  if (p <= 45.0) return "Amber-Orange";
  if (p <= 60.0) return "Amber";
  return "Yellow";
}

// Graph 4: Colorimetric CIELAB a* Coordinate vs [H2S] Calibration Response
function renderCalibrationCurve(calibData) {
  const svg = document.getElementById("calib-curve-svg");
  if (!svg) return;

  // Calibrated experimental dosimeter reference dataset (18 precision points up to 20 ppm)
  // Each point's color is strictly derived from the Cu-PAN chemical optical spectrum
  const defaultPoints = [
    { ppm: 0.1, a_star: 5.0, stage: "0.1 ppm (Intact Cu-PAN Purple)", is_linear: true },
    { ppm: 0.3, a_star: 6.0, stage: "0.3 ppm (Sub-PPM Trace Purple)", is_linear: true },
    { ppm: 0.6, a_star: 7.0, stage: "0.6 ppm (First Displacement)", is_linear: true },
    { ppm: 0.7, a_star: 8.0, stage: "0.7 ppm (Magenta-Violet)", is_linear: true },
    { ppm: 1.0, a_star: 9.0, stage: "1.0 ppm (OSHA PEL Threshold)", is_linear: true },
    { ppm: 1.2, a_star: 10.0, stage: "1.2 ppm (Violet-Rose)", is_linear: true },
    { ppm: 1.5, a_star: 11.0, stage: "1.5 ppm (Reaction Knee Point)", is_linear: true },
    { ppm: 2.0, a_star: 11.0, stage: "2.0 ppm (Saturation Plateau / Rose)", is_linear: false },
    { ppm: 2.5, a_star: 11.0, stage: "2.5 ppm (Rose-Red S2)", is_linear: false },
    { ppm: 4.0, a_star: 11.0, stage: "4.0 ppm (Plateau / Rose-Coral)", is_linear: false },
    { ppm: 6.0, a_star: 11.0, stage: "6.0 ppm (Plateau / Coral S3)", is_linear: false },
    { ppm: 8.0, a_star: 11.0, stage: "8.0 ppm (Plateau / Coral-Orange)", is_linear: false },
    { ppm: 10.0, a_star: 11.0, stage: "10.0 ppm (OSHA Ceiling / Salmon)", is_linear: false },
    { ppm: 12.0, a_star: 11.0, stage: "12.0 ppm (Salmon-Orange S4)", is_linear: false },
    { ppm: 14.0, a_star: 11.0, stage: "14.0 ppm (Plateau / Salmon-Orange)", is_linear: false },
    { ppm: 16.0, a_star: 11.0, stage: "16.0 ppm (Plateau / Orange Transition)", is_linear: false },
    { ppm: 18.0, a_star: 11.0, stage: "18.0 ppm (Plateau / Orange)", is_linear: false },
    { ppm: 20.0, a_star: 11.0, stage: "20.0 ppm (OSHA Peak / Orange)", is_linear: false }
  ];

  const points = (calibData && Array.isArray(calibData.points) && calibData.points.length > 0)
    ? calibData.points
    : (Array.isArray(calibData) && calibData.length > 0 && calibData[0].a_star !== undefined ? calibData : defaultPoints);

  const w = 520, h = 280;
  const padL = 62, padR = 26, padT = 66, padB = 40;
  const plotW = w - padL - padR; // 432
  const plotH = h - padT - padB; // 174

  const maxPpm = 20.0;
  // Coordinate transformations
  // X: [H2S] (ppm) from 0.0 to 20.0 ppm
  const x = ppm => padL + (Math.max(0.0, Math.min(maxPpm, ppm)) / maxPpm) * plotW;
  // Y: a* coordinate in L*a*b* color space from 4.0 to 14.0
  const y = aStar => padT + ((14.0 - Math.max(4.0, Math.min(14.0, aStar))) / 10.0) * plotH;

  // Build Grid lines and Ticks
  let gridAndTicks = "";

  // Y-axis: 4 to 14 (step of 2 for labels, step of 1 for minor ticks)
  [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].forEach(val => {
    const yPos = y(val);
    const isMajor = (val % 2 === 0);
    if (isMajor) {
      gridAndTicks += `
        <line x1="${padL}" y1="${yPos.toFixed(1)}" x2="${w - padR}" y2="${yPos.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
        <line x1="${(padL - 6).toFixed(1)}" y1="${yPos.toFixed(1)}" x2="${padL}" y2="${yPos.toFixed(1)}" stroke="#94a3b8" stroke-width="1.4" />
        <text x="${(padL - 9).toFixed(1)}" y="${(yPos + 3.5).toFixed(1)}" fill="#cbd5e1" font-size="10.5" font-family="'JetBrains Mono', monospace" text-anchor="end">${val}</text>
      `;
    } else {
      // Minor tick
      gridAndTicks += `
        <line x1="${(padL - 3.5).toFixed(1)}" y1="${yPos.toFixed(1)}" x2="${padL}" y2="${yPos.toFixed(1)}" stroke="#64748b" stroke-width="1.1" />
      `;
    }
  });

  // X-axis: 0 to 20 (step of 2 for labels, step of 1 for minor ticks)
  for (let pVal = 0; pVal <= 20; pVal += 1) {
    const xPos = x(pVal);
    const isMajor = (pVal % 2 === 0);
    if (isMajor) {
      gridAndTicks += `
        <line x1="${xPos.toFixed(1)}" y1="${padT}" x2="${xPos.toFixed(1)}" y2="${h - padB}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
        <line x1="${xPos.toFixed(1)}" y1="${h - padB}" x2="${xPos.toFixed(1)}" y2="${h - padB + 6}" stroke="#94a3b8" stroke-width="1.4" />
        <text x="${xPos.toFixed(1)}" y="${h - padB + 18}" fill="#cbd5e1" font-size="10" font-family="'JetBrains Mono', monospace" text-anchor="middle">${pVal}</text>
      `;
    } else {
      // Minor tick
      gridAndTicks += `
        <line x1="${xPos.toFixed(1)}" y1="${h - padB}" x2="${xPos.toFixed(1)}" y2="${h - padB + 3.5}" stroke="#64748b" stroke-width="1.1" />
      `;
    }
  }

  // Linear Fit dashed line: a* = 4.65 + 4.34 · [H2S] (up to knee at ~1.46 ppm, a* = 11.0)
  const lineX1 = x(0.0).toFixed(1);
  const lineY1 = y(4.65).toFixed(1);
  const lineX2 = x(1.46).toFixed(1);
  const lineY2 = y(11.0).toFixed(1);

  // Saturation Plateau Line: a* = 11.0 from 1.46 ppm across to 20.0 ppm
  const platX1 = x(1.46).toFixed(1);
  const platX2 = x(20.0).toFixed(1);
  const platY = y(11.0).toFixed(1);

  // Colors for 0.0 ppm and 20.0 ppm in Cu-PAN spectrum
  const colorZero = getCupanSpectrumColor(0.0);   // #954978 (Deep Purple)
  const colorMax = getCupanSpectrumColor(20.0);   // #e78c55 (Orange)

  // Render SVG Content
  svg.innerHTML = `
    <defs>
      <!-- Top Arrowhead Marker -->
      <marker id="calib-top-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#cbd5e1" />
      </marker>
      <!-- Subtle point glow -->
      <filter id="pointGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.6" />
      </filter>
    </defs>

    <!-- Top Visual Swatch Banner: Color-accurate Cu-PAN spectrum transition (0.0 ppm Purple -> 20.0 ppm Orange) -->
    <g class="calib-top-swatches">
      <!-- 0.0 ppm unexposed spectrum card -->
      <g transform="translate(${padL + 4}, 8)">
        <rect width="40" height="40" rx="6" fill="${colorZero}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <image href="assets/dosimeter_unexposed.png" x="2" y="2" width="36" height="36" preserveAspectRatio="none" opacity="0.3" style="border-radius:4px; mix-blend-mode:luminosity;" />
        <text x="20" y="49" fill="#c084fc" font-size="8.5" font-family="'JetBrains Mono', monospace" font-weight="700" text-anchor="middle">0.0 ppm</text>
      </g>

      <!-- Center Transition Arrow -->
      <g>
        <line x1="${padL + 58}" y1="28" x2="${w - padR - 58}" y2="28" stroke="#cbd5e1" stroke-width="2.2" marker-end="url(#calib-top-arrow)" />
        <text x="${(padL + w - padR) / 2}" y="21" fill="#94a3b8" font-size="9" font-weight="600" text-anchor="middle" letter-spacing="0.5">Cu-PAN Chemical Reaction Spectrum (Purple ➔ Rose ➔ Orange) →</text>
      </g>

      <!-- 20.0 ppm exposed spectrum card -->
      <g transform="translate(${w - padR - 44}, 8)">
        <rect width="40" height="40" rx="6" fill="${colorMax}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <image href="assets/dosimeter_exposed.png" x="2" y="2" width="36" height="36" preserveAspectRatio="none" opacity="0.3" style="border-radius:4px; mix-blend-mode:luminosity;" />
        <text x="20" y="49" fill="#fb923c" font-size="8.5" font-family="'JetBrains Mono', monospace" font-weight="700" text-anchor="middle">20.0 ppm</text>
      </g>
    </g>

    <!-- Grid lines and ticks -->
    ${gridAndTicks}

    <!-- Axis Baselines -->
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#cbd5e1" stroke-width="1.5" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#cbd5e1" stroke-width="1.5" />

    <!-- Axis Titles -->
    <text transform="rotate(-90)" x="${-(padT + plotH / 2)}" y="18" fill="#f8fafc" font-size="11" font-weight="600" text-anchor="middle" letter-spacing="0.3">
      <tspan font-style="italic">a</tspan><tspan dy="-3" font-size="8.5">*</tspan><tspan dy="3"> coordinate in </tspan><tspan font-style="italic">L</tspan><tspan dy="-3" font-size="8.5">*</tspan><tspan dy="3" font-style="italic">a</tspan><tspan dy="-3" font-size="8.5">*</tspan><tspan dy="3" font-style="italic">b</tspan><tspan dy="-3" font-size="8.5">*</tspan><tspan dy="3"> color space</tspan>
    </text>

    <text x="${padL + plotW / 2}" y="${h - 6}" fill="#f8fafc" font-size="11" font-weight="600" text-anchor="middle" letter-spacing="0.3">
      [H<tspan dy="2" font-size="8.5">2</tspan><tspan dy="-2">S] (ppm)</tspan>
    </text>

    <!-- Linear Regression Fit Line (Dashed White) -->
    <line x1="${lineX1}" y1="${lineY1}" x2="${lineX2}" y2="${lineY2}" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="6,4" stroke-linecap="round" />

    <!-- Saturation Plateau Line (Dashed Pink) -->
    <line x1="${platX1}" y1="${platY}" x2="${platX2}" y2="${platY}" stroke="#f472b6" stroke-width="2.2" stroke-dasharray="5,4" stroke-linecap="round" opacity="0.9" />

    <!-- Annotation Box: Equation and R^2 -->
    <g transform="translate(${x(10.2).toFixed(1)}, ${(y(7.2)).toFixed(1)})">
      <rect width="150" height="48" rx="6" fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.12)" />
      <text x="12" y="21" font-size="11" font-family="'JetBrains Mono', monospace" fill="#f8fafc" font-weight="600">
        <tspan font-style="italic">a</tspan><tspan dy="-3" font-size="8.5">*</tspan><tspan dy="3">=4.65+4.34·[H</tspan><tspan dy="2" font-size="8.5">2</tspan><tspan dy="-2">S]</tspan>
      </text>
      <text x="12" y="38" font-size="10.5" font-family="'JetBrains Mono', monospace" fill="var(--accent-primary, #f97316)" font-weight="700">R²=0.99070 (0–1.5 ppm)</text>
    </g>

    <!-- Calibration Data Points (18 precision points up to 20 ppm) accurately colored from Cu-PAN chemical spectrum -->
    ${points.map(pt => {
      const cx = x(pt.ppm).toFixed(1);
      const cy = y(pt.a_star).toFixed(1);
      // Strictly enforce color accuracy from the Cu-PAN optical spectrum
      const spectrumHex = getCupanSpectrumColor(pt.ppm);
      const spectrumRgb = getCupanSpectrumRgb(pt.ppm);
      const rgbStr = spectrumRgb.join(", ");
      const stage = pt.stage || getSpectrumStageName(pt.ppm);
      return `
        <g class="calib-point" data-ppm="${pt.ppm}" data-astar="${pt.a_star}" data-hex="${spectrumHex}" data-rgb="${rgbStr}" data-stage="${stage}" data-linear="${pt.is_linear !== false}" style="cursor:pointer;" filter="url(#pointGlow)">
          <circle cx="${cx}" cy="${cy}" r="6.2" fill="${spectrumHex}" stroke="#0f172a" stroke-width="1.8" />
          <circle cx="${cx}" cy="${cy}" r="7.4" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.9" />
        </g>
      `;
    }).join("")}
  `;

  // Tooltip Interaction
  const tooltip = document.getElementById("calib-tooltip");
  const container = document.getElementById("calib-chart-container");
  if (tooltip && container) {
    const pointEls = svg.querySelectorAll(".calib-point");
    pointEls.forEach(p => {
      p.addEventListener("mouseenter", (e) => {
        const ppm = parseFloat(p.getAttribute("data-ppm")).toFixed(1);
        const aStar = parseFloat(p.getAttribute("data-astar")).toFixed(1);
        const hex = p.getAttribute("data-hex");
        const rgb = p.getAttribute("data-rgb");
        const stage = p.getAttribute("data-stage");
        const isLinear = (p.getAttribute("data-linear") === "true");

        const rect = container.getBoundingClientRect();
        const ptX = e.clientX - rect.left;
        const ptY = e.clientY - rect.top;

        tooltip.style.left = `${ptX}px`;
        tooltip.style.top = `${ptY}px`;
        tooltip.innerHTML = `
          <div style="font-size:11px; font-weight:700; color:var(--text-primary); margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span>[H₂S] = ${ppm} ppm</span>
            <span style="font-size:9.5px; padding:1px 5px; border-radius:3px; font-weight:600; ${isLinear ? 'background:rgba(249,115,22,0.18); color:var(--accent-mint);' : 'background:rgba(244,114,182,0.2); color:#f472b6;'}">${isLinear ? 'Linear Dynamic Range' : 'Saturation Plateau'}</span>
          </div>
          <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">
            <em>a*</em> coordinate: <strong style="color:var(--text-primary); font-family:'JetBrains Mono';">${aStar}</strong>
            ${isLinear ? `<span style="color:var(--text-muted); font-size:10px;"> (Fit: ${(4.65 + 4.34 * ppm).toFixed(2)})</span>` : `<span style="color:#f472b6; font-size:10px;"> (Ceiling)</span>`}
          </div>
          <div style="margin-top:6px; display:flex; align-items:center; gap:8px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.08);">
            <span style="width:16px; height:16px; border-radius:4px; background:${hex}; border:1px solid #ffffff; display:inline-block; box-shadow:0 0 4px rgba(0,0,0,0.5);"></span>
            <div>
              <div style="font-family:'JetBrains Mono'; font-size:10.5px; font-weight:700; color:${hex};">${hex.toUpperCase()}</div>
              <div style="font-size:9.5px; color:var(--text-muted);">Spectrum rgb(${rgb})</div>
            </div>
          </div>
          ${stage ? `<div style="font-size:9.5px; color:var(--text-secondary); margin-top:4px; font-weight:500;">${stage}</div>` : ''}
        `;
        tooltip.style.display = "block";
      });
      p.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });
  }
}

// Graph 5: Parity Plot: True PPM vs Estimated PPM
function renderParityPlot(parityData) {
  const svg = document.getElementById("parity-scatter-svg");
  if (!svg || !parityData) return;

  const points = parityData.points || [];
  const stats = parityData.stats || {};

  // Update summary stats pills
  if (stats.r_squared !== undefined) {
    const r2El = document.getElementById("parity-stat-r2");
    if (r2El) r2El.textContent = stats.r_squared.toFixed(4);
  }
  if (stats.mae !== undefined) {
    const maeEl = document.getElementById("parity-stat-mae");
    if (maeEl) maeEl.textContent = `${stats.mae.toFixed(2)} ppm`;
  }
  if (stats.rmse !== undefined) {
    const rmseEl = document.getElementById("parity-stat-rmse");
    if (rmseEl) rmseEl.textContent = `${stats.rmse.toFixed(2)} ppm`;
  }
  if (stats.max_error !== undefined) {
    const maxEl = document.getElementById("parity-stat-maxerr");
    if (maxEl) maxEl.textContent = `${stats.max_error.toFixed(2)} ppm`;
  }

  const w = 500, h = 240;
  const padL = 54, padR = 18, padT = 18, padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Maximum PPM on axis: strictly 0 to 60 PPM
  const maxVal = 60;
  const x = val => padL + (val / maxVal) * plotW;
  const y = val => padT + ((maxVal - val) / maxVal) * plotH;

  // Build grid lines for 0 to 60 PPM (step of 10 PPM)
  let gridLines = "";
  [0, 10, 20, 30, 40, 50, 60].forEach(val => {
    const yPos = y(val);
    const xPos = x(val);
    // Horizontal
    gridLines += `
      <line x1="${padL}" y1="${yPos}" x2="${w - padR}" y2="${yPos}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
      <text x="${padL - 7}" y="${yPos + 3}" fill="#64748b" font-size="9" text-anchor="end">${val}</text>
    `;
    // Vertical
    gridLines += `
      <line x1="${xPos}" y1="${padT}" x2="${xPos}" y2="${h - padB}" stroke="rgba(255,255,255,0.04)" />
      <text x="${xPos}" y="${h - padB + 13}" fill="#64748b" font-size="9" text-anchor="middle">${val}</text>
    `;
  });

  // Ideal 1:1 Parity Line: (0, 0) to (60, 60)
  const x0 = x(0), y0 = y(0);
  const x60 = x(60), y60 = y(60);
  const parityLine = `<line x1="${x0}" y1="${y0}" x2="${x60}" y2="${y60}" stroke="#64748b" stroke-width="1.8" stroke-dasharray="4,4" />`;

  // +/- 10% Tolerance Cone polygon across 0 to 60 PPM
  const topPts = [0, 10, 20, 30, 40, 50, 60].map(p => {
    const up = Math.min(60, p * 1.1 + 0.6);
    return `${x(p).toFixed(1)},${y(up).toFixed(1)}`;
  });
  const botPts = [60, 50, 40, 30, 20, 10, 0].map(p => {
    const low = Math.max(0, p * 0.9 - 0.6);
    return `${x(p).toFixed(1)},${y(low).toFixed(1)}`;
  });
  const conePolyPts = topPts.join(" ") + " " + botPts.join(" ");

  // Only plot points within 0 to 60 PPM
  const filteredPoints = points.filter(pt => pt.true_ppm <= 60.0);

  // Scatter dots colored according to Cu-PAN chemical optical spectrum
  const scatterDots = filteredPoints.map(pt => {
    const cx = x(pt.true_ppm).toFixed(1);
    const cy = y(Math.min(60, pt.estimated_ppm)).toFixed(1);
    const color = pt.spectrum_color || getCupanSpectrumColor(pt.true_ppm);
    return `
      <circle cx="${cx}" cy="${cy}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1.2" class="parity-point" data-cat="${pt.category}" data-true="${pt.true_ppm}" data-est="${pt.estimated_ppm}" data-err="${pt.error}" data-color="${color}" style="cursor:pointer; transition:r 0.15s ease;" />
    `;
  }).join("");

  svg.innerHTML = `
    ${gridLines}
    <!-- Axis Baselines -->
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" />

    <!-- Axis Titles / Names -->
    <text x="${padL + plotW / 2}" y="${h - 4}" fill="#cbd5e1" font-size="9.5" font-weight="700" text-anchor="middle" letter-spacing="0.4">True H₂S Concentration (PPM) →</text>
    <text transform="rotate(-90)" x="${-(padT + plotH / 2)}" y="14" fill="#cbd5e1" font-size="9.5" font-weight="700" text-anchor="middle" letter-spacing="0.4">← Estimated PPM (AI Model)</text>

    <!-- Tolerance Cone -->
    <polygon points="${conePolyPts}" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.25)" stroke-dasharray="2,2" />
    <!-- 1:1 Parity Line -->
    ${parityLine}
    <!-- Scatter Points -->
    ${scatterDots}
  `;

  // Tooltip interaction
  const tooltip = document.getElementById("parity-tooltip");
  const container = document.getElementById("parity-chart-container");
  if (tooltip && container) {
    const dots = svg.querySelectorAll(".parity-point");
    dots.forEach(d => {
      d.addEventListener("mouseenter", (e) => {
        const cat = e.target.getAttribute("data-cat");
        const truePpm = parseFloat(e.target.getAttribute("data-true")).toFixed(1);
        const estPpm = parseFloat(e.target.getAttribute("data-est")).toFixed(1);
        const err = parseFloat(e.target.getAttribute("data-err"));
        const absErr = Math.abs(err).toFixed(2);
        const sign = err >= 0 ? "+" : "";
        const pointColor = e.target.getAttribute("data-color") || getCupanSpectrumColor(parseFloat(truePpm));
        const stageName = getSpectrumStageName(parseFloat(truePpm));

        e.target.setAttribute("r", "6.5");
        e.target.setAttribute("stroke-width", "2");

        const rect = container.getBoundingClientRect();
        const ptX = e.clientX - rect.left;
        const ptY = e.clientY - rect.top;

        tooltip.style.left = `${ptX}px`;
        tooltip.style.top = `${ptY}px`;
        tooltip.innerHTML = `
          <div style="display:flex; align-items:center; gap:7px; margin-bottom:4px;">
            <span style="width:12px; height:12px; border-radius:3px; background:${pointColor}; border:1px solid #fff; display:inline-block; box-shadow:0 0 8px ${pointColor}99;"></span>
            <strong style="color:var(--text-primary); font-size:12px;">${stageName}</strong>
            <span style="color:var(--text-muted); font-size:10px;">(${cat})</span>
          </div>
          <div style="font-family:'JetBrains Mono'; font-size:10px; color:var(--text-secondary); margin-bottom:4px;">Spectrum Color: <span style="color:${pointColor}; font-weight:700;">${pointColor.toUpperCase()}</span></div>
          <span>True H₂S: <strong>${truePpm} ppm</strong></span><br>
          <span>Predicted: <strong style="color:var(--accent-mint);">${estPpm} ppm</strong></span><br>
          <span>Error: <strong style="color:${absErr > 2.0 ? 'var(--accent-coral)' : 'var(--accent-mint)'};">${sign}${err.toFixed(2)} ppm</strong></span>
        `;
        tooltip.style.display = "block";
      });
      d.addEventListener("mouseleave", (e) => {
        e.target.setAttribute("r", "4.5");
        e.target.setAttribute("stroke-width", "1.2");
        tooltip.style.display = "none";
      });
    });
  }
}

window.quickRollback = async function(version) {
  if (confirm(`Are you sure you want to rollback active AI model to ${version}?`)) {
    await API.rollbackModel(version);
    alert(`Active AI Model rolled back to ${version}!`);
    loadDashboard();
  }
};

window.approveModel = async function(version) {
  if (confirm(`Approve model ${version} for live industrial deployment?`)) {
    await API.approveModel(version);
    alert(`Model ${version} promoted to Active Production!`);
    loadDashboard();
  }
};

// Rollback Modal Events
document.getElementById("btn-show-rollback-modal").addEventListener("click", () => {
  document.getElementById("rollback-modal").style.display = "flex";
});

document.getElementById("btn-cancel-rollback").addEventListener("click", () => {
  document.getElementById("rollback-modal").style.display = "none";
});

document.getElementById("btn-confirm-rollback").addEventListener("click", async () => {
  const version = document.getElementById("modal-select-model").value;
  await API.rollbackModel(version);
  document.getElementById("rollback-modal").style.display = "none";
  alert(`Active AI Model rolled back to ${version}!`);
  loadDashboard();
});

// 3. Safety Center & Threshold Version Undo
async function loadSafetyCenter() {
  const current = await API.getCurrentThresholds();
  document.getElementById("active-config-tag").textContent = `Active: ${current.version_tag}`;
  document.getElementById("input-yellow").value = current.yellow_ppm;
  document.getElementById("val-yellow").textContent = `${current.yellow_ppm} ppm`;
  document.getElementById("input-orange").value = current.orange_ppm;
  document.getElementById("val-orange").textContent = `${current.orange_ppm} ppm`;
  document.getElementById("input-red").value = current.red_ppm;
  document.getElementById("val-red").textContent = `${current.red_ppm} ppm`;
  document.getElementById("input-evac").value = current.evac_ppm;
  document.getElementById("val-evac").textContent = `${current.evac_ppm} ppm`;

  // Threshold history
  const history = await API.getThresholdHistory();
  const tbody = document.getElementById("config-history-body");
  tbody.innerHTML = history.map(h => {
    const isAct = h.is_active;
    const badge = isAct ? `<span class="badge-cat badge-green">ACTIVE</span>` : `<span class="badge-cat badge-yellow">Historical</span>`;
    const revertBtn = isAct
      ? `<span style="color:var(--accent-mint); font-size:12px; font-weight:700;">Current</span>`
      : `<button class="btn btn-undo" style="padding:4px 10px; font-size:12px;" onclick="window.revertThreshold(${h.id}, '${h.version_tag}')">↺ Revert to this</button>`;

    return `
      <tr>
        <td><code style="color:#60a5fa;">${h.version_tag}</code></td>
        <td>${h.yellow_ppm} ppm</td>
        <td>${h.orange_ppm} ppm</td>
        <td>${h.red_ppm} ppm</td>
        <td style="color:#f87171; font-weight:700;">${h.evac_ppm} ppm</td>
        <td>${h.updated_by}</td>
        <td>${h.reason}</td>
        <td>${badge}</td>
        <td>${revertBtn}</td>
      </tr>
    `;
  }).join("");
}

// Live range slider values
["yellow", "orange", "red", "evac"].forEach(key => {
  const input = document.getElementById(`input-${key}`);
  const val = document.getElementById(`val-${key}`);
  input.addEventListener("input", () => {
    val.textContent = `${input.value} ppm`;
  });
});

document.getElementById("threshold-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const yellow = parseFloat(document.getElementById("input-yellow").value);
  const orange = parseFloat(document.getElementById("input-orange").value);
  const red = parseFloat(document.getElementById("input-red").value);
  const evac = parseFloat(document.getElementById("input-evac").value);

  if (!(yellow < orange && orange < red && red < evac)) {
    alert("Validation error: Yellow < Orange < Red < Evac must be satisfied!");
    return;
  }

  const reason = prompt("Enter a reason for this threshold change:", "Operational adjustment");
  if (!reason) return;

  try {
    const res = await API.updateThresholds({
      yellow_ppm: yellow,
      orange_ppm: orange,
      red_ppm: red,
      evac_ppm: evac
    }, reason);
    alert(`Thresholds updated! New version snapshot created: ${res.version_tag}`);
    loadSafetyCenter();
    loadScans();
  } catch (err) {
    alert("Error updating thresholds: " + (err.detail || "Unknown error"));
  }
});

window.revertThreshold = async function(configId, versionTag) {
  if (confirm(`UNDO / REVERT safety threshold parameters to ${versionTag}?`)) {
    try {
      await API.rollbackThresholds(configId);
      alert(`Safety thresholds successfully reverted to ${versionTag}!`);
      loadSafetyCenter();
    } catch (err) {
      alert("Error rolling back safety configuration.");
    }
  }
};

// 4. Workers Explorer
async function loadWorkers() {
  const workers = await API.getWorkers();
  const container = document.getElementById("worker-list-cards");
  container.innerHTML = workers.map(w => {
    const initials = (w.name || "W").split(" ").map(p => p[0]).slice(0, 2).join("");
    return `
      <div class="glass-card" style="padding:14px 16px; cursor:pointer; border:1px solid var(--border-subtle); transition:all 0.2s ease;" onclick="window.selectWorker('${w.id}')">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, rgba(56,189,248,0.2), rgba(59,130,246,0.2)); border:1px solid rgba(56,189,248,0.4); display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--accent-sky); font-size:12.5px; font-family:'Plus Jakarta Sans'; flex-shrink:0;">${initials}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; color:var(--text-primary); font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${w.name}</div>
            <div style="font-size:11.5px; color:var(--text-muted); font-family:'JetBrains Mono';">${w.id} • ${w.department}</div>
          </div>
        </div>
        <div style="margin-top:10px; display:flex; justify-content:space-between; font-size:11.5px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
          <span>Scans: <b style="color:var(--text-primary);">${w.total_scans}</b></span>
          <span>Alerts: <b style="color:${w.total_alerts > 0 ? '#ef4444' : 'var(--accent-mint)'};">${w.total_alerts}</b></span>
        </div>
      </div>
    `;
  }).join("");

  // Populate scan simulator & issue strip worker dropdown
  const workerSelect = document.getElementById("scan-worker-select");
  workerSelect.innerHTML = workers.map(w => `<option value="${w.id}">${w.name} (${w.id})</option>`).join("");

  const issueWorkerSelect = document.getElementById("issue-worker-select");
  if (issueWorkerSelect) {
    issueWorkerSelect.innerHTML = workers.map(w => `<option value="${w.id}">${w.name} (${w.id} - ${w.department})</option>`).join("");
  }

  if (workers.length > 0) {
    window.selectWorker(workers[0].id);
  }
}

window.selectWorker = async function(workerId) {
  const data = await API.getWorkerTimeline(workerId);
  document.getElementById("wt-worker-name").textContent = `${data.worker.name} (${data.worker.id})`;
  document.getElementById("wt-worker-meta").textContent = `Badge: ${data.worker.badge_number} | Dept: ${data.worker.department} | Site: ${data.worker.site}`;

  const itemsContainer = document.getElementById("worker-timeline-items");
  if (!data.exposure_points || data.exposure_points.length === 0) {
    itemsContainer.innerHTML = "<p style='color:var(--text-muted);'>No exposure scans logged for this worker.</p>";
    return;
  }

  itemsContainer.innerHTML = data.exposure_points.map(pt => {
    const timeStr = new Date(pt.timestamp).toLocaleString();
    return `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div style="font-size:12px; color:var(--text-muted);">${timeStr} • ${pt.scan_id}</div>
        <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
          <span style="font-size:16px; font-weight:800; color:var(--text-primary);">${pt.predicted_ppm} ppm</span>
          <span class="badge-cat badge-yellow">${pt.predicted_class}</span>
          ${pt.alert_triggered ? '<span class="alert-pill pill-red">Alert Triggered</span>' : ''}
        </div>
      </div>
    `;
  }).join("");
};

// 5. Audit Logs & Git History
async function loadAuditAndGit() {
  const commits = await API.getGitHistory(8);
  const gitList = document.getElementById("git-commits-list");
  gitList.innerHTML = commits.map(c => `
    <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; border-left:3px solid #3b82f6;">
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);">
        <code style="color:#60a5fa;">commit ${c.hash}</code>
        <span>${c.date ? new Date(c.date).toLocaleDateString() : ''}</span>
      </div>
      <div style="font-size:13px; font-weight:600; margin-top:4px; color:var(--text-primary);">${c.message}</div>
      ${c.ref_names ? `<div style="font-size:11px; color:var(--accent-mint); margin-top:2px;">${c.ref_names}</div>` : ''}
    </div>
  `).join("");

  const logs = await API.getAuditLogs(20);
  const auditList = document.getElementById("system-audit-list");
  auditList.innerHTML = logs.map(l => `
    <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:8px; border-bottom:1px solid var(--border-color);">
      <div style="display:flex; justify-content:space-between; font-size:12px;">
        <span class="badge-cat badge-yellow" style="font-size:10px;">${l.entity_type}</span>
        <span style="color:var(--text-muted);">${new Date(l.timestamp).toLocaleTimeString()}</span>
      </div>
      <div style="font-weight:700; font-size:13px; margin-top:4px; color:var(--text-primary);">${l.action}</div>
      <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${l.details}</div>
    </div>
  `).join("");
}

// Quick Scan Simulator Modal
const scanModal = document.getElementById("scan-modal");
const ppmSlider = document.getElementById("scan-ppm-slider");
const ppmVal = document.getElementById("scan-ppm-val");

ppmSlider.addEventListener("input", () => {
  ppmVal.textContent = `${ppmSlider.value} ppm`;
});

document.getElementById("btn-quick-scan").addEventListener("click", () => {
  scanModal.style.display = "flex";
});

document.getElementById("btn-cancel-scan").addEventListener("click", () => {
  scanModal.style.display = "none";
});

document.getElementById("btn-execute-scan").addEventListener("click", async () => {
  const workerId = document.getElementById("scan-worker-select").value;
  const stripId = document.getElementById("scan-strip-input").value;
  const ppm = parseFloat(ppmSlider.value);

  try {
    const res = await API.submitScan({
      worker_id: workerId,
      strip_id: stripId,
      simulated_ppm: ppm
    });
    scanModal.style.display = "none";
    alert(`Scan logged successfully!\nCategory: ${res.predicted_class}\nPPM: ${res.predicted_ppm} ppm\nStatus: ${res.alert_level}`);
    loadDashboard();
  } catch (err) {
    const errorMsg = err.detail ? (typeof err.detail === "object" ? err.detail.message : err.detail) : "Scan failed";
    alert("Scan submission error: " + errorMsg);
  }
});

document.getElementById("btn-refresh").addEventListener("click", () => {
  loadDashboard();
});

// Issue Strip Modal
const issueStripModal = document.getElementById("issue-strip-modal");
const btnIssueStrip = document.getElementById("btn-issue-strip");
const btnCancelIssueStrip = document.getElementById("btn-cancel-issue-strip");
const btnSubmitIssueStrip = document.getElementById("btn-submit-issue-strip");
const btnGenStripId = document.getElementById("btn-gen-strip-id");
const issueStripIdInput = document.getElementById("issue-strip-id");

function generateRandomStripId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `STR_${num}`;
}

if (btnIssueStrip) {
  btnIssueStrip.addEventListener("click", () => {
    issueStripIdInput.value = generateRandomStripId();
    issueStripModal.style.display = "flex";
  });
}

if (btnGenStripId) {
  btnGenStripId.addEventListener("click", () => {
    issueStripIdInput.value = generateRandomStripId();
  });
}

if (btnCancelIssueStrip) {
  btnCancelIssueStrip.addEventListener("click", () => {
    issueStripModal.style.display = "none";
  });
}

if (btnSubmitIssueStrip) {
  btnSubmitIssueStrip.addEventListener("click", async () => {
    const stripId = issueStripIdInput.value.trim();
    const batchId = document.getElementById("issue-batch-id").value.trim();
    const workerId = document.getElementById("issue-worker-select").value;
    const daysValid = parseInt(document.getElementById("issue-days-valid").value, 10) || 90;

    if (!stripId) {
      alert("Please enter or generate a Strip ID.");
      return;
    }

    try {
      await API.createStrip(stripId, batchId, workerId, daysValid);
      issueStripModal.style.display = "none";
      alert(`Strip ${stripId} registered and assigned to ${workerId} successfully! Status: ACTIVE.`);
      loadDashboard();
    } catch (err) {
      alert("Error issuing strip: " + (err.detail || JSON.stringify(err)));
    }
  });
}

// ============================================================================
// Shift Monitor Interactive Controls: Standard Selector & Worker Search
// ============================================================================
const stdButtons = [
  { id: "btn-std-factories", code: "FACTORIES_ACT" },
  { id: "btn-std-acgih", code: "ACGIH" },
  { id: "btn-std-dual", code: "DUAL" }
];

stdButtons.forEach(btnInfo => {
  const el = document.getElementById(btnInfo.id);
  if (el) {
    el.addEventListener("click", () => {
      stdButtons.forEach(b => {
        const bEl = document.getElementById(b.id);
        if (bEl) bEl.classList.remove("active");
      });
      el.classList.add("active");
      currentStandard = btnInfo.code;
      loadShiftMonitor();
    });
  }
});

// Search Worker in Shift Monitor
const shiftSearchInput = document.getElementById("shift-worker-search");
if (shiftSearchInput) {
  shiftSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderShiftWorkersTable(shiftWorkersCache, currentStandard);
      return;
    }
    const filtered = shiftWorkersCache.filter(w =>
      w.name.toLowerCase().includes(query) ||
      w.worker_id.toLowerCase().includes(query) ||
      w.badge_number.toLowerCase().includes(query) ||
      w.department.toLowerCase().includes(query) ||
      w.method.name.toLowerCase().includes(query)
    );
    renderShiftWorkersTable(filtered, currentStandard);
  });
}

// Refresh Shift Button
const btnRefreshShift = document.getElementById("btn-refresh-shift");
if (btnRefreshShift) {
  btnRefreshShift.addEventListener("click", () => {
    loadShiftMonitor();
  });
}

// ============================================================================
// Worker Shift Dose Curve Modal & Dynamic SVG Trajectory Engine
// ============================================================================
window.openWorkerDoseModal = async function(workerId) {
  try {
    const stdQuery = currentStandard === "DUAL" ? "FACTORIES_ACT" : currentStandard;
    const data = await API.getWorkerDoseCurve(workerId, stdQuery);
    if (!data || !data.worker) return;

    const modal = document.getElementById("dose-curve-modal");
    modal.style.display = "flex";

    // Header & Meta
    document.getElementById("dc-modal-worker-name").textContent = `${data.worker.name} (${data.worker.id})`;
    document.getElementById("dc-modal-worker-meta").textContent = `Badge: ${data.worker.badge_number} • Dept: ${data.worker.department} • Method: ${data.method.name}`;

    // Tier badge
    const tierBadge = document.getElementById("dc-modal-tier-badge");
    const tier = data.tier;
    tierBadge.className = `tier-badge ${tier.tier_code === 'RED' ? 'tier-red' : (tier.tier_code === 'AMBER' ? 'tier-amber' : 'tier-emerald')}`;
    tierBadge.textContent = tier.tier_badge;

    // Quick Stats
    const cur = data.current_dose;
    document.getElementById("dc-stat-dose").textContent = `${cur.cumulative_dose_ppm_h.toFixed(2)} ppm·h`;
    document.getElementById("dc-stat-twa").textContent = `${cur.twa_current_ppm.toFixed(2)} ppm`;
    document.getElementById("dc-stat-stel").textContent = `${cur.stel_peak_ppm.toFixed(2)} ppm`;
    const actEl = document.getElementById("dc-stat-action");
    actEl.textContent = tier.status_text;
    actEl.style.color = tier.color_hex;

    // Method Callout Box
    const m = data.method;
    document.getElementById("dc-method-title").textContent = `🔬 Method: ${m.name} (${m.type})`;
    document.getElementById("dc-method-formula").textContent = `Curve: ${m.formula}`;
    document.getElementById("dc-method-desc").textContent = `${m.curve_type}. Sampling: ${m.sampling_rate}. Calibrated: ${m.calibration_version}. Shared regulatory limits apply uniformly across all detection methods.`;

    // Render SVG Dose Trajectory Chart
    renderDoseTrajectoryChart(data);
  } catch (err) {
    console.error("Error loading worker dose curve:", err);
    alert("Could not load worker dose curve.");
  }
};

const btnCloseDoseModal = document.getElementById("btn-close-dose-modal");
if (btnCloseDoseModal) {
  btnCloseDoseModal.addEventListener("click", () => {
    document.getElementById("dose-curve-modal").style.display = "none";
  });
}

// Close modal when clicking on backdrop
const doseModal = document.getElementById("dose-curve-modal");
if (doseModal) {
  doseModal.addEventListener("click", (e) => {
    if (e.target === doseModal) {
      doseModal.style.display = "none";
    }
  });
}

function renderDoseTrajectoryChart(data) {
  const svg = document.getElementById("dc-curve-svg");
  if (!svg || !data) return;

  const trajectory = data.trajectory || [];
  const markers = data.scan_markers || [];
  const thresholdLines = data.threshold_lines || {};

  const w = 540, h = 220;
  const padL = 46, padR = 18, padT = 20, padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Compute maximum Y for scale (Dose in ppm·h)
  const validDoses = trajectory.filter(p => p.cumulative_dose !== null).map(p => p.cumulative_dose);
  const maxObserved = validDoses.length > 0 ? Math.max(...validDoses) : 5.0;
  const maxY = Math.max(16.0, Math.ceil(maxObserved * 1.3));

  const x = hour => padL + (hour / 8.0) * plotW;
  const y = dose => padT + ((maxY - dose) / maxY) * plotH;

  // Grid Lines across 8 hours
  let gridLines = "";
  for (let hr = 0; hr <= 8; hr += 2) {
    const xPos = x(hr);
    gridLines += `
      <line x1="${xPos}" y1="${padT}" x2="${xPos}" y2="${h - padB}" stroke="rgba(255,255,255,0.05)" />
      <text x="${xPos}" y="${h - padB + 14}" fill="#64748b" font-size="9" text-anchor="middle">H${hr}</text>
    `;
  }

  // Horizontal Y-grid lines
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxY / ySteps) * i;
    const yPos = y(val);
    gridLines += `
      <line x1="${padL}" y1="${yPos}" x2="${w - padR}" y2="${yPos}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
      <text x="${padL - 6}" y="${yPos + 3}" fill="#64748b" font-size="9" text-anchor="end">${val.toFixed(0)}</text>
    `;
  }

  // Statutory Threshold Lines
  let thresholdSvg = "";
  // 1. Factories Act 8-hr ceiling scaled (e.g. 10 ppm average)
  if (thresholdLines.factories_act) {
    const factTwaDose = 10.0; // 10 ppm baseline reference on scale
    if (factTwaDose <= maxY) {
      const yFact = y(factTwaDose);
      thresholdSvg += `
        <line x1="${padL}" y1="${yFact}" x2="${w - padR}" y2="${yFact}" stroke="#facc15" stroke-width="1.2" stroke-dasharray="4,4" />
        <text x="${w - padR - 4}" y="${yFact - 4}" fill="#facc15" font-size="8.5" font-weight="600" text-anchor="end">Factories Act 8-hr TWA (10 ppm)</text>
      `;
    }
  }

  // 2. ACGIH TLV-TWA (1.0 ppm)
  if (thresholdLines.acgih) {
    const acgihDose = 1.0;
    if (acgihDose <= maxY) {
      const yAcgih = y(acgihDose);
      thresholdSvg += `
        <line x1="${padL}" y1="${yAcgih}" x2="${w - padR}" y2="${yAcgih}" stroke="#34d399" stroke-width="1.2" stroke-dasharray="3,3" />
        <text x="${padL + 6}" y="${yAcgih - 4}" fill="#34d399" font-size="8.5" font-weight="600">ACGIH TWA (1 ppm)</text>
      `;
    }
  }

  // Polyline for observed trajectory
  const observedPts = trajectory.filter(p => !p.is_projected && p.cumulative_dose !== null);
  const polyCoords = observedPts.map(p => `${x(p.hour).toFixed(1)},${y(p.cumulative_dose).toFixed(1)}`).join(" ");

  // Gradient Area points
  let areaSvg = "";
  if (observedPts.length > 1) {
    const firstX = x(observedPts[0].hour).toFixed(1);
    const lastX = x(observedPts[observedPts.length - 1].hour).toFixed(1);
    const bottomY = (h - padB).toFixed(1);
    const areaPts = `${firstX},${bottomY} ` + polyCoords + ` ${lastX},${bottomY}`;
    areaSvg = `<polygon points="${areaPts}" fill="url(#doseGradArea)" />`;
  }

  // Hourly plot circles
  const circlesSvg = observedPts.map(p => `
    <circle cx="${x(p.hour).toFixed(1)}" cy="${y(p.cumulative_dose).toFixed(1)}" r="4" fill="#fb923c" stroke="#181412" stroke-width="1.5" class="dose-chart-dot" data-hr="${p.hour}" data-time="${p.time_str}" data-dose="${p.cumulative_dose.toFixed(2)}" data-ppm="${p.instant_ppm.toFixed(1)}" style="cursor:pointer;" />
  `).join("");

  // Discrete Scan Markers
  const scanMarkersSvg = markers.map(m => {
    const hr = m.minutes_from_start / 60.0;
    if (hr <= 8.0) {
      const cx = x(hr).toFixed(1);
      // approximate dose at that hour
      const markerDose = observedPts.length > 0 ? (observedPts[Math.min(observedPts.length - 1, Math.round(hr))].cumulative_dose || 0) : 0;
      const cy = y(markerDose).toFixed(1);
      return `
        <g class="dose-scan-pin" data-id="${m.scan_id}" data-time="${m.timestamp}" data-ppm="${m.ppm}" style="cursor:pointer;">
          <circle cx="${cx}" cy="${cy}" r="6.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" />
          <circle cx="${cx}" cy="${cy}" r="2" fill="#0f172a" />
        </g>
      `;
    }
    return "";
  }).join("");

  svg.innerHTML = `
    <defs>
      <linearGradient id="doseGradArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f97316" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#f97316" stop-opacity="0.0" />
      </linearGradient>
    </defs>
    ${gridLines}
    ${thresholdSvg}
    ${areaSvg}
    <!-- Base Axes -->
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(255,255,255,0.12)" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="rgba(255,255,255,0.12)" />
    <!-- Axis Titles -->
    <text x="${padL + plotW / 2}" y="${h - 4}" fill="#cbd5e1" font-size="9.5" font-weight="700" text-anchor="middle">Shift Elapsed Time (Hours) →</text>
    <text transform="rotate(-90)" x="${-(padT + plotH / 2)}" y="13" fill="#cbd5e1" font-size="9" font-weight="700" text-anchor="middle">Cumulative Dose (ppm·h) →</text>
    <!-- Trajectory Polyline -->
    <polyline points="${polyCoords}" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 0 6px #f97316)" />
    <!-- Circles & Markers -->
    ${circlesSvg}
    ${scanMarkersSvg}
  `;

  // Tooltip Interaction
  const tooltip = document.getElementById("dc-tooltip");
  const container = document.getElementById("dc-chart-container");
  if (tooltip && container) {
    const dots = svg.querySelectorAll(".dose-chart-dot, .dose-scan-pin");
    dots.forEach(d => {
      d.addEventListener("mouseenter", (e) => {
        const rect = container.getBoundingClientRect();
        const ptX = e.clientX - rect.left;
        const ptY = e.clientY - rect.top;

        tooltip.style.left = `${ptX}px`;
        tooltip.style.top = `${ptY}px`;

        if (d.classList.contains("dose-chart-dot")) {
          const hr = d.getAttribute("data-hr");
          const time = d.getAttribute("data-time");
          const dose = d.getAttribute("data-dose");
          const ppm = d.getAttribute("data-ppm");
          tooltip.innerHTML = `
            <strong>Hour ${hr} (${time})</strong><br>
            <span>Cumulative Dose: <strong style="color:var(--accent-mint);">${dose} ppm·h</strong></span><br>
            <span>Instant PPM: <strong>${ppm} ppm</strong></span>
          `;
        } else {
          const scanId = d.getAttribute("data-id");
          const time = d.getAttribute("data-time");
          const ppm = d.getAttribute("data-ppm");
          tooltip.innerHTML = `
            <strong style="color:#f59e0b;">Scan Event (${time})</strong><br>
            <span>Scan ID: <code>${scanId}</code></span><br>
            <span>Reading: <strong style="color:var(--accent-mint);">${ppm} ppm</strong></span>
          `;
        }
        tooltip.style.display = "block";
      });

      d.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });
  }
}

// ============================================================================
// Section 1 & 7: Badge Stock / Wristband Lab Subsystem
// ============================================================================

let cachedBatches = [];

async function loadBatches() {
  const tbody = document.getElementById("batches-table-body");
  if (!tbody) return;

  try {
    const batches = await API.getBatches();
    cachedBatches = batches || [];

    // Update KPI indicators
    const total = cachedBatches.length;
    const passed = cachedBatches.filter(b => b.qc_status === "PASSED").length;
    const rejected = cachedBatches.filter(b => b.qc_status === "REJECTED").length;
    const available = cachedBatches.reduce((acc, b) => acc + (b.available_strips || 0), 0);

    const kpiTot = document.getElementById("kpi-batch-total");
    if (kpiTot) kpiTot.textContent = total;
    const kpiPass = document.getElementById("kpi-batch-passed");
    if (kpiPass) kpiPass.textContent = passed;
    const kpiRej = document.getElementById("kpi-batch-rejected");
    if (kpiRej) kpiRej.textContent = rejected;
    const kpiAvail = document.getElementById("kpi-batch-available");
    if (kpiAvail) kpiAvail.textContent = available;

    if (cachedBatches.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No batch lots registered. Click "+ Cast New Batch" above.</td></tr>`;
      return;
    }

    tbody.innerHTML = cachedBatches.map(b => {
      const isPassed = b.qc_status === "PASSED";
      const qcBadge = isPassed
        ? `<span class="badge-cat badge-green">✓ PASSED</span>`
        : `<span class="badge-cat badge-red">⚠️ REJECTED</span>`;

      const deltaEBadge = b.virgin_baseline_delta_e <= 3.0
        ? `<span style="color:var(--accent-mint); font-weight:700;">ΔE ${b.virgin_baseline_delta_e.toFixed(2)}</span>`
        : `<span style="color:#f87171; font-weight:700;">ΔE ${b.virgin_baseline_delta_e.toFixed(2)} (Out of Spec)</span>`;

      return `
        <tr>
          <td><code style="color:var(--accent-mint); font-weight:700;">${b.batch_id}</code></td>
          <td>${b.cast_date}</td>
          <td><span style="color:#e2e8f0;">${b.expiration_date}</span></td>
          <td style="font-size:12px; max-width:180px; color:#94a3b8;">${b.storage_condition}</td>
          <td>${deltaEBadge}</td>
          <td>${qcBadge}</td>
          <td><strong style="color:${isPassed ? 'var(--accent-mint)' : '#64748b'};">${b.available_strips}</strong> / ${b.total_strips}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:#f59e0b;" onclick="window.openQCModalForBatch('${b.batch_id}')">
                🧪 Test QC
              </button>
              ${isPassed ? `
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px; color:var(--accent-primary); border-color:rgba(249,115,22,0.4);" onclick="window.openWristbandModalForBatch('${b.batch_id}')">
                  🪪 Wristband
                </button>
              ` : `
                <span style="font-size:11px; color:#ef4444; align-self:center;">Locked</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading batches:", err);
  }
}

// Modal: Cast New Batch
const modalCast = document.getElementById("modal-cast-batch");
document.getElementById("btn-open-cast-batch-modal")?.addEventListener("click", () => {
  if (modalCast) modalCast.style.display = "flex";
});
document.getElementById("btn-close-cast-modal")?.addEventListener("click", () => {
  if (modalCast) modalCast.style.display = "none";
});
document.getElementById("btn-cancel-cast-batch")?.addEventListener("click", () => {
  if (modalCast) modalCast.style.display = "none";
});
document.getElementById("btn-submit-cast-batch")?.addEventListener("click", async () => {
  const batchId = document.getElementById("cast-batch-id")?.value.trim();
  const daysExpiry = parseInt(document.getElementById("cast-days-expiry")?.value || "90");
  const totalStrips = parseInt(document.getElementById("cast-total-strips")?.value || "500");
  const storage = document.getElementById("cast-storage")?.value.trim();
  const labL = parseFloat(document.getElementById("cast-lab-l")?.value || "42.0");
  const labA = parseFloat(document.getElementById("cast-lab-a")?.value || "38.0");
  const labB = parseFloat(document.getElementById("cast-lab-b")?.value || "-12.0");

  if (!batchId) {
    alert("Please enter a valid Batch ID.");
    return;
  }

  try {
    await API.createBatch({
      batch_id: batchId,
      days_to_expiry: daysExpiry,
      total_strips: totalStrips,
      storage_condition: storage,
      virgin_lab_l: labL,
      virgin_lab_a: labA,
      virgin_lab_b: labB,
      checked_by: "QC Production Specialist"
    });
    alert(`Batch ${batchId} cast and certified!`);
    if (modalCast) modalCast.style.display = "none";
    loadBatches();
  } catch (err) {
    alert("Error casting batch: " + (err.detail || "Server error"));
  }
});

// Modal: Virgin Baseline QC Check
const modalQC = document.getElementById("modal-batch-qc");
const qcBatchSelect = document.getElementById("qc-batch-select");
const qcResultBox = document.getElementById("qc-result-box");

window.openQCModalForBatch = function(batchId) {
  if (!modalQC) return;
  modalQC.style.display = "flex";
  if (qcResultBox) qcResultBox.style.display = "none";

  // Populate batch select
  if (qcBatchSelect) {
    qcBatchSelect.innerHTML = cachedBatches.map(b => `<option value="${b.batch_id}" ${b.batch_id === batchId ? "selected" : ""}>${b.batch_id} (${b.qc_status})</option>`).join("");
  }
};

document.getElementById("btn-open-batch-qc-modal")?.addEventListener("click", () => {
  window.openQCModalForBatch(cachedBatches[0]?.batch_id || "");
});
document.getElementById("btn-close-qc-modal")?.addEventListener("click", () => {
  if (modalQC) modalQC.style.display = "none";
});
document.getElementById("btn-cancel-batch-qc")?.addEventListener("click", () => {
  if (modalQC) modalQC.style.display = "none";
});

// Preset buttons
document.getElementById("qc-preset-pass")?.addEventListener("click", () => {
  document.getElementById("qc-lab-l").value = "42.2";
  document.getElementById("qc-lab-a").value = "37.8";
  document.getElementById("qc-lab-b").value = "-12.1";
});
document.getElementById("qc-preset-fail")?.addEventListener("click", () => {
  document.getElementById("qc-lab-l").value = "52.0";
  document.getElementById("qc-lab-a").value = "30.0";
  document.getElementById("qc-lab-b").value = "-2.0";
});

document.getElementById("btn-execute-batch-qc")?.addEventListener("click", async () => {
  const batchId = qcBatchSelect ? qcBatchSelect.value : "";
  const labL = parseFloat(document.getElementById("qc-lab-l")?.value || "42.0");
  const labA = parseFloat(document.getElementById("qc-lab-a")?.value || "38.0");
  const labB = parseFloat(document.getElementById("qc-lab-b")?.value || "-12.0");

  try {
    const res = await API.performBatchQCCheck({
      batch_id: batchId,
      virgin_lab_l: labL,
      virgin_lab_a: labA,
      virgin_lab_b: labB,
      checked_by: "Senior QC Chemist Dr. Rao",
      notes: "Laboratory baseline certification"
    });

    if (qcResultBox) {
      qcResultBox.style.display = "block";
      if (res.passed) {
        qcResultBox.style.background = "rgba(249, 115, 22, 0.15)";
        qcResultBox.style.border = "1px solid rgba(249, 115, 22, 0.4)";
        qcResultBox.style.color = "var(--accent-mint)";
        qcResultBox.innerHTML = `
          <strong>✓ QC PASSED (WITHIN SPECIFICATION)</strong><br>
          Measured Virgin ΔE₀₀ = <strong>${res.virgin_baseline_delta_e}</strong> (Spec limit ≤ ${res.spec_threshold}).<br>
          Batch ${batchId} certified for wristband assignment.
        `;
      } else {
        qcResultBox.style.background = "rgba(239, 68, 68, 0.15)";
        qcResultBox.style.border = "1px solid rgba(239, 68, 68, 0.4)";
        qcResultBox.style.color = "#f87171";
        qcResultBox.innerHTML = `
          <strong>⚠️ QC REJECTED (BASELINE OUT OF SPEC)</strong><br>
          Measured Virgin ΔE₀₀ = <strong>${res.virgin_baseline_delta_e}</strong> exceeds tolerance (≤ ${res.spec_threshold}).<br>
          ${res.rejection_reason}<br>
          Strips in this batch have been automatically locked & recalled.
        `;
      }
    }
    loadBatches();
  } catch (err) {
    alert("Error executing QC: " + (err.detail || "Server error"));
  }
});

// Modal: Issue Wristband QR
const modalWristband = document.getElementById("modal-wristband-issue-qr");
const wbWorkerSelect = document.getElementById("wb-assign-worker-select");
const wbBatchSelect = document.getElementById("wb-assign-batch-select");
const wbMethodSelect = document.getElementById("wb-assign-method-select");
const wbPreviewContainer = document.getElementById("wb-preview-container");

window.openWristbandModalForBatch = async function(batchId) {
  if (!modalWristband) return;
  modalWristband.style.display = "flex";

  // Populate workers
  const workers = await API.getWorkers();
  if (wbWorkerSelect) {
    wbWorkerSelect.innerHTML = (workers || []).map(w => `<option value="${w.id}">${w.name} (${w.id}) - ${w.department}</option>`).join("");
  }

  // Populate passed batches
  if (wbBatchSelect) {
    const passed = cachedBatches.filter(b => b.qc_status === "PASSED");
    wbBatchSelect.innerHTML = passed.map(b => `<option value="${b.batch_id}" ${b.batch_id === batchId ? "selected" : ""}>${b.batch_id} (Expires: ${b.expiration_date})</option>`).join("");
  }

  updateWristbandPreview();
};

document.getElementById("btn-open-wristband-qr-modal")?.addEventListener("click", () => {
  const passedBatch = cachedBatches.find(b => b.qc_status === "PASSED");
  window.openWristbandModalForBatch(passedBatch ? passedBatch.batch_id : "");
});
document.getElementById("btn-close-wristband-modal")?.addEventListener("click", () => {
  if (modalWristband) modalWristband.style.display = "none";
});
document.getElementById("btn-cancel-wristband-issue")?.addEventListener("click", () => {
  if (modalWristband) modalWristband.style.display = "none";
});

function updateWristbandPreview() {
  if (!wbPreviewContainer || !window.QRGenerator) return;
  const workerId = wbWorkerSelect ? wbWorkerSelect.value : "EMP_00542";
  const workerText = wbWorkerSelect?.options[wbWorkerSelect.selectedIndex]?.text || "John Martinez (EMP_00542)";
  const batchId = wbBatchSelect ? wbBatchSelect.value : "BATCH_2026_Q1_01";
  const batchObj = cachedBatches.find(b => b.batch_id === batchId) || {
    batch_id: batchId, expiration_date: "2026-06-15", virgin_baseline_delta_e: 0.28
  };
  const methodKey = wbMethodSelect ? wbMethodSelect.value : "cupan_optical";
  const stripId = `STR_${batchId.slice(-4)}_${Math.floor(1000 + Math.random() * 9000)}`;

  window.QRGenerator.renderWristbandBadge(
    { id: workerId, name: workerText.split(" (")[0] },
    batchObj,
    stripId,
    { id: methodKey, short_badge: methodKey === "cupan_optical" ? "Cu-PAN" : "Sensor", badge_class: "badge-green" },
    wbPreviewContainer
  );
}

wbWorkerSelect?.addEventListener("change", updateWristbandPreview);
wbBatchSelect?.addEventListener("change", updateWristbandPreview);
wbMethodSelect?.addEventListener("change", updateWristbandPreview);

document.getElementById("btn-generate-wristband-qr")?.addEventListener("click", async () => {
  const workerId = wbWorkerSelect ? wbWorkerSelect.value : "";
  const batchId = wbBatchSelect ? wbBatchSelect.value : "";
  const methodKey = wbMethodSelect ? wbMethodSelect.value : "cupan_optical";

  try {
    const res = await API.assignWristbandQR({
      worker_id: workerId,
      batch_id: batchId,
      method_key: methodKey
    });

    alert(`✓ Wristband QR Issued for ${res.worker_name}!\nLinked to Batch ${res.batch_id} & Method ${res.method_key.toUpperCase()}.\nPayload: ${res.qr_payload}`);
    updateWristbandPreview();
  } catch (err) {
    alert("Error issuing wristband: " + (err.detail || "Server error"));
  }
});

// ============================================================================
// Section 8: Cryptographic Audit Certificate Modal (Supervisor)
// ============================================================================
const modalAuditCert = document.getElementById("modal-audit-cert");
const auditCertContent = document.getElementById("audit-cert-content");

window.openAuditCertificateModal = async function(scanId) {
  if (!modalAuditCert || !auditCertContent) return;
  modalAuditCert.style.display = "flex";
  auditCertContent.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Fetching cryptographic audit trail & integrity seal...</div>`;

  try {
    const cert = await API.getAuditCertificate(scanId);
    auditCertContent.innerHTML = `
      <div style="background:linear-gradient(135deg, rgba(249,115,22,0.15), rgba(225,29,72,0.08)); border:1px solid rgba(249,115,22,0.4); border-radius:12px; padding:14px; margin-bottom:14px;">
        <div style="color:var(--accent-mint); font-weight:800; font-size:11px; letter-spacing:1px; margin-bottom:4px;">CRYPTOGRAPHIC DIGITAL SEAL</div>
        <div style="font-family:'JetBrains Mono'; font-size:13px; color:#ffffff; font-weight:700;">${cert.cryptographic_seal}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Algorithm: ${cert.hash_algorithm} • Certified Immutable Proof</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div class="glass-card" style="padding:10px;">
          <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">Worker / Operator</span>
          <div style="font-weight:700; color:#fff; font-size:13px;">${cert.worker_name} (${cert.worker_id})</div>
        </div>
        <div class="glass-card" style="padding:10px;">
          <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">PPM Reading & Exposure</span>
          <div style="font-weight:700; color:var(--accent-mint); font-size:13px;">${cert.predicted_ppm} ppm • ${cert.exposure_level}</div>
        </div>
      </div>

      <div style="background:#13151f; border:1px solid rgba(249,115,22,0.25); border-radius:10px; padding:12px; margin-bottom:14px; font-size:12px; display:flex; flex-direction:column; gap:6px;">
        <div><span style="color:#94a3b8;">Raw Optical Image Hash (SHA-256):</span><br><strong style="font-family:'JetBrains Mono'; color:var(--accent-mint); font-size:11px; word-break:break-all;">${cert.raw_image_hash}</strong></div>
        <div><span style="color:#94a3b8;">Vision Pipeline Version:</span> <strong style="color:#fff;">${cert.pipeline_version}</strong></div>
        <div><span style="color:#94a3b8;">Certified Calibration Curve:</span> <strong style="color:#fff;">${cert.calibration_version} (${cert.calibration_curve_id})</strong></div>
        <div><span style="color:#94a3b8;">Physical Strip / Batch:</span> <strong style="color:#fff;">${cert.strip_id} (Lot: ${cert.strip_batch})</strong></div>
        <div><span style="color:#94a3b8;">Timestamp:</span> <strong style="color:#fff;">${cert.timestamp}</strong></div>
      </div>

      <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.25); border-radius:10px; padding:12px; margin-bottom:16px;">
        <div style="color:#f59e0b; font-weight:800; font-size:11px; margin-bottom:6px; letter-spacing:0.5px;">HOW DO WE TRUST THIS NUMBER?</div>
        <pre style="white-space:pre-wrap; font-size:11.5px; color:#cbd5e1; font-family:inherit; margin:0; line-height:1.5;">${cert.trust_explanation}</pre>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-secondary" onclick="window.print()">🖨️ Print Full Audit Certificate</button>
      </div>
    `;
  } catch (err) {
    auditCertContent.innerHTML = `<div style="color:#f87171; padding:20px; text-align:center;">Failed to load certificate: ${err.detail || 'Audit record unavailable'}</div>`;
  }
};

document.getElementById("btn-close-audit-cert")?.addEventListener("click", () => {
  if (modalAuditCert) modalAuditCert.style.display = "none";
});

// ============================================================================
// Section 9: Role-Based Access Control (RBAC) Switcher
// ============================================================================
const rbacSelect = document.getElementById("rbac-role-select");
rbacSelect?.addEventListener("change", (e) => {
  const role = e.target.value;
  applyRBACOverlay(role);
});

function applyRBACOverlay(role) {
  const btnIssue = document.getElementById("btn-issue-strip");
  const btnCast = document.getElementById("btn-open-cast-batch-modal");
  const btnQC = document.getElementById("btn-open-batch-qc-modal");
  const undoBtns = document.querySelectorAll(".btn-undo");

  if (role === "Worker") {
    alert("🔒 Worker Role Active: Limited to personal dose monitoring. Administrative actions, threshold modifications, and batch creation are restricted.");
    if (btnIssue) btnIssue.style.display = "none";
    if (btnCast) btnCast.style.display = "none";
    if (btnQC) btnQC.style.display = "none";
    undoBtns.forEach(b => b.style.display = "none");
  } else if (role === "Supervisor") {
    if (btnIssue) btnIssue.style.display = "inline-flex";
    if (btnCast) btnCast.style.display = "inline-flex";
    if (btnQC) btnQC.style.display = "inline-flex";
    undoBtns.forEach(b => b.style.display = "none");
  } else if (role === "Safety Officer") {
    if (btnIssue) btnIssue.style.display = "inline-flex";
    if (btnCast) btnCast.style.display = "inline-flex";
    if (btnQC) btnQC.style.display = "inline-flex";
    undoBtns.forEach(b => b.style.display = "none");
  } else if (role === "Admin") {
    if (btnIssue) btnIssue.style.display = "inline-flex";
    if (btnCast) btnCast.style.display = "inline-flex";
    if (btnQC) btnQC.style.display = "inline-flex";
    undoBtns.forEach(b => b.style.display = "inline-flex");
  }
}

// Initial Load
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadDashboard();
});
