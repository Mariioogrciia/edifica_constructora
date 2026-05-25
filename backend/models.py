"""
models.py – Modelos ORM (SQLAlchemy) y esquemas Pydantic para Edifica Constructora.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String, Text
from sqlalchemy.sql import func

from database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AlertType(str, enum.Enum):
    NO_HARDHAT = "NO_HARDHAT"
    NO_VEST = "NO_VEST"
    RESTRICTED_ZONE = "RESTRICTED_ZONE"


# ---------------------------------------------------------------------------
# ORM Models (SQLAlchemy)
# ---------------------------------------------------------------------------

class AlertORM(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now())
    type = Column(Enum(AlertType), nullable=False)
    camera_id = Column(String, nullable=False, default="CAM-01")
    snapshot_path = Column(String, nullable=True)
    resolved = Column(Boolean, default=False)


class RestrictedZoneORM(Base):
    __tablename__ = "restricted_zones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    polygon_points = Column(Text, nullable=False)  # JSON string


# ---------------------------------------------------------------------------
# Pydantic Schemas (request / response)
# ---------------------------------------------------------------------------

class AlertCreate(BaseModel):
    type: AlertType
    camera_id: str = "CAM-01"
    snapshot_filename: Optional[str] = None


class AlertOut(BaseModel):
    id: int
    timestamp: datetime
    type: AlertType
    camera_id: str
    snapshot_path: Optional[str] = None
    resolved: bool

    model_config = {"from_attributes": True}


class AlertResolve(BaseModel):
    resolved: bool = True


class ZonePoint(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)


class ZoneCreate(BaseModel):
    name: str
    polygon_points: list[ZonePoint]


class ZoneOut(BaseModel):
    id: int
    name: str
    polygon_points: list[ZonePoint]

    model_config = {"from_attributes": True}
