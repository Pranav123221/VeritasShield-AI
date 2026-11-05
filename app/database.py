import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

class Base(DeclarativeBase):
    pass

def _url():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured.")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url

_engine = None
_factory = None

def get_engine():
    global _engine, _factory
    if _engine is None:
        _engine = create_engine(_url(), pool_pre_ping=True, pool_recycle=300,
                                connect_args={"sslmode": os.getenv("DB_SSLMODE", "require")})
        _factory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine

def get_session_factory():
    get_engine()
    return _factory

def init_database():
    from app import models  # register metadata
    Base.metadata.create_all(bind=get_engine())
