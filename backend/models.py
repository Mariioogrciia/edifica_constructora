"""
models.py – Modelos ORM (SQLAlchemy) y esquemas Pydantic para Edifica Constructora.

Clases del modelo YOLO entrenado (Construction Site Safety – Roboflow):
  0: Hardhat          1: Mask             2: NO-Hardhat
  3: NO-Mask          4: NO-Safety Vest   5: Person
  6: Safety Cone      7: Safety Vest      8: machinery
  9: vehicle
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, Float
from sqlalchemy.sql import func
import os

from database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AlertType(str, enum.Enum):
    """Tipos de alerta mapeados a las clases de infracción del modelo YOLO."""
    NO_HARDHAT = "NO_HARDHAT"           # Clase 2: NO-Hardhat
    NO_VEST = "NO_VEST"                 # Clase 4: NO-Safety Vest
    NO_MASK = "NO_MASK"                 # Clase 3: NO-Mask
    RESTRICTED_ZONE = "RESTRICTED_ZONE" # Regla geométrica (polígono)


# ---------------------------------------------------------------------------
# ORM Models (SQLAlchemy)
# ---------------------------------------------------------------------------

class EmployeeORM(Base):
    """Tabla de empleados / trabajadores de la obra."""
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Operario")
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now())


class AlertORM(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now())
    type = Column(Enum(AlertType), nullable=False)
    camera_id = Column(String, nullable=False, default="CAM-01")
    snapshot_path = Column(String, nullable=True)
    resolved = Column(Boolean, default=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    track_id = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=True)


class RestrictedZoneORM(Base):
    __tablename__ = "restricted_zones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    polygon_points = Column(Text, nullable=False)  # JSON string


class ConstructionZoneORM(Base):
    __tablename__ = "construction_zones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    zone_type = Column(String, nullable=False, default="Restringida")
    camera_id = Column(String, nullable=True)
    polygon_points = Column(Text, nullable=False)  # JSON string


class CameraZoneAssignmentORM(Base):
    """Tabla que vincula cámaras a zonas de forma persistente."""
    __tablename__ = "camera_zone_assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(String, nullable=False, unique=True, index=True)
    zone_id = Column(Integer, ForeignKey("construction_zones.id"), nullable=False)


class CameraMetadataORM(Base):
    """Metadatos por cámara: fichero de vídeo asociado y otros datos ligeros."""
    __tablename__ = "camera_metadata"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    camera_id = Column(String, nullable=False, unique=True, index=True)
    video_url = Column(String, nullable=True)


# ---------------------------------------------------------------------------
# Pydantic Schemas (request / response)
# ---------------------------------------------------------------------------

# ── Employees ──

class EmployeeCreate(BaseModel):
    code: str
    name: str
    role: str = "Operario"

class EmployeeOut(BaseModel):
    id: int
    code: str
    name: str
    role: str
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Alerts ──

class AlertCreate(BaseModel):
    type: AlertType
    camera_id: str = "CAM-01"
    snapshot_filename: Optional[str] = None
    employee_id: Optional[int] = None
    confidence: Optional[float] = None


class AlertOut(BaseModel):
    id: int
    timestamp: datetime
    type: str
    camera_id: str
    snapshot_path: Optional[str] = None
    resolved: bool
    employee_id: Optional[int] = None
    track_id: Optional[int] = None
    confidence: Optional[float] = None

    model_config = {"from_attributes": True}


class AlertResolve(BaseModel):
    resolved: bool = True


# ── Zones ──

class ZonePoint(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)


class ZoneCreate(BaseModel):
    name: str
    zone_type: str = "Restringida"
    camera_id: Optional[str] = None
    polygon_points: list[ZonePoint]


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[str] = None
    camera_id: Optional[str] = None
    polygon_points: Optional[list[ZonePoint]] = None


class ZoneOut(BaseModel):
    id: int
    name: str
    zone_type: str = "Restringida"
    camera_id: Optional[str] = None
    polygon_points: list[ZonePoint]

    model_config = {"from_attributes": True}


# ── Cameras ──

class CameraOut(BaseModel):
    """Datos públicos de una cámara con su zona asignada."""
    id: str
    name: str
    status: str = "online"
    zone_id: Optional[int] = None
    zone_name: Optional[str] = None
    x: float = 0.0
    y: float = 0.0
    videoUrl: Optional[str] = None

    model_config = {"from_attributes": True}


class CameraZoneAssignmentOut(BaseModel):
    """Asignación de cámara a zona."""
    id: int
    camera_id: str
    zone_id: int

    model_config = {"from_attributes": True}


class CameraMetadataCreate(BaseModel):
    videoUrl: str


class CameraMetadataOut(BaseModel):
    id: int
    camera_id: str
    videoUrl: Optional[str] = None

    model_config = {"from_attributes": True}
