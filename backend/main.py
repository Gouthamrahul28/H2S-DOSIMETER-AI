"""
FastAPI Application Assembly
Integrates all routers, CORS, Static Files, and Exception Handlers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from backend.database import engine, Base
from backend.routers import (
    auth, workers, strips, scans,
    supervisor_monitoring, supervisor_ai, supervisor_safety, audit
)
import config

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="H2S Industrial Worker Safety Platform",
    description="Smart-indicator H2S monitoring with AI colorimetric analysis, versioning & undo architecture.",
    version="2.0.0"
)

# Enable CORS for development and cross-origin mobile clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(workers.router)
app.include_router(strips.router)
app.include_router(scans.router)
app.include_router(supervisor_monitoring.router)
app.include_router(supervisor_ai.router)
app.include_router(supervisor_safety.router)
app.include_router(audit.router)

# Mount uploaded images static folder
app.mount("/data/uploads", StaticFiles(directory=str(config.UPLOAD_DIR)), name="uploads")

# Mount frontend static assets if directory exists
if config.FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(config.FRONTEND_DIR)), name="frontend_static")

@app.get("/")
def serve_dashboard():
    """Serves the Supervisor Web Dashboard by default."""
    index_path = config.FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "H2S Industrial Safety Platform API v2.0 is running."}

@app.get("/worker")
def serve_worker_app():
    """Serves the Worker Mobile App simulator interface."""
    worker_path = config.FRONTEND_DIR / "worker.html"
    if worker_path.exists():
        return FileResponse(str(worker_path))
    return {"message": "Worker App interface not found."}

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "system": "H2S Industrial Safety Platform",
        "version": "2.0.0",
        "active_model": config.DEFAULT_MODEL_VERSION
    }
