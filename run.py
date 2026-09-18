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

    # 2. Detect local IP for mobile devices on same Wi-Fi
    local_ip = "127.0.0.1"
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    # 3. Print Server URLs
    print(f"\n[OK] Supervisor Web Dashboard (Local):  http://localhost:{config.PORT}/")
    print(f"[OK] Worker Smartphone Scanner (Local): http://localhost:{config.PORT}/worker")
    if local_ip != "127.0.0.1":
        print(f"[OK] Mobile Phone on same Wi-Fi / Plant: http://{local_ip}:{config.PORT}/worker")
        print(f"[OK] Dashboard on same Wi-Fi / Plant:   http://{local_ip}:{config.PORT}/")
    print(f"[OK] API Interactive Docs:              http://localhost:{config.PORT}/docs")
    print(f"[OK] Undo & Version CLI:                python undo.py --history")
    print(f"[INFO] To get an instant public HTTPS link, run: npx localtunnel --port {config.PORT}")
    print("=" * 65)
    print("Starting server... Press Ctrl+C to stop.\n")

    # 3. Start Uvicorn Server
    uvicorn.run(
        "backend.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True,
        log_level="info"
    )

if __name__ == "__main__":
    main()
