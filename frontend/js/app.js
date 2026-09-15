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
      "tab-operations": "Operations Monitoring Dashboard",
      "tab-ai-model": "AI Model Center & Version Registry",
      "tab-safety": "Safety Center & Threshold Version Control",
      "tab-workers": "Worker & Analytics Explorer",
      "tab-audit": "Audit Logs & Git Version History"
    };
    document.getElementById("page-title").textContent = titles[targetId] || "Dashboard";
  });
});

// Load All Dashboard Data
async function loadDashboard() {
  try {
    await Promise.all([
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
        <td style="font-weight:600; color:#fff;">${s.worker_name} (${s.worker_id})</td>
        <td>${timeFormatted}</td>
        <td><code style="color:#38bdf8;">${s.strip_id}</code></td>
        <td><span class="badge-cat ${s.badge_class}">${s.predicted_class}</span></td>
        <td style="font-weight:700;">${s.predicted_ppm} ppm <span style="font-size:11px; color:var(--text-muted);">(${s.predicted_ppm_range})</span></td>
        <td>${statusPill}</td>
        <td>${Math.round(s.model_confidence * 100)}%</td>
        <td>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="window.reviewScan('${s.scan_id}')">
            ${s.supervisor_reviewed ? "✓ Reviewed" : "Approve for Training"}
          </button>
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
        <td style="font-weight:600; color:#fff;">${a.worker_name}</td>
        <td><span class="alert-pill ${pillClass}">${a.alert_level}</span></td>
        <td style="font-weight:700;">${a.ppm_value} ppm</td>
        <td style="max-width:280px;">${a.message}</td>
        <td><span style="color:#f59e0b; font-weight:700;">${a.status}</span></td>
        <td>
          ${a.status === "ACTIVE" ? `
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="window.ackAlert('${a.alert_id}')">
              Acknowledge
            </button>
          ` : `<span style="color:#10b981; font-size:12px;">Acknowledged</span>`}
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
  document.getElementById("model-center-active-ver").textContent = activeModel.version;
  document.getElementById("model-center-acc").textContent = `${Math.round(activeModel.test_accuracy * 1000) / 10}%`;
  document.getElementById("model-center-status").textContent = activeModel.approval_status;

  renderConfusionMatrix(activeModel.confusion_matrix, activeModel.classes);

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
      actionBtn = `<span style="color:#10b981; font-size:12px;">Active</span>`;
    }

    return `
      <tr>
        <td style="font-weight:700; color:#60a5fa;">${m.version}</td>
        <td>${Math.round(m.test_accuracy * 1000) / 10}%</td>
        <td>${badge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join("");

  // Populate rollback modal options
  const select = document.getElementById("modal-select-model");
  select.innerHTML = models.map(m => `<option value="${m.version}">${m.version} (${m.model_name}) - ${Math.round(m.test_accuracy*100)}% Acc</option>`).join("");
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
      ? `<span style="color:#10b981; font-size:12px; font-weight:700;">Current</span>`
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
  container.innerHTML = workers.map(w => `
    <div class="glass-card" style="padding:14px; cursor:pointer; border:1px solid var(--border-color);" onclick="window.selectWorker('${w.id}')">
      <div style="font-weight:700; color:#fff;">${w.name}</div>
      <div style="font-size:12px; color:var(--text-muted);">${w.id} • ${w.department}</div>
      <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:12px;">
        <span>Scans: <b>${w.total_scans}</b></span>
        <span>Alerts: <b style="color:${w.total_alerts > 0 ? '#ef4444' : '#10b981'};">${w.total_alerts}</b></span>
      </div>
    </div>
  `).join("");

  // Populate scan simulator worker dropdown
  const workerSelect = document.getElementById("scan-worker-select");
  workerSelect.innerHTML = workers.map(w => `<option value="${w.id}">${w.name} (${w.id})</option>`).join("");

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
          <span style="font-size:16px; font-weight:800; color:#fff;">${pt.predicted_ppm} ppm</span>
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
      <div style="font-size:13px; font-weight:600; margin-top:4px; color:#fff;">${c.message}</div>
      ${c.ref_names ? `<div style="font-size:11px; color:#34d399; margin-top:2px;">${c.ref_names}</div>` : ''}
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
      <div style="font-weight:700; font-size:13px; margin-top:4px; color:#fff;">${l.action}</div>
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

// Initial Load
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
});
