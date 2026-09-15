"""
Worker Management & Analytics Router
Implements Worker List, Filtering, and Individual Worker Timeline (Section 5.1).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.models import Worker, Scan, Alert, Strip

router = APIRouter(prefix="/api/workers", tags=["Workers"])

@router.get("")
def list_workers(
    department: Optional[str] = None,
    site: Optional[str] = None,
    status: Optional[str] = None,
    query: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retrieve all industrial workers with optional filtering."""
    q = db.query(Worker)
    if department:
        q = q.filter(Worker.department == department)
    if site:
        q = q.filter(Worker.site == site)
    if status:
        q = q.filter(Worker.status == status)
    if query:
        q = q.filter(
            (Worker.name.ilike(f"%{query}%")) |
            (Worker.id.ilike(f"%{query}%")) |
            (Worker.badge_number.ilike(f"%{query}%"))
        )
    
    workers = q.all()
    results = []
    for w in workers:
        total_scans = db.query(Scan).filter(Scan.worker_id == w.id).count()
        total_alerts = db.query(Alert).filter(Alert.worker_id == w.id).count()
        latest_scan = db.query(Scan).filter(Scan.worker_id == w.id).order_by(Scan.timestamp.desc()).first()
        results.append({
            "id": w.id,
            "badge_number": w.badge_number,
            "name": w.name,
            "department": w.department,
            "site": w.site,
            "role": w.role,
            "status": w.status,
            "total_scans": total_scans,
            "total_alerts": total_alerts,
            "last_scan_time": latest_scan.timestamp.isoformat() if latest_scan else None,
            "last_ppm": latest_scan.predicted_ppm if latest_scan else None,
            "last_category": latest_scan.predicted_class if latest_scan else None
        })
    return results

@router.get("/{worker_id}")
def get_worker(worker_id: str, db: Session = Depends(get_db)):
    """Retrieve specific worker details."""
    w = db.query(Worker).filter(Worker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {
        "id": w.id,
        "badge_number": w.badge_number,
        "name": w.name,
        "department": w.department,
        "site": w.site,
        "role": w.role,
        "status": w.status,
        "created_at": w.created_at.isoformat()
    }

@router.get("/{worker_id}/timeline")
def get_worker_timeline(worker_id: str, db: Session = Depends(get_db)):
    """Individual Worker Exposure Timeline as specified in Section 5.1."""
    w = db.query(Worker).filter(Worker.id == worker_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Worker not found")

    scans = db.query(Scan).filter(Scan.worker_id == worker_id).order_by(Scan.timestamp.desc()).all()
    strips = db.query(Strip).filter(Strip.assigned_worker_id == worker_id).all()
    alerts = db.query(Alert).filter(Alert.worker_id == worker_id).order_by(Alert.created_at.desc()).all()

    timeline_points = []
    for s in reversed(scans):
        timeline_points.append({
            "scan_id": s.scan_id,
            "timestamp": s.timestamp.isoformat(),
            "predicted_class": s.predicted_class,
            "predicted_ppm": s.predicted_ppm,
            "predicted_ppm_range": s.predicted_ppm_range,
            "model_confidence": s.model_confidence,
            "alert_triggered": s.alert_triggered,
            "image_quality_score": s.image_quality_score
        })

    return {
        "worker": {
            "id": w.id,
            "name": w.name,
            "badge_number": w.badge_number,
            "department": w.department,
            "site": w.site
        },
        "exposure_points": timeline_points,
        "assigned_strips": [
            {
                "strip_id": st.id,
                "batch_id": st.batch_id,
                "status": st.status,
                "expiration_date": st.expiration_date.strftime("%Y-%m-%d"),
                "use_count": st.use_count,
                "max_uses": st.max_uses
            }
            for st in strips
        ],
        "alerts": [
            {
                "alert_id": a.alert_id,
                "alert_level": a.alert_level,
                "ppm_value": a.ppm_value,
                "message": a.message,
                "status": a.status,
                "timestamp": a.created_at.isoformat()
            }
            for a in alerts
        ]
    }
