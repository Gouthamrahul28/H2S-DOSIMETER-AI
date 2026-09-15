/**
 * H2S Industrial Safety Platform - API Client
 */

const API_BASE = ""; // Relative to host origin

export const API = {
  // Authentication
  async workerLogin(workerId, pin) {
    const res = await fetch(`${API_BASE}/api/auth/worker-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_id: workerId, pin: pin })
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  // Strip Management & Validation
  async validateStrip(workerId, stripId) {
    const res = await fetch(`${API_BASE}/api/strips/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_id: workerId, strip_id: stripId })
    });
    return await res.json();
  },

  async createStrip(stripId, batchId, assignedWorkerId, daysValid = 90) {
    const res = await fetch(`${API_BASE}/api/strips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strip_id: stripId,
        batch_id: batchId,
        assigned_worker_id: assignedWorkerId,
        days_valid: daysValid
      })
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  async getStrips() {
    const res = await fetch(`${API_BASE}/api/strips`);
    return await res.json();
  },

  // Scan Submission
  async submitScan(payload) {
    const res = await fetch(`${API_BASE}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  async listScans(limit = 20) {
    const res = await fetch(`${API_BASE}/api/scans?limit=${limit}`);
    return await res.json();
  },

  // Operations Monitoring
  async getKPIs() {
    const res = await fetch(`${API_BASE}/api/supervisor/monitoring/kpis`);
    return await res.json();
  },

  async getTrends() {
    const res = await fetch(`${API_BASE}/api/supervisor/monitoring/trends`);
    return await res.json();
  },

  async getAlerts() {
    const res = await fetch(`${API_BASE}/api/supervisor/monitoring/alerts`);
    return await res.json();
  },

  // AI Model Center
  async getModels() {
    const res = await fetch(`${API_BASE}/api/supervisor/ai/models`);
    return await res.json();
  },

  async getActiveModel() {
    const res = await fetch(`${API_BASE}/api/supervisor/ai/active-model`);
    return await res.json();
  },

  async rollbackModel(targetVersion, reason = "Supervisor model rollback") {
    const res = await fetch(`${API_BASE}/api/supervisor/ai/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_version: targetVersion, reason: reason, requested_by: "Supervisor" })
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  async approveModel(version) {
    const res = await fetch(`${API_BASE}/api/supervisor/ai/approve/${version}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_by: "Supervisor" })
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  // Safety Center & Undo
  async getCurrentThresholds() {
    const res = await fetch(`${API_BASE}/api/supervisor/safety/config/current`);
    return await res.json();
  },

  async getThresholdHistory() {
    const res = await fetch(`${API_BASE}/api/supervisor/safety/config/history`);
    return await res.json();
  },

  async updateThresholds(thresholds, reason = "Manual threshold adjustment") {
    const res = await fetch(`${API_BASE}/api/supervisor/safety/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...thresholds, reason: reason, updated_by: "Supervisor" })
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  async rollbackThresholds(configId) {
    const res = await fetch(`${API_BASE}/api/supervisor/safety/config/rollback/${configId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_by: "Supervisor" })
    });
    if (!res.ok) throw await res.json();
    return await res.json();
  },

  async acknowledgeAlert(alertId) {
    const res = await fetch(`${API_BASE}/api/supervisor/safety/alerts/${alertId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supervisor_id: "SUPERVISOR_LEAD" })
    });
    return await res.json();
  },

  // Workers & Analytics
  async getWorkers() {
    const res = await fetch(`${API_BASE}/api/workers`);
    return await res.json();
  },

  async getWorkerTimeline(workerId) {
    const res = await fetch(`${API_BASE}/api/workers/${workerId}/timeline`);
    return await res.json();
  },

  // Audit Logs & Git History
  async getAuditLogs(limit = 50) {
    const res = await fetch(`${API_BASE}/api/audit/logs?limit=${limit}`);
    return await res.json();
  },

  async getGitHistory(limit = 10) {
    const res = await fetch(`${API_BASE}/api/audit/git-history?limit=${limit}`);
    return await res.json();
  }
};
