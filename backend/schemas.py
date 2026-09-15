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
