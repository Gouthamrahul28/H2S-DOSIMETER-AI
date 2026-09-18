"""
Database Engine and Session Configuration
Supports SQLite and PostgreSQL via SQLAlchemy
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import config

# SQLite requires check_same_thread=False for multithreading in FastAPI
connect_args = {"check_same_thread": False} if config.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    config.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db():
    """Initializes tables and safely applies SQLite column migrations for new audit fields."""
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            cursor = conn.connection.cursor()
            cursor.execute("PRAGMA table_info(scans)")
            existing_cols = [row[1] for row in cursor.fetchall()]
            if existing_cols:
                if "raw_image_hash" not in existing_cols:
                    cursor.execute("ALTER TABLE scans ADD COLUMN raw_image_hash VARCHAR(64)")
                if "pipeline_version" not in existing_cols:
                    cursor.execute("ALTER TABLE scans ADD COLUMN pipeline_version VARCHAR(30) DEFAULT 'CV-PIPE-v2.1'")
                if "calibration_version" not in existing_cols:
                    cursor.execute("ALTER TABLE scans ADD COLUMN calibration_version VARCHAR(30) DEFAULT 'v2.0-SIH26118'")
                if "operator_id" not in existing_cols:
                    cursor.execute("ALTER TABLE scans ADD COLUMN operator_id VARCHAR(50)")
                conn.connection.commit()
        except Exception:
            pass

def get_db():
    """FastAPI dependency for obtaining a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
