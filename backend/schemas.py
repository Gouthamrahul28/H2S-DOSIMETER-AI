"""
Pydantic Schemas for Requests and Responses
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

# --- Authentication Schemas ---
class WorkerLoginRequest(BaseModel):
    worker_id: str
    pin: str

class SupervisorLoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_info: Dict[str, Any]

# --- Strip Validation Schemas ---
class StripValidationRequest(BaseModel):
    worker_id: str
    strip_id: str

class StripValidationResponse(BaseModel):
    valid: bool
    reason_code: Optional[str] = None  # STRIP_NOT_FOUND, NOT_ASSIGNED, INACTIVE, EXPIRED, ALREADY_USED, etc.
    message: str
    strip_details: Optional[Dict[str, Any]] = None

# --- Scan Submission Schemas ---
class ScanSubmissionRequest(BaseModel):
    worker_id: str
    strip_id: str
    phone_model: Optional[str] = "Industrial Android Scanner"
    image_base64: Optional[str] = None  # Base64 data or upload directly
    simulated_ppm: Optional[float] = None # Optional override for test scenarios

class ScanResponse(BaseModel):
    scan_id: str
    worker_id: str
    strip_id: str
    strip_batch: str
    timestamp: str
    predicted_class: str
    predicted_ppm: float
    predicted_ppm_range: str
    model_confidence: float
    model_version: str
    exposure_level: str
    worker_action: str
    alert_level: str
    safety_threshold_exceeded: bool
    alert_triggered: bool
    color_hex: str
    badge_class: str
    image_quality: Dict[str, Any]
    image_url: Optional[str] = None
    raw_image_url: Optional[str] = None
    roi_coordinates: Optional[Dict[str, Any]] = None
    extracted_features: Optional[Dict[str, Any]] = None

# --- Safety Configuration Schemas ---
class SafetyConfigUpdateRequest(BaseModel):
    yellow_ppm: float = Field(..., gt=0)
    orange_ppm: float = Field(..., gt=0)
    red_ppm: float = Field(..., gt=0)
    evac_ppm: float = Field(..., gt=0)
    updated_by: str = "Safety Supervisor"
    reason: str = "Threshold calibration update"

class SafetyConfigResponse(BaseModel):
    id: int
    version_tag: str
    yellow_ppm: float
    orange_ppm: float
    red_ppm: float
    evac_ppm: float
    updated_by: str
    reason: str
    is_active: bool
    created_at: str

# --- AI Model Registry Schemas ---
class ModelRollbackRequest(BaseModel):
    target_version: str
    reason: Optional[str] = "Performance rollback requested by supervisor"
    requested_by: str = "Supervisor"

class ModelVersionResponse(BaseModel):
    version: str
    model_name: str
    architecture: str
    test_accuracy: float
    is_active: bool
    approval_status: str
    metrics: Dict[str, Any]
    confusion_matrix: List[List[int]]
    deployed_at: str

# --- Operations Dashboard Schemas ---
class OperationsKPIResponse(BaseModel):
    active_workers: int
    scans_today: int
    total_alerts_24h: int
    yellow_alerts: int
    orange_alerts: int
    red_alerts: int
    evac_alerts: int
    active_model_version: str
    avg_ppm_today: float

# --- Shift Monitor Schemas ---
class ShiftWorkerSummary(BaseModel):
    worker_id: str
    badge_number: str
    name: str
    department: str
    site: str
    role: str
    method_key: str
    method: Dict[str, Any]
    cumulative_dose_ppm_h: float
    twa_current_ppm: float
    stel_peak_ppm: float
    last_ppm: float
    last_scan_time: Optional[str] = None
    last_read_str: str
    scan_count: int
    tier: Dict[str, Any]
    compliance: Dict[str, Any]

class ShiftMonitorResponse(BaseModel):
    shift_info: Dict[str, Any]
    standard_applied: Dict[str, Any]
    all_standards: Dict[str, Any]
    summary_kpis: Dict[str, Any]
    workers: List[ShiftWorkerSummary]

# --- Batch Stock & Wristband Lab Schemas ---
class BatchQCCheckRequest(BaseModel):
    batch_id: str
    virgin_lab_l: Optional[float] = None
    virgin_lab_a: Optional[float] = None
    virgin_lab_b: Optional[float] = None
    image_base64: Optional[str] = None
    checked_by: Optional[str] = "Senior QC Chemist"
    notes: Optional[str] = None

class BatchQCCheckResponse(BaseModel):
    batch_id: str
    qc_status: str  # PASSED or REJECTED
    virgin_baseline_delta_e: float
    spec_threshold: float = 3.0
    measured_lab: Dict[str, float]
    reference_lab: Dict[str, float]
    passed: bool
    rejection_reason: Optional[str] = None
    qc_checked_at: str
    qc_checked_by: str

class StripBatchResponse(BaseModel):
    batch_id: str
    cast_date: str
    expiration_date: str
    storage_condition: str
    virgin_baseline_delta_e: float
    qc_status: str
    qc_notes: Optional[str] = None
    qc_checked_at: Optional[str] = None
    qc_checked_by: Optional[str] = None
    total_strips: int
    available_strips: int
    is_valid_for_assignment: bool

class StripBatchCreateRequest(BaseModel):
    batch_id: str
    days_to_expiry: int = 90
    storage_condition: Optional[str] = "Desiccated pouch, 4°C sealed dark container"
    total_strips: int = 500
    virgin_lab_l: Optional[float] = 42.0
    virgin_lab_a: Optional[float] = 38.0
    virgin_lab_b: Optional[float] = -12.0
    checked_by: Optional[str] = "QC Production Chemist"

# --- Wristband QR Assignment Schemas ---
class WristbandQRAssignmentRequest(BaseModel):
    worker_id: str
    batch_id: str
    strip_id: Optional[str] = None
    method_key: Optional[str] = "cupan_optical"

class WristbandQRAssignmentResponse(BaseModel):
    worker_id: str
    worker_name: str
    batch_id: str
    strip_id: str
    method_key: str
    expiration_date: str
    qr_payload: str
    verification_status: str

# --- Audit Certificate Schemas ---
class AuditCertificateResponse(BaseModel):
    scan_id: str
    raw_image_hash: str  # SHA-256
    hash_algorithm: str = "SHA-256"
    pipeline_version: str
    calibration_version: str
    calibration_curve_id: str
    operator_id: str
    worker_id: str
    worker_name: str
    strip_id: str
    strip_batch: str
    timestamp: str
    predicted_ppm: float
    predicted_class: str
    exposure_level: str
    alert_triggered: bool
    colorimetric_verification: Dict[str, Any]
    image_quality_metrics: Dict[str, Any]
    cryptographic_seal: str
    trust_explanation: str

