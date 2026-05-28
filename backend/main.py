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
  GET  /api/employees        → Listar empleados
  POST /api/employees        → Crear empleado
  DELETE /api/employees/{id} → Eliminar empleado
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
    HTTPException,
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
    AlertORM,
    AlertOut,
    AlertResolve,
    AlertType,
    CameraOut,
    CameraZoneAssignmentORM,
    CameraZoneAssignmentOut,
    CameraMetadataORM,
    CameraMetadataOut,
    ConstructionZoneORM,
    EmployeeCreate,
    EmployeeORM,
    EmployeeOut,
    RestrictedZoneORM,
    ZoneCreate,
    ZoneOut,
    ZonePoint,
    ZoneUpdate,
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
    await _migrate_zones()
    await _initialize_camera_assignments()
    yield


async def _migrate_zones():
    """Copy legacy restricted zones into the richer construction zones table if needed."""
    async with async_session() as db:
        existing = await db.execute(select(func.count(ConstructionZoneORM.id)))
        new_count = existing.scalar() or 0
        if new_count > 0:
            return

        legacy = await db.execute(select(RestrictedZoneORM))
        legacy_rows = legacy.scalars().all()
        if not legacy_rows:
            return

        for row in legacy_rows:
            points = json.loads(row.polygon_points) if isinstance(row.polygon_points, str) else row.polygon_points
            db.add(
                ConstructionZoneORM(
                    name=row.name,
                    zone_type="Restringida",
                    camera_id=None,
                    polygon_points=json.dumps(points),
                )
            )
        await db.commit()


async def _initialize_camera_assignments():
    """Initialize camera to zone assignments from environment or defaults."""
    async with async_session() as db:
        zones = await db.execute(select(ConstructionZoneORM).order_by(ConstructionZoneORM.id))
        zone_list = zones.scalars().all()
        if not zone_list:
            return
        
        # Default camera IDs
        camera_ids = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05", "CAM-06", "CAM-07"]
        first_zone = zone_list[0]
        
        for cam_id in camera_ids:
            existing_assignment = await db.execute(
                select(CameraZoneAssignmentORM).where(CameraZoneAssignmentORM.camera_id == cam_id)
            )
            if existing_assignment.scalar_one_or_none():
                continue
            
            db.add(
                CameraZoneAssignmentORM(
                    camera_id=cam_id,
                    zone_id=first_zone.id,
                )
            )
        await db.commit()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Edifica Constructora – Backend de Seguridad",
    description="API Edge-First para gestión de alertas de seguridad laboral.",
    version="0.2.0",
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

# Servir videos locales para visualización en frontend
VIDEOS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos")
if os.path.exists(VIDEOS_DIR):
    app.mount("/videos", StaticFiles(directory=VIDEOS_DIR), name="videos")


# ---------------------------------------------------------------------------
# ENDPOINTS – Alertas y Análisis
# ---------------------------------------------------------------------------

active_detectors = {}

@app.post("/api/analyze/start")
async def start_analysis(camera_id: str = Query(...), video_url: str = Query(None)):
    """Inicia el detector bajo demanda para una cámara específica."""
    import subprocess
    import sys
    
    # Detener el detector previo si ya estaba corriendo para esta cámara
    if camera_id in active_detectors:
        active_detectors[camera_id].terminate()
    
    detector_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "detector", "main.py")
    
    source = "0"
    if video_url and "videos/" in video_url:
        filename = video_url.split("videos/")[-1]
        source = os.path.join(VIDEOS_DIR, filename)
        
    print(f"[INFO] Iniciando análisis automático para {camera_id} en {source}...")
    
    proc = subprocess.Popen(
        [sys.executable, detector_path, "--source", source, "--camera-id", camera_id, "--no-display", "--confidence", "0.25"]
    )
    active_detectors[camera_id] = proc
    
    return {"message": "Análisis iniciado.", "camera_id": camera_id}


@app.post("/api/analyze/stop")
async def stop_analysis(camera_id: str = Query(...)):
    """Detiene el detector de una cámara específica."""
    if camera_id in active_detectors:
        print(f"[INFO] Deteniendo análisis para {camera_id}...")
        proc = active_detectors.pop(camera_id)
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
        return {"message": "Análisis detenido.", "camera_id": camera_id}
    return {"message": "No había análisis activo.", "camera_id": camera_id}


@app.post("/api/alerts", response_model=AlertOut, status_code=201)
async def create_alert(
    alert_type: str = Query(..., alias="type", description="Tipo de alerta: NO_HARDHAT | NO_VEST | NO_MASK | RESTRICTED_ZONE"),
    camera_id: str = Query("CAM-01"),
    employee_id: Optional[int] = Query(None, description="ID del empleado asociado (opcional)"),
    track_id: Optional[int] = Query(None, description="ID de seguimiento del tracker de YOLO"),
    snapshot: Optional[UploadFile] = File(None),
    db=Depends(get_db),
):
    """Recibe una alerta del Detector, guarda el snapshot y notifica por WS. Deduplica por track_id."""
    # Deduplicación: si ya hay una alerta PENDIENTE para esta cámara, tipo y track_id, no creamos una nueva.
    if track_id is not None and track_id > 0:
        from sqlalchemy import select
        existing_stmt = select(AlertORM).where(
            AlertORM.type == alert_type,
            AlertORM.camera_id == camera_id,
            AlertORM.track_id == track_id,
            AlertORM.resolved == False
        )
        existing_result = await db.execute(existing_stmt)
        existing_alert = existing_result.scalar_one_or_none()
        
        if existing_alert:
            # Ya existe una alerta activa para esta persona. Omitimos crear una nueva.
            from fastapi.responses import JSONResponse
            from fastapi.encoders import jsonable_encoder
            return JSONResponse(status_code=200, content=jsonable_encoder(AlertOut.model_validate(existing_alert)))

    snapshot_filename = None
    if snapshot:
        ext = os.path.splitext(snapshot.filename)[1] if snapshot.filename else ".jpg"
        snapshot_filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(SNAPSHOT_DIR, snapshot_filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(snapshot.file, f)

    alert = AlertORM(
        type=alert_type,
        camera_id=camera_id,
        snapshot_path=f"/static/snapshots/{snapshot_filename}" if snapshot_filename else None,
        employee_id=employee_id,
        track_id=track_id,
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


@app.delete("/api/alerts/{alert_id}", status_code=204)
async def delete_alert(alert_id: int, db=Depends(get_db)):
    from sqlalchemy import delete as sql_delete
    result = await db.execute(select(AlertORM).where(AlertORM.id == alert_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    await db.execute(sql_delete(AlertORM).where(AlertORM.id == alert_id))
    await db.commit()


@app.delete("/api/alerts", status_code=204)
async def delete_alerts(resolved: Optional[bool] = Query(None), db=Depends(get_db)):
    from sqlalchemy import delete as sql_delete
    stmt = sql_delete(AlertORM)
    if resolved is not None:
      stmt = stmt.where(AlertORM.resolved == resolved)
    await db.execute(stmt)
    await db.commit()


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

    # Total de empleados
    employee_count = (await db.execute(select(func.count(EmployeeORM.id)))).scalar() or 0

    return {
        "total": total,
        "pending": pending,
        "resolved": resolved,
        "by_type": by_type,
        "employee_count": employee_count,
    }


# ---------------------------------------------------------------------------
# ENDPOINTS – Empleados
# ---------------------------------------------------------------------------

@app.get("/api/employees", response_model=list[EmployeeOut])
async def list_employees(db=Depends(get_db)):
    """Lista todos los empleados registrados."""
    result = await db.execute(select(EmployeeORM).order_by(desc(EmployeeORM.created_at)))
    return result.scalars().all()


@app.post("/api/employees", response_model=EmployeeOut, status_code=201)
async def create_employee(employee: EmployeeCreate, db=Depends(get_db)):
    """Registra un nuevo empleado."""
    # Comprobar que el código no esté duplicado
    existing = await db.execute(select(EmployeeORM).where(EmployeeORM.code == employee.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Ya existe un empleado con el código '{employee.code}'")

    orm = EmployeeORM(
        code=employee.code,
        name=employee.name,
        role=employee.role,
    )
    db.add(orm)
    await db.commit()
    await db.refresh(orm)
    return orm


@app.delete("/api/employees/{employee_id}", status_code=204)
async def delete_employee(employee_id: int, db=Depends(get_db)):
    """Elimina un empleado por su ID."""
    from sqlalchemy import delete as sql_delete
    result = await db.execute(select(EmployeeORM).where(EmployeeORM.id == employee_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    await db.execute(sql_delete(EmployeeORM).where(EmployeeORM.id == employee_id))
    await db.commit()


# ---------------------------------------------------------------------------
# ENDPOINTS – Cámaras y Asignaciones de Zona
# ---------------------------------------------------------------------------

@app.get("/api/cameras", response_model=list[CameraOut])
async def list_cameras(db=Depends(get_db)):
    """Lista todas las cámaras con su asignación de zona actual."""
    assignments = await db.execute(select(CameraZoneAssignmentORM))
    all_assignments = assignments.scalars().all()
    
    zones_result = await db.execute(select(ConstructionZoneORM))
    all_zones = {z.id: z.name for z in zones_result.scalars().all()}

    # cargar metadatos de cámara (videoUrl)
    meta_result = await db.execute(select(CameraMetadataORM))
    meta_list = meta_result.scalars().all()
    meta_map = {m.camera_id: m.video_url for m in meta_list}
    
    out = []
    for assignment in all_assignments:
        zone_name = all_zones.get(assignment.zone_id, "Pendiente")
        out.append(
            CameraOut(
                id=assignment.camera_id,
                name=assignment.camera_id,
                status="online",
                zone_id=assignment.zone_id,
                zone_name=zone_name,
                x=0.0,
                y=0.0,
                videoUrl=meta_map.get(assignment.camera_id),
            )
        )
    return out


@app.post("/api/cameras/{camera_id}/video", response_model=CameraOut)
async def set_camera_video(camera_id: str, body: dict, db=Depends(get_db)):
    """Asigna o actualiza el `videoUrl` persistente para una cámara."""
    video = body.get("videoUrl") or body.get("video_url")
    if not video:
        raise HTTPException(status_code=400, detail="videoUrl requerido en el body")

    # Upsert metadata
    result = await db.execute(select(CameraMetadataORM).where(CameraMetadataORM.camera_id == camera_id))
    meta = result.scalar_one_or_none()
    if meta:
        meta.video_url = video
    else:
        meta = CameraMetadataORM(camera_id=camera_id, video_url=video)
        db.add(meta)

    await db.commit()
    await db.refresh(meta)

    # devolver la info de cámara actualizada
    assignment_result = await db.execute(select(CameraZoneAssignmentORM).where(CameraZoneAssignmentORM.camera_id == camera_id))
    assignment = assignment_result.scalar_one_or_none()
    zone_id = assignment.zone_id if assignment else None
    zone_name = None
    if zone_id:
        z = (await db.execute(select(ConstructionZoneORM).where(ConstructionZoneORM.id == zone_id))).scalar_one_or_none()
        zone_name = z.name if z else None

    return CameraOut(
        id=camera_id,
        name=camera_id,
        status="online",
        zone_id=zone_id,
        zone_name=zone_name,
        x=0.0,
        y=0.0,
        videoUrl=meta.video_url,
    )


@app.get("/api/cameras/{camera_id}/zone", response_model=dict)
async def get_camera_zone(camera_id: str, db=Depends(get_db)):
    """Obtiene la zona asignada a una cámara."""
    result = await db.execute(
        select(CameraZoneAssignmentORM).where(CameraZoneAssignmentORM.camera_id == camera_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Cámara no asignada a ninguna zona")
    
    zone_result = await db.execute(
        select(ConstructionZoneORM).where(ConstructionZoneORM.id == assignment.zone_id)
    )
    zone = zone_result.scalar_one_or_none()
    
    return {
        "camera_id": assignment.camera_id,
        "zone_id": assignment.zone_id,
        "zone_name": zone.name if zone else "Pendiente",
    }


@app.post("/api/cameras/{camera_id}/zone", response_model=CameraZoneAssignmentOut)
async def assign_camera_to_zone(
    camera_id: str,
    body: dict,
    db=Depends(get_db)
):
    """Asigna (o reasigna) una cámara a una zona."""
    zone_id = body.get("zone_id")
    if not zone_id:
        raise HTTPException(status_code=400, detail="zone_id requerido")
    
    # Verificar que la zona existe
    zone_result = await db.execute(
        select(ConstructionZoneORM).where(ConstructionZoneORM.id == zone_id)
    )
    if not zone_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    
    # Buscar si ya existe una asignación
    assignment_result = await db.execute(
        select(CameraZoneAssignmentORM).where(CameraZoneAssignmentORM.camera_id == camera_id)
    )
    assignment = assignment_result.scalar_one_or_none()
    
    if assignment:
        # Actualizar la asignación existente
        assignment.zone_id = zone_id
    else:
        # Crear una nueva asignación
        assignment = CameraZoneAssignmentORM(
            camera_id=camera_id,
            zone_id=zone_id,
        )
        db.add(assignment)
    
    await db.commit()
    await db.refresh(assignment)
    return CameraZoneAssignmentOut(
        id=assignment.id,
        camera_id=assignment.camera_id,
        zone_id=assignment.zone_id,
    )


# ---------------------------------------------------------------------------
# ENDPOINTS – Zonas Restringidas
# ---------------------------------------------------------------------------

@app.get("/api/zones", response_model=list[ZoneOut])
async def list_zones(db=Depends(get_db)):
    result = await db.execute(select(ConstructionZoneORM).order_by(ConstructionZoneORM.id))
    zones = result.scalars().all()
    if not zones:
        legacy_result = await db.execute(select(RestrictedZoneORM).order_by(RestrictedZoneORM.id))
        zones = legacy_result.scalars().all()
    out = []
    for z in zones:
        points = json.loads(z.polygon_points) if isinstance(z.polygon_points, str) else z.polygon_points
        out.append(
            ZoneOut(
                id=cast(int, z.id),
                name=cast(str, z.name),
                zone_type=cast(str, getattr(z, "zone_type", "Restringida")),
                camera_id=cast(Optional[str], getattr(z, "camera_id", None)),
                polygon_points=[ZonePoint(**p) for p in points],
            )
        )
    return out


@app.post("/api/zones", response_model=ZoneOut, status_code=201)
async def create_zone(zone: ZoneCreate, db=Depends(get_db)):
    orm = ConstructionZoneORM(
        name=zone.name,
        zone_type=zone.zone_type,
        camera_id=zone.camera_id,
        polygon_points=json.dumps([p.model_dump() for p in zone.polygon_points]),
    )
    db.add(orm)
    await db.commit()
    await db.refresh(orm)
    return ZoneOut(
        id=cast(int, orm.id),
        name=cast(str, orm.name),
        zone_type=cast(str, orm.zone_type),
        camera_id=cast(Optional[str], orm.camera_id),
        polygon_points=zone.polygon_points,
    )


@app.patch("/api/zones/{zone_id}", response_model=ZoneOut)
async def update_zone(zone_id: int, body: ZoneUpdate, db=Depends(get_db)):
    result = await db.execute(select(ConstructionZoneORM).where(ConstructionZoneORM.id == zone_id))
    orm = result.scalar_one_or_none()
    if orm is None:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    payload = body.model_dump(exclude_unset=True)
    if "name" in payload:
        orm.name = payload["name"]
    if "zone_type" in payload:
        orm.zone_type = payload["zone_type"]
    if "camera_id" in payload:
        orm.camera_id = payload["camera_id"] or None
    if "polygon_points" in payload:
        points = payload["polygon_points"] or []
        orm.polygon_points = json.dumps([p.model_dump() if hasattr(p, "model_dump") else p for p in points])

    await db.commit()
    await db.refresh(orm)

    points = json.loads(orm.polygon_points) if isinstance(orm.polygon_points, str) else orm.polygon_points
    return ZoneOut(
        id=cast(int, orm.id),
        name=cast(str, orm.name),
        zone_type=cast(str, orm.zone_type),
        camera_id=cast(Optional[str], orm.camera_id),
        polygon_points=[ZonePoint(**p) for p in points],
    )


@app.delete("/api/zones/{zone_id}", status_code=204)
async def delete_zone(zone_id: int, db=Depends(get_db)):
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(ConstructionZoneORM).where(ConstructionZoneORM.id == zone_id))
    await db.execute(sql_delete(RestrictedZoneORM).where(RestrictedZoneORM.id == zone_id))
    await db.commit()


@app.post("/api/floorplan")
async def upload_floorplan(file: UploadFile = File(...)):
    """Sube un plano de planta personalizado."""
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
    os.makedirs(static_dir, exist_ok=True)
    
    file_path = os.path.join(static_dir, "custom_floor_plan.png")
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
        
    return {"message": "Plano subido correctamente", "path": "/static/custom_floor_plan.png"}


@app.get("/api/videos")
async def list_videos():
    """Lista los ficheros disponibles en la carpeta `videos/` para el frontend."""
    files = []
    if os.path.exists(VIDEOS_DIR):
        for fname in sorted(os.listdir(VIDEOS_DIR)):
            path = os.path.join(VIDEOS_DIR, fname)
            if os.path.isfile(path):
                files.append({"name": fname, "url": f"/videos/{fname}"})
    return files


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
