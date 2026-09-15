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

def get_db():
    """FastAPI dependency for obtaining a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
