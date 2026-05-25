# Edifica Constructora – Sistema de Seguridad Laboral 🏗️

**Detección automática de incumplimientos de EPIs y zonas restringidas** para entornos de construcción, bajo un paradigma **Edge-First / Local-First**.

---

## 📐 Arquitectura

```
┌──────────────┐     HTTP POST     ┌──────────────┐    WebSocket    ┌──────────────┐
│   Detector   │ ────────────────▸ │   Backend    │ ◂───────────── │   Frontend   │
│  (YOLO + CV) │   + snapshot     │  (FastAPI)   │    REST API    │  (React/Vite)│
│              │                  │  + SQLite    │                │  Dashboard   │
└──────────────┘                  └──────────────┘                └──────────────┘
   ▲ Vídeo                           ▲ DB local
   │                                 │ edifica.db
 Webcam / Fichero / RTSP
```

## 🚀 Puesta en Marcha (Desarrollo Local)

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
> Documentación API automática: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
> Dashboard disponible en: [http://localhost:5173](http://localhost:5173)

### 3. Detector
```bash
cd detector
pip install -r requirements.txt

# Con fichero de vídeo
python main.py --source test_video.mp4

# Con webcam
python main.py --source 0

# Con cámara RTSP
python main.py --source "rtsp://user:pass@ip:port/stream"
```

## 🗄️ Base de Datos

SQLite (`edifica.db`) — 100% offline, sin servidor externo.

| Tabla | Campos principales |
|-------|-------------------|
| `alerts` | id, timestamp, type, camera_id, snapshot_path, resolved |
| `restricted_zones` | id, name, polygon_points (JSON) |

## 📡 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/alerts` | Crear alerta (desde Detector) |
| `GET` | `/api/alerts` | Listar alertas paginadas |
| `PATCH` | `/api/alerts/{id}` | Resolver/reabrir alerta |
| `GET` | `/api/stats` | Estadísticas del dashboard |
| `WS` | `/api/alerts/ws` | WebSocket tiempo real |
| `GET` | `/api/zones` | Listar zonas restringidas |
| `POST` | `/api/zones` | Crear zona restringida |
| `DELETE` | `/api/zones/{id}` | Eliminar zona |

## 🧠 Lógica de Negocio

- **Persistencia Temporal:** Las infracciones deben persistir durante un umbral configurable (2s EPI, 1s zona) antes de generar una alerta real.
- **Cooldown:** 30 segundos entre alertas del mismo tipo y persona para evitar spam.
- **Zonas Restringidas:** Evaluación geométrica con `cv2.pointPolygonTest` sobre polígonos normalizados.

## 📋 Tipos de Alerta

| Tipo | Descripción |
|------|-------------|
| `NO_HARDHAT` | Trabajador sin casco de seguridad |
| `NO_VEST` | Trabajador sin chaleco reflectante |
| `RESTRICTED_ZONE` | Persona detectada en zona restringida |