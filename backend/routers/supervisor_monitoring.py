"""
Supervisor Operations Monitoring Router
Implements Section 5.1 & 5.2 (Pages 12-13):
- KPI Cards (Active Workers, Scans Today, Alerts 24h with color counters)
- Latest Scans Table
- Alert Summary
- Trend Charts (PPM and concentration distribution)
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Dict, Any, List
from backend.database import get_db
from backend.models import Worker, Scan, Alert, ModelRegistryRecord
from backend.schemas import OperationsKPIResponse
import config

router = APIRouter(prefix="/api/supervisor/monitoring", tags=["Supervisor Monitoring"])

@router.get("/kpis", response_model=OperationsKPIResponse)
def get_operations_kpis(db: Session = Depends(get_db)):
    """Operations Dashboard KPI Cards matching Page 13 specification."""
    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    start_of_today = datetime(now.year, now.month, now.day)

    active_workers = db.query(Worker).filter(Worker.status == "ACTIVE").count()
    scans_today = db.query(Scan).filter(Scan.timestamp >= start_of_today).count()
    total_alerts_24h = db.query(Alert).filter(Alert.created_at >= day_ago).count()

    yellow_alerts = db.query(Alert).filter(Alert.created_at >= day_ago, Alert.alert_level == "Yellow").count()
    orange_alerts = db.query(Alert).filter(Alert.created_at >= day_ago, Alert.alert_level == "Orange").count()
    red_alerts = db.query(Alert).filter(Alert.created_at >= day_ago, Alert.alert_level == "Red").count()
    evac_alerts = db.query(Alert).filter(Alert.created_at >= day_ago, Alert.alert_level == "Red + Alarm").count()

    active_model = db.query(ModelRegistryRecord).filter(ModelRegistryRecord.is_active == True).first()
    active_version = active_model.version if active_model else config.DEFAULT_MODEL_VERSION

    # Average PPM today
    scans_today_records = db.query(Scan).filter(Scan.timestamp >= start_of_today).all()
    avg_ppm = round(sum(s.predicted_ppm for s in scans_today_records) / len(scans_today_records), 1) if scans_today_records else 0.0

    return OperationsKPIResponse(
        active_workers=active_workers,
        scans_today=scans_today,
        total_alerts_24h=total_alerts_24h,
        yellow_alerts=yellow_alerts,
        orange_alerts=orange_alerts,
        red_alerts=red_alerts,
        evac_alerts=evac_alerts,
        active_model_version=active_version,
        avg_ppm_today=avg_ppm
    )

@router.get("/trends")
def get_monitoring_trends(db: Session = Depends(get_db)):
    """Hourly and category distribution trends for the dashboard."""
    scans = db.query(Scan).order_by(Scan.timestamp.desc()).limit(100).all()

    # Category breakdown
    cat_counts = {"C0": 0, "C1": 0, "C2": 0, "C3": 0, "C4": 0}
    for s in scans:
        if s.predicted_class in cat_counts:
            cat_counts[s.predicted_class] += 1

    # Recent scans time series (last 20)
    time_series = [
        {
            "timestamp": s.timestamp.strftime("%H:%M"),
            "ppm": s.predicted_ppm,
            "class": s.predicted_class,
            "worker_id": s.worker_id
        }
        for s in reversed(scans[:20])
    ]

    return {
        "category_distribution": cat_counts,
        "recent_time_series": time_series
    }

@router.get("/alerts")
def get_recent_alerts(limit: int = 20, db: Session = Depends(get_db)):
    """Latest alerts for the supervisor monitoring panel."""
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(limit).all()
    results = []
    for a in alerts:
        worker = db.query(Worker).filter(Worker.id == a.worker_id).first()
        results.append({
            "alert_id": a.alert_id,
            "scan_id": a.scan_id,
            "worker_id": a.worker_id,
            "worker_name": worker.name if worker else a.worker_id,
            "alert_level": a.alert_level,
            "ppm_value": a.ppm_value,
            "message": a.message,
            "status": a.status,
            "created_at": a.created_at.isoformat()
        })
    return results
