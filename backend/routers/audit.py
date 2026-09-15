"""
Audit Trail & Event Sourcing Router
Implements Section 5.1 & Section 10 Audit Trail Requirements (Pages 12, 26-27).
Also exposes Git version checkpoints to the web dashboard.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import subprocess
from backend.database import get_db
from backend.models import AuditLog
import config

router = APIRouter(prefix="/api/audit", tags=["Audit Trail & Undo History"])

@router.get("/logs")
def get_audit_logs(
    entity_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Query immutable audit logs."""
    q = db.query(AuditLog)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    logs = q.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "action": l.action,
            "actor_id": l.actor_id,
            "details": l.details,
            "timestamp": l.timestamp.isoformat()
        }
        for l in logs
    ]

@router.get("/git-history")
def get_git_history(limit: int = 15):
    """Fetches Git version checkpoints and commit tags for the web dashboard."""
    try:
        res = subprocess.run(
            ["git", "log", f"-n{limit}", "--pretty=format:%h|%ad|%s|%d", "--date=iso"],
            cwd=str(config.BASE_DIR),
            capture_output=True,
            text=True,
            check=True
        )
        lines = res.stdout.strip().split("\n")
        commits = []
        for line in lines:
            if not line:
                continue
            parts = line.split("|")
            if len(parts) >= 3:
                commits.append({
                    "hash": parts[0],
                    "date": parts[1],
                    "message": parts[2],
                    "ref_names": parts[3] if len(parts) > 3 else ""
                })
        return commits
    except Exception as e:
        return [{"hash": "local", "date": "", "message": f"Git status: {str(e)}", "ref_names": ""}]
