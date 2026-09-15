"""
H2S Industrial Safety Platform - System Runner
Initializes database, verifies model registry, and launches the FastAPI service.
"""

import sys
import uvicorn
import config
from backend.seed_data import seed_all

def main():
    print("=" * 65)
    print("      H2S INDUSTRIAL WORKER SAFETY PLATFORM (v2.0)")
    print("=" * 65)
    
    # 1. Ensure database is initialized and seeded
    try:
        seed_all()
    except Exception as e:
        print(f"Warning during database initialization: {e}")

    # 2. Print Server URLs
    print(f"\n[OK] Supervisor Web Dashboard: http://{config.HOST}:{config.PORT}/")
    print(f"[OK] Worker Smartphone Scanner: http://{config.HOST}:{config.PORT}/worker")
    print(f"[OK] API Interactive Docs:     http://{config.HOST}:{config.PORT}/docs")
    print(f"[OK] Undo & Version CLI:       python undo.py --history")
    print("=" * 65)
    print("Starting server... Press Ctrl+C to stop.\n")

    # 3. Start Uvicorn Server
    uvicorn.run(
        "backend.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
        log_level="info"
    )

if __name__ == "__main__":
    main()
