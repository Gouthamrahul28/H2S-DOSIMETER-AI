"""
SQLAlchemy ORM Data Models
Master Plan v2.0 Architecture & Audit Requirements
"""

from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from backend.database import Base

class Worker(Base):
    __tablename__ = "workers"

    id = Column(String(50), primary_key=True, index=True)  # e.g., EMP_00542
    badge_number = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    pin = Column(String(20), nullable=False)  # 4-6 digit worker PIN
    department = Column(String(100), default="Refinery Operations")
    site = Column(String(100), default="Facility Alpha")
    role = Column(String(50), default="Field Operator")  # Field Operator, Supervisor, Safety Admin
    status = Column(String(20), default="ACTIVE")  # ACTIVE, INACTIVE
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    strips = relationship("Strip", back_populates="assigned_worker")
    scans = relationship("Scan", back_populates="worker")
    alerts = relationship("Alert", back_populates="worker")


class Strip(Base):
    __tablename__ = "strips"

    id = Column(String(50), primary_key=True, index=True)  # e.g., STR_001234
    batch_id = Column(String(50), index=True, nullable=False)  # e.g., BATCH_2024_Q4_05
    assigned_worker_id = Column(String(50), ForeignKey("workers.id"), nullable=True)
    status = Column(String(20), default="ACTIVE")  # ACTIVE, INACTIVE, USED, EXPIRED, RECALLED
    expiration_date = Column(DateTime, nullable=False)
    use_count = Column(Integer, default=0)
    max_uses = Column(Integer, default=1)
    strip_type = Column(String(50), default="H2S_OPTICAL_V2")
    calibration_version = Column(String(20), default="v2.0")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    assigned_worker = relationship("Worker", back_populates="strips")
    scans = relationship("Scan", back_populates="strip")


class Scan(Base):
    """Scan Audit Model conforming exactly to Page 27 specification."""
    __tablename__ = "scans"

    scan_id = Column(String(60), primary_key=True, index=True)  # SCAN_20250120_001234
    worker_id = Column(String(50), ForeignKey("workers.id"), nullable=False, index=True)
    strip_id = Column(String(50), ForeignKey("strips.id"), nullable=False, index=True)
    strip_batch = Column(String(50), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    phone_model = Column(String(100), default="Industrial Mobile Scan Terminal")
    image_file = Column(String(255), nullable=True)
    image_quality_score = Column(Float, default=1.0)
    model_version = Column(String(50), default="v1.0")
    model_confidence = Column(Float, default=0.95)
    predicted_class = Column(String(10), nullable=False)  # C0, C1, C2, C3, C4
    predicted_ppm = Column(Float, default=0.0)
    predicted_ppm_range = Column(String(50), nullable=False)  # e.g. "18-22 ppm"
    safety_threshold_exceeded = Column(Boolean, default=False)
    alert_triggered = Column(Boolean, default=False)
    supervisor_reviewed = Column(Boolean, default=False)
    review_timestamp = Column(DateTime, nullable=True)
    approved_for_training = Column(Boolean, default=False)
    ground_truth_ppm = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    
    # Audit Trail Cryptographic Fields (Section 8)
    raw_image_hash = Column(String(64), nullable=True)  # SHA-256 hex digest of raw image bytes
    pipeline_version = Column(String(30), default="CV-PIPE-v2.1")
    calibration_version = Column(String(30), default="v2.0-SIH26118")
    operator_id = Column(String(50), nullable=True)

    # Relationships
    worker = relationship("Worker", back_populates="scans")
    strip = relationship("Strip", back_populates="scans")
    alerts = relationship("Alert", back_populates="scan")


class StripBatch(Base):
    """Badge Stock & Wristband Inventory Model (Section 1)."""
    __tablename__ = "strip_batches"

    batch_id = Column(String(50), primary_key=True, index=True)  # e.g., BATCH_2026_Q1_01
    cast_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    expiration_date = Column(DateTime, nullable=False)
    storage_condition = Column(String(100), default="Desiccated pouch, 4°C sealed dark container")
    virgin_baseline_l = Column(Float, default=42.0)
    virgin_baseline_a = Column(Float, default=38.0)
    virgin_baseline_b = Column(Float, default=-12.0)
    virgin_baseline_delta_e = Column(Float, default=0.0)
    qc_status = Column(String(20), default="PASSED")  # PASSED, REJECTED, PENDING
    qc_notes = Column(String(255), nullable=True)
    qc_checked_at = Column(DateTime, default=datetime.utcnow)
    qc_checked_by = Column(String(100), default="QC Lab Specialist")
    total_strips = Column(Integer, default=500)
    available_strips = Column(Integer, default=500)
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    alert_id = Column(String(60), primary_key=True, index=True)  # ALT_20250120_0001
    scan_id = Column(String(60), ForeignKey("scans.scan_id"), nullable=False)
    worker_id = Column(String(50), ForeignKey("workers.id"), nullable=False)
    alert_level = Column(String(30), nullable=False)  # Yellow, Orange, Red, Red + Alarm
    ppm_value = Column(Float, nullable=False)
    message = Column(String(255), nullable=False)
    status = Column(String(20), default="ACTIVE")  # ACTIVE, ACKNOWLEDGED, RESOLVED
    acknowledged_by = Column(String(100), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    worker = relationship("Worker", back_populates="alerts")
    scan = relationship("Scan", back_populates="alerts")


class SafetyConfigHistory(Base):
    """Tracks every change to safety threshold parameters with full undo capability."""
    __tablename__ = "safety_config_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    version_tag = Column(String(50), nullable=False, unique=True)  # e.g., CFG_20250120_1
    yellow_ppm = Column(Float, nullable=False)
    orange_ppm = Column(Float, nullable=False)
    red_ppm = Column(Float, nullable=False)
    evac_ppm = Column(Float, nullable=False)
    updated_by = Column(String(100), default="Safety Supervisor")
    reason = Column(String(255), default="Routine threshold update")
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelRegistryRecord(Base):
    """Tracks AI model versions and allows rollback to previous model versions."""
    __tablename__ = "model_registry"

    version = Column(String(50), primary_key=True)  # e.g., v1.0, v1.1
    model_name = Column(String(100), nullable=False)
    architecture = Column(String(100), default="MobileNetV3-Small + Classification Head")
    model_file = Column(String(255), nullable=False)
    test_accuracy = Column(Float, default=0.96)
    confusion_matrix_json = Column(Text, nullable=True)
    metrics_json = Column(Text, nullable=True)
    is_active = Column(Boolean, default=False)
    approval_status = Column(String(50), default="Approved (Active)")  # Pending Review, Approved (Active), Retired, Rolled Back
    deployed_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    """Immutable audit trail for every action across strips, scans, safety configs, and models."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(50), nullable=False)  # STRIP, SCAN, WORKER, SAFETY_CONFIG, MODEL
    entity_id = Column(String(100), nullable=False)
    action = Column(String(50), nullable=False)  # VALIDATE_FAIL, SCAN_RECORDED, CONFIG_UPDATED, CONFIG_ROLLED_BACK, MODEL_ROLLED_BACK
    actor_id = Column(String(100), default="SYSTEM")
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
