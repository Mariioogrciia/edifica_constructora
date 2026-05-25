"""
database.py – Configuración SQLite + SQLAlchemy (async) para Edifica Constructora.

Usa un fichero local `edifica.db` sin necesidad de servidor externo (offline-first).
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(DATABASE_DIR, 'edifica.db')}"

engine = create_async_engine(DATABASE_URL, echo=False)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Clase base declarativa para todos los modelos ORM."""
    pass


async def init_db():
    """Crea las tablas en la base de datos si no existen."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Dependency de FastAPI para obtener una sesión de base de datos."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
