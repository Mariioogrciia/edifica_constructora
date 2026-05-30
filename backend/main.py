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
import subprocess
import uuid
import zlib
from urllib.parse import unquote, urlparse
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

from database import async_session, engine, get_db, init_db
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
    await _upgrade_schema()
    await _migrate_zones()
    await _initialize_camera_assignments()
    yield

async def _upgrade_schema():
    """Run basic schema upgrades for existing SQLite DBs."""
    from sqlalchemy import text
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE alerts ADD COLUMN confidence FLOAT;"))
    except Exception as e:
        # Expected if column already exists
        pass


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
_report_model = None


REPORT_CLASS_META = {
    "Hardhat": {"label": "Casco detectado", "status": "ok", "severity": "Correcto"},
    "Mask": {"label": "Mascarilla detectada", "status": "ok", "severity": "Correcto"},
    "Safety Vest": {"label": "Chaleco detectado", "status": "ok", "severity": "Correcto"},
    "NO-Hardhat": {"label": "Sin casco detectado", "status": "risk", "severity": "Alta"},
    "NO-Mask": {"label": "Sin mascarilla detectada", "status": "risk", "severity": "Media"},
    "NO-Safety Vest": {"label": "Sin chaleco detectado", "status": "risk", "severity": "Alta"},
    "Person": {"label": "Persona detectada", "status": "info", "severity": "Info"},
    "Safety Cone": {"label": "Cono de seguridad detectado", "status": "info", "severity": "Info"},
    "machinery": {"label": "Maquinaria detectada", "status": "info", "severity": "Info"},
    "vehicle": {"label": "Vehiculo detectado", "status": "info", "severity": "Info"},
}


def _format_video_time(seconds: float) -> str:
    total = max(0, int(seconds))
    minutes = total // 60
    secs = total % 60
    return f"{minutes:02d}:{secs:02d}"


def _crop_bbox(frame, bbox: list[float], padding_ratio: float = 0.18):
    import cv2

    if not bbox or len(bbox) != 4:
        return frame

    x1, y1, x2, y2 = map(int, bbox)
    h_img, w_img = frame.shape[:2]
    pad_w = int(max(8, (x2 - x1) * padding_ratio))
    pad_h = int(max(8, (y2 - y1) * padding_ratio))
    x1 = max(0, x1 - pad_w)
    y1 = max(0, y1 - pad_h)
    x2 = min(w_img, x2 + pad_w)
    y2 = min(h_img, y2 + pad_h)
    if x2 <= x1 or y2 <= y1:
        return frame
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return frame
    return crop


def _save_report_snapshot(frame, bbox: list[float]) -> str | None:
    import cv2

    try:
        crop = _crop_bbox(frame, bbox)
        filename = f"report_{uuid.uuid4().hex}.jpg"
        filepath = os.path.join(SNAPSHOT_DIR, filename)
        ok = cv2.imwrite(filepath, crop, [cv2.IMWRITE_JPEG_QUALITY, 86])
        return f"/static/snapshots/{filename}" if ok else None
    except Exception as exc:
        print(f"[WARN] Could not save report snapshot: {exc}")
        return None


def _get_report_model():
    global _report_model
    if _report_model is None:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(status_code=500, detail=f"Modelo no encontrado: {MODEL_PATH}")
        from ultralytics import YOLO
        _report_model = YOLO(MODEL_PATH)
    return _report_model


def _build_video_report(
    source: str,
    camera_id: str,
    confidence: float = 0.25,
    frame_stride: int = 15,
    bucket_seconds: int = 5,
    max_frames: int = 0,
    restricted_zone_name: Optional[str] = None,
):
    import cv2

    model = _get_report_model()
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise HTTPException(status_code=502, detail="No se pudo abrir la grabacion seleccionada.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)
    duration = float(total_frames / fps) if total_frames > 0 else 0.0
    frame_stride = max(1, int(frame_stride or 1))
    bucket_seconds = max(1, int(bucket_seconds or 5))

    frame_index = 0
    processed_frames = 0
    findings: dict[tuple[str, int | str], dict] = {}
    observations: list[dict] = []

    try:
        while True:
            if max_frames > 0 and frame_index >= max_frames:
                break

            ok, frame = cap.read()
            if not ok:
                break

            frame_index += 1
            if frame_index % frame_stride != 0:
                continue

            processed_frames += 1
            time_sec = float(frame_index) / fps
            results = model.track(frame, verbose=False, conf=confidence, persist=True)

            for result in results:
                for box in result.boxes:
                    cls_id = int(box.cls.item())
                    class_name = str(model.names.get(cls_id, cls_id))
                    conf = float(box.conf.item())
                    bbox = box.xyxy[0].cpu().numpy().tolist()
                    x1, y1, x2, y2 = bbox
                    track_id = int(box.id.item()) if box.id is not None else 0
                    if track_id <= 0:
                        center_key = f"{int(((x1 + x2) / 2) // 80)}-{int(((y1 + y2) / 2) // 80)}"
                        dedupe_id: int | str = f"sin-track-{cls_id}-{center_key}"
                    else:
                        dedupe_id = track_id

                    meta = REPORT_CLASS_META.get(class_name, {
                        "label": class_name,
                        "status": "info",
                        "severity": "Info",
                    })
                    if len(observations) < 1200:
                        observations.append({
                            "time_sec": round(time_sec, 2),
                            "time_label": _format_video_time(time_sec),
                            "class_name": class_name,
                            "label": meta["label"],
                            "status": meta["status"],
                            "confidence": round(conf, 3),
                            "track_id": track_id if track_id > 0 else None,
                            "bbox": {
                                "x": round(max(0.0, min(1.0, x1 / frame_w)), 4),
                                "y": round(max(0.0, min(1.0, y1 / frame_h)), 4),
                                "w": round(max(0.0, min(1.0, (x2 - x1) / frame_w)), 4),
                                "h": round(max(0.0, min(1.0, (y2 - y1) / frame_h)), 4),
                            },
                        })

                    key = (class_name, dedupe_id)
                    finding = findings.setdefault(key, {
                        "id": f"{class_name}-{dedupe_id}",
                        "track_id": track_id if track_id > 0 else None,
                        "first_seen_sec": round(time_sec, 2),
                        "first_seen_label": _format_video_time(time_sec),
                        "last_seen_sec": round(time_sec, 2),
                        "last_seen_label": _format_video_time(time_sec),
                        "duration_sec": 0,
                        "duration_label": "00:00",
                        "class_name": class_name,
                        "label": meta["label"],
                        "status": meta["status"],
                        "severity": meta["severity"],
                        "confirmations": 0,
                        "max_confidence": 0.0,
                        "snapshot_path": None,
                    })
                    finding["confirmations"] += 1
                    finding["last_seen_sec"] = round(time_sec, 2)
                    finding["last_seen_label"] = _format_video_time(time_sec)
                    duration_seen = max(0.0, finding["last_seen_sec"] - finding["first_seen_sec"])
                    finding["duration_sec"] = round(duration_seen, 2)
                    finding["duration_label"] = _format_video_time(duration_seen)

                    if conf > finding["max_confidence"]:
                        finding["max_confidence"] = round(conf, 3)
                        finding["snapshot_path"] = _save_report_snapshot(frame, bbox)

                    if restricted_zone_name and class_name == "Person":
                        restricted_meta = {
                            "label": f"Persona en zona restringida: {restricted_zone_name}",
                            "status": "risk",
                            "severity": "Alta",
                        }
                        restricted_key = ("RESTRICTED_ZONE", dedupe_id)
                        if len(observations) < 1200:
                            observations.append({
                                "time_sec": round(time_sec, 2),
                                "time_label": _format_video_time(time_sec),
                                "class_name": "RESTRICTED_ZONE",
                                "label": restricted_meta["label"],
                                "status": "risk",
                                "confidence": round(conf, 3),
                                "track_id": track_id if track_id > 0 else None,
                                "bbox": {
                                    "x": round(max(0.0, min(1.0, x1 / frame_w)), 4),
                                    "y": round(max(0.0, min(1.0, y1 / frame_h)), 4),
                                    "w": round(max(0.0, min(1.0, (x2 - x1) / frame_w)), 4),
                                    "h": round(max(0.0, min(1.0, (y2 - y1) / frame_h)), 4),
                                },
                            })
                        restricted_finding = findings.setdefault(restricted_key, {
                            "id": f"RESTRICTED_ZONE-{dedupe_id}",
                            "track_id": track_id if track_id > 0 else None,
                            "first_seen_sec": round(time_sec, 2),
                            "first_seen_label": _format_video_time(time_sec),
                            "last_seen_sec": round(time_sec, 2),
                            "last_seen_label": _format_video_time(time_sec),
                            "duration_sec": 0,
                            "duration_label": "00:00",
                            "class_name": "RESTRICTED_ZONE",
                            "label": restricted_meta["label"],
                            "status": "risk",
                            "severity": "Alta",
                            "confirmations": 0,
                            "max_confidence": 0.0,
                            "snapshot_path": None,
                        })
                        restricted_finding["confirmations"] += 1
                        restricted_finding["last_seen_sec"] = round(time_sec, 2)
                        restricted_finding["last_seen_label"] = _format_video_time(time_sec)
                        restricted_duration = max(0.0, restricted_finding["last_seen_sec"] - restricted_finding["first_seen_sec"])
                        restricted_finding["duration_sec"] = round(restricted_duration, 2)
                        restricted_finding["duration_label"] = _format_video_time(restricted_duration)
                        if conf > restricted_finding["max_confidence"]:
                            restricted_finding["max_confidence"] = round(conf, 3)
                            restricted_finding["snapshot_path"] = _save_report_snapshot(frame, bbox)
    finally:
        cap.release()

    timeline = sorted(
        findings.values(),
        key=lambda item: (item["first_seen_sec"], 0 if item["status"] == "risk" else 1, item["class_name"]),
    )
    class_counts: dict[str, int] = {}
    status_counts = {"risk": 0, "ok": 0, "info": 0}
    for item in timeline:
        class_counts[item["class_name"]] = class_counts.get(item["class_name"], 0) + 1
        status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1

    no_hardhat = class_counts.get("NO-Hardhat", 0)
    no_vest = class_counts.get("NO-Safety Vest", 0)
    no_mask = class_counts.get("NO-Mask", 0)
    restricted_people = class_counts.get("RESTRICTED_ZONE", 0)
    risk_parts = []
    if no_hardhat:
        risk_parts.append(f"{no_hardhat} trabajador{'es' if no_hardhat != 1 else ''} sin casco")
    if no_vest:
        risk_parts.append(f"{no_vest} trabajador{'es' if no_vest != 1 else ''} sin chaleco")
    if no_mask:
        risk_parts.append(f"{no_mask} trabajador{'es' if no_mask != 1 else ''} sin mascarilla")
    if restricted_people:
        risk_parts.append(f"{restricted_people} persona{'s' if restricted_people != 1 else ''} en zona restringida")
    smart_summary = (
        f"Analisis completado. Se detectaron {', '.join(risk_parts)} en {camera_id}."
        if risk_parts
        else f"Analisis completado. No se detectaron infracciones EPI relevantes en {camera_id}."
    )

    return {
        "camera_id": camera_id,
        "source": source,
        "duration_sec": round(duration, 2),
        "duration_label": _format_video_time(duration),
        "fps": round(float(fps), 2),
        "total_frames": total_frames,
        "processed_frames": processed_frames,
        "frame_stride": frame_stride,
        "bucket_seconds": bucket_seconds,
        "summary": {
            "total_events": len(timeline),
            "detections": sum(item["confirmations"] for item in timeline),
            "unique_findings": len(timeline),
            "unique_risks": status_counts.get("risk", 0),
            "unique_ok": status_counts.get("ok", 0),
            "unique_info": status_counts.get("info", 0),
            "classes": class_counts,
            "status": status_counts,
            "smart_summary": smart_summary,
        },
        "timeline": timeline,
        "observations": observations,
    }


REPORT_ALERT_TYPES = {
    "NO-Hardhat": "NO_HARDHAT",
    "NO-Safety Vest": "NO_VEST",
    "NO-Mask": "NO_MASK",
    "RESTRICTED_ZONE": "RESTRICTED_ZONE",
}

RESTRICTED_CAMERA_FALLBACKS = {
    "CAM-01": "Zona de Riesgo: Maquinaria Pesada",
}


async def _persist_report_alerts(report: dict, camera_id: str, db) -> int:
    """Persist unique risk findings from a batch report into SQLite alerts."""
    created = 0
    for finding in report.get("timeline", []):
        if finding.get("status") != "risk":
            continue

        alert_type = REPORT_ALERT_TYPES.get(finding.get("class_name"))
        if not alert_type:
            continue

        track_id = finding.get("track_id")
        if track_id is None:
            stable_key = f"{camera_id}:{finding.get('id')}"
            track_id = zlib.crc32(stable_key.encode("utf-8")) % 1_000_000_000

        existing_stmt = select(AlertORM).where(
            AlertORM.type == alert_type,
            AlertORM.camera_id == camera_id,
            AlertORM.track_id == int(track_id),
        )
        existing_result = await db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            continue

        db.add(AlertORM(
            type=alert_type,
            camera_id=camera_id,
            snapshot_path=finding.get("snapshot_path"),
            track_id=int(track_id),
            confidence=finding.get("max_confidence"),
            resolved=False,
        ))
        created += 1

    if created:
        await db.commit()
    return created


async def _restricted_zone_name_for_camera(camera_id: str, db) -> Optional[str]:
    explicit_zone = await db.execute(
        select(ConstructionZoneORM).where(
            ConstructionZoneORM.camera_id == camera_id,
            func.lower(ConstructionZoneORM.zone_type) == "restringida",
        )
    )
    zone = explicit_zone.scalar_one_or_none()
    if zone:
        return cast(str, zone.name)

    return RESTRICTED_CAMERA_FALLBACKS.get(camera_id)

MODEL_PATH = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "edifica_detector.pt")
)
def _resolve_video_source(video_url: Optional[str]) -> str:
    """Resolve a frontend /videos URL to a local video file."""
    if not video_url:
        return "0"

    parsed = urlparse(video_url)
    path = parsed.path or video_url
    if "/videos/" not in path:
        return video_url

    filename = unquote(path.split("/videos/", 1)[-1])
    candidate = os.path.abspath(os.path.join(VIDEOS_DIR, filename))
    videos_root = os.path.abspath(VIDEOS_DIR)
    if os.path.commonpath([videos_root, candidate]) != videos_root:
        raise HTTPException(status_code=400, detail="Ruta de video no permitida")
    if not os.path.exists(candidate):
        raise HTTPException(status_code=404, detail=f"Video no encontrado: {filename}")
    return candidate


async def _watch_detector(camera_id: str, proc):
    """Remove finished detector processes from the active registry."""
    await asyncio.to_thread(proc.wait)
    if active_detectors.get(camera_id) is proc:
        active_detectors.pop(camera_id, None)

@app.post("/api/analyze/start")
async def start_analysis(camera_id: str = Query(...), video_url: str = Query(None)):
    """Inicia el detector bajo demanda para una cámara específica."""
    import subprocess
    import sys
    
    # Detener el detector previo si ya estaba corriendo para esta cámara
    if camera_id in active_detectors:
        active_detectors[camera_id].terminate()
    
    detector_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "detector", "main.py")
    
    if not os.path.exists(MODEL_PATH):
        raise HTTPException(status_code=500, detail=f"Modelo no encontrado: {MODEL_PATH}")

    source = _resolve_video_source(video_url)
        
    print(f"[INFO] Iniciando análisis automático para {camera_id} en {source}...")
    
    detector_cmd = [
        sys.executable,
        detector_path,
        "--source",
        source,
        "--model",
        MODEL_PATH,
        "--camera-id",
        camera_id,
        "--no-display",
        "--confidence",
        "0.25",
        "--frame-stride",
        "1",
    ]

    proc = subprocess.Popen(detector_cmd)
    active_detectors[camera_id] = proc
    asyncio.create_task(_watch_detector(camera_id, proc))

    await asyncio.sleep(8)
    if proc.poll() is not None:
        active_detectors.pop(camera_id, None)
        raise HTTPException(status_code=502, detail="El detector no pudo abrir la grabacion seleccionada.")
    
    return {"message": "Análisis iniciado.", "camera_id": camera_id}



@app.post("/api/analyze/report")
async def analyze_recording_report(
    camera_id: str = Query(...),
    video_url: str = Query(...),
    confidence: float = Query(0.25, ge=0.05, le=0.95),
    frame_stride: int = Query(15, ge=1, le=120),
    bucket_seconds: int = Query(5, ge=1, le=60),
    db=Depends(get_db),
):
    """Analiza una grabacion completa y devuelve un reporte temporal de detecciones."""
    source = _resolve_video_source(video_url)
    restricted_zone_name = await _restricted_zone_name_for_camera(camera_id, db)
    report = await asyncio.to_thread(
        _build_video_report,
        source,
        camera_id,
        confidence,
        frame_stride,
        bucket_seconds,
        0,
        restricted_zone_name,
    )
    persisted = await _persist_report_alerts(report, camera_id, db)
    report["summary"]["persisted_alerts"] = persisted
    return report
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
    confidence: Optional[float] = Query(None, description="Confianza del modelo (0.0 a 1.0)"),
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
        confidence=confidence,
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
