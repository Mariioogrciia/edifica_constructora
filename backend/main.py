"""
main.py – Aplicación FastAPI para Edifica Constructora.

Endpoints:
  POST /api/alerts          → Crear alerta (desde el Detector)
  GET  /api/alerts           → Listar alertas paginadas
  PATCH /api/alerts/{id}     → Resolver/marcar una alerta
  WS   /api/alerts/ws        → WebSocket para push de alertas en tiempo real
  GET  /api/zones            → Listar zonas restringidas
  POST /api/zones            → Crear zona restringida
  DELETE /api/zones/{id}     → Eliminar zona restringida
  GET  /api/stats            → Estadísticas agregadas para el dashboard
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, cast

from fastapi import (
    Depends,
    FastAPI,
    File,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, func, select, update

from database import async_session, get_db, init_db
from models import (
    AlertCreate,
    AlertORM,
    AlertOut,
    AlertResolve,
    AlertType,
    RestrictedZoneORM,
    ZoneCreate,
    ZoneOut,
    ZonePoint,
)

# ---------------------------------------------------------------------------
# Directorio estático para snapshots
# ---------------------------------------------------------------------------
SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    """Gestiona las conexiones WebSocket activas del frontend."""

    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                self.active.remove(ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Edifica Constructora – Backend de Seguridad",
    description="API Edge-First para gestión de alertas de seguridad laboral.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir imágenes de snapshots
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")), name="static")


# ---------------------------------------------------------------------------
# ENDPOINTS – Alertas
# ---------------------------------------------------------------------------

@app.post("/api/alerts", response_model=AlertOut, status_code=201)
async def create_alert(
    alert_type: str = Query(..., alias="type", description="Tipo de alerta: NO_HARDHAT | NO_VEST | RESTRICTED_ZONE"),
    camera_id: str = Query("CAM-01"),
    snapshot: Optional[UploadFile] = File(None),
    db=Depends(get_db),
):
    """Recibe una alerta del Detector, guarda el snapshot y notifica por WS."""
    snapshot_filename = None
    if snapshot:
        ext = os.path.splitext(snapshot.filename)[1] if snapshot.filename else ".jpg"
        snapshot_filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(SNAPSHOT_DIR, snapshot_filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(snapshot.file, f)

    alert = AlertORM(
        type=AlertType(alert_type),
        camera_id=camera_id,
        snapshot_path=f"/static/snapshots/{snapshot_filename}" if snapshot_filename else None,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    # Broadcast por WebSocket
    alert_data = AlertOut.model_validate(alert).model_dump(mode="json")
    await manager.broadcast(alert_data)

    return alert


@app.get("/api/alerts", response_model=list[AlertOut])
async def list_alerts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    resolved: Optional[bool] = None,
    db=Depends(get_db),
):
    """Lista alertas paginadas, opcionalmente filtradas por estado."""
    stmt = select(AlertORM).order_by(desc(AlertORM.timestamp))
    if resolved is not None:
        stmt = stmt.where(AlertORM.resolved == resolved)
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@app.patch("/api/alerts/{alert_id}", response_model=AlertOut)
async def resolve_alert(alert_id: int, body: AlertResolve, db=Depends(get_db)):
    """Marca una alerta como resuelta o no resuelta."""
    stmt = update(AlertORM).where(AlertORM.id == alert_id).values(resolved=body.resolved)
    await db.execute(stmt)
    await db.commit()
    result = await db.execute(select(AlertORM).where(AlertORM.id == alert_id))
    alert = result.scalar_one()

    alert_data = AlertOut.model_validate(alert).model_dump(mode="json")
    await manager.broadcast({"event": "alert_updated", **alert_data})

    return alert


@app.get("/api/stats")
async def get_stats(db=Depends(get_db)):
    """Estadísticas agregadas para el dashboard."""
    total = (await db.execute(select(func.count(AlertORM.id)))).scalar() or 0
    pending = (await db.execute(
        select(func.count(AlertORM.id)).where(AlertORM.resolved == False)
    )).scalar() or 0
    resolved = total - pending

    # Conteo por tipo
    by_type = {}
    for t in AlertType:
        count = (await db.execute(
            select(func.count(AlertORM.id)).where(AlertORM.type == t)
        )).scalar() or 0
        by_type[t.value] = count

    return {
        "total": total,
        "pending": pending,
        "resolved": resolved,
        "by_type": by_type,
    }


# ---------------------------------------------------------------------------
# ENDPOINTS – Zonas Restringidas
# ---------------------------------------------------------------------------

@app.get("/api/zones", response_model=list[ZoneOut])
async def list_zones(db=Depends(get_db)):
    result = await db.execute(select(RestrictedZoneORM))
    zones = result.scalars().all()
    out = []
    for z in zones:
        points = json.loads(z.polygon_points) if isinstance(z.polygon_points, str) else z.polygon_points
        out.append(ZoneOut(id=cast(int, z.id), name=cast(str, z.name), polygon_points=[ZonePoint(**p) for p in points]))
    return out


@app.post("/api/zones", response_model=ZoneOut, status_code=201)
async def create_zone(zone: ZoneCreate, db=Depends(get_db)):
    orm = RestrictedZoneORM(
        name=zone.name,
        polygon_points=json.dumps([p.model_dump() for p in zone.polygon_points]),
    )
    db.add(orm)
    await db.commit()
    await db.refresh(orm)
    return ZoneOut(id=cast(int, orm.id), name=cast(str, orm.name), polygon_points=zone.polygon_points)


@app.delete("/api/zones/{zone_id}", status_code=204)
async def delete_zone(zone_id: int, db=Depends(get_db)):
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(RestrictedZoneORM).where(RestrictedZoneORM.id == zone_id))
    await db.commit()


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/api/alerts/ws")
async def websocket_alerts(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # Mantenemos la conexión viva; el cliente puede enviar pings
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
