# Arquitectura Edge-First para Edifica Constructora

El objetivo de este proyecto es simular un sistema de detección automática de incumplimientos de seguridad laboral (EPIs y zonas restringidas) para entornos con conectividad nula o limitada, diseñado bajo un paradigma **Edge-First / Local-First**. 

La solución está pensada para ejecutarse íntegramente en local durante la fase de demo académica, pero arquitectónicamente justificada para ser desplegada en producción sobre hardware tipo **NVIDIA Jetson Orin Nano**.

## User Review Required

> [!IMPORTANT]
> **Revisión de Arquitectura:** Por favor revisa la división de componentes y el flujo de datos. Si estás de acuerdo con la propuesta, procederé a generar el andamiaje del proyecto y el código base.

## Open Questions

> [!WARNING]
> **Streaming de Vídeo en el Frontend:** Para la demo, el detector procesará el vídeo. ¿Deseas que el frontend muestre el vídeo en vivo (requiere más complejidad de streaming, p.ej. enviar fotogramas JPEG por WebSocket/HTTP) o prefieres que el frontend sea un panel de mandos (Dashboard) que solo muestre las alertas y las imágenes estáticas (snapshots) del momento en que ocurrió la infracción? Para un MVP, los snapshots suelen ser más sencillos y estables.
> 
> **Framework de Frontend:** ¿Prefieres React estándar con Vite o Next.js? Vite suele ser más ligero para una SPA local que no necesita SEO.

---

## 1. Arquitectura de la Solución

El sistema se divide en tres componentes débilmente acoplados, ejecutándose todos en la máquina local o dispositivo edge.

### A. Detector Local (Video Analytics Engine)
* **Tecnología:** Python, OpenCV, Ultralytics (YOLOv8/v11), DeepSORT/ByteTrack (opcional para tracking simple).
* **Responsabilidad:** Conectarse a la fuente de vídeo (RTSP, webcam o archivo), ejecutar la inferencia frame a frame, aplicar lógica de persistencia temporal (evitar falsos positivos) y generar *snapshots* y eventos hacia el backend.
* **Flujo:** Cuando detecta una infracción persistente, guarda una imagen en disco y hace un HTTP POST al Backend local.

### B. Backend Local (API & Data Hub)
* **Tecnología:** Python, FastAPI, SQLite, Uvicorn.
* **Responsabilidad:** Exponer endpoints REST, guardar alertas y zonas restringidas en la base de datos SQLite, servir los *snapshots* guardados en disco estático, y proveer WebSockets para notificar al Frontend en tiempo real.

### C. Frontend Local (Dashboard de Seguridad)
* **Tecnología:** React (Vite) o Next.js, Vanilla CSS (estética premium y responsiva, modo oscuro por defecto para entornos de control).
* **Responsabilidad:** Mostrar un panel de control con indicadores de estado, lista de alertas en tiempo real, histórico de incidentes con su evidencia (snapshot), y una interfaz para definir/dibujar el polígono de las "Zonas Restringidas" sobre un *frame* de calibración.

---

## 2. Estructura de Carpetas del Proyecto

```text
edifica_constructora/
├── detector/                 # Motor de inferencia de vídeo
│   ├── main.py               # Bucle principal de captura y procesado
│   ├── model/                # Pesos descargados de YOLO (pt/onnx)
│   ├── logic/                # Reglas de negocio y persistencia temporal
│   └── requirements.txt      
├── backend/                  # API y base de datos
│   ├── main.py               # App FastAPI y endpoints
│   ├── database.py           # Configuración SQLite y SQLAlchemy
│   ├── models.py             # Esquemas de base de datos
│   ├── static/               # Carpeta local para almacenar snapshots de alertas
│   └── requirements.txt
├── frontend/                 # Interfaz de usuario
│   ├── src/
│   │   ├── components/       # Componentes visuales (AlertCard, Dashboard, etc.)
│   │   ├── pages/            # Vistas principales
│   │   └── App.jsx
│   └── package.json
└── README.md
```

---

## 3. Modelo de Base de Datos (SQLite)

Para mantener la simplicidad y ser 100% offline-first, usaremos **SQLite**, que guarda todo en un fichero local (`edifica.db`) sin requerir un servidor de BBDD.

**Tablas principales:**
1. `alerts`
   - `id`: UUID o Integer
   - `timestamp`: DateTime
   - `type`: Enum (`NO_HARDHAT`, `NO_VEST`, `RESTRICTED_ZONE`)
   - `camera_id`: String (identificador de la cámara)
   - `snapshot_path`: String (ruta local al archivo de imagen en el backend)
   - `resolved`: Boolean

2. `restricted_zones`
   - `id`: Integer
   - `name`: String
   - `polygon_points`: JSON (Ej: `[{"x": 0.1, "y": 0.2}, {"x": 0.5, "y": 0.2}, ...]`) coordenadas normalizadas respecto al tamaño de la imagen.

---

## 4. Lógica de Reglas de Negocio (Persistencia Temporal)

El problema de lanzar alertas por un solo frame se soluciona introduciendo un **Buffer de Estado (Time-to-Alert)** por cada tipo de infracción y persona detectada.

**Regla de Casco / Chaleco:**
1. YOLO detecta `Person`, `Hardhat`, `NO-Hardhat`, `Safety Vest`, `NO-Safety Vest`.
2. Para cada frame, verificamos si dentro del bounding box de una `Person` hay intersección con la clase `NO-Hardhat` o `NO-Safety Vest` (o si simplemente la red ya detecta `NO-Hardhat` de forma independiente y aislada).
3. Si ocurre la infracción, se incrementa un contador o se añade un timestamp a un buffer para ese evento.
4. Si el evento persiste durante, por ejemplo, **2 segundos consecutivos (o el equivalente en frames)**, se dispara el evento `POST /api/alerts`.
5. Se aplica un *cooldown* temporal (ej: 30 segundos) para no bombardear la BBDD con alertas del mismo trabajador infractor parado frente a la cámara.

**Regla de Zona Restringida:**
1. Al arrancar, el Detector consulta `GET /api/zones` para obtener los polígonos.
2. Usando OpenCV (`cv2.pointPolygonTest`), se evalúa si el centro de gravedad del Bounding Box de la clase `Person` está dentro de algún polígono.
3. Se aplica la misma lógica de persistencia temporal (ej: 1 segundo dentro) antes de emitir alerta.

---

## 5. Endpoints del Backend Local

* **POST /api/alerts:** Recibe JSON del Detector (con base64 de la imagen o multipart para guardarla en disco).
* **GET /api/alerts:** Lista las últimas alertas paginadas (usado por frontend).
* **GET /api/alerts/ws:** WebSocket para notificar al frontend en vivo cuando llega un POST.
* **GET /api/zones:** Devuelve las zonas restringidas configuradas.
* **POST /api/zones:** Guarda un nuevo array de polígonos (idealmente configurado desde el Frontend).
* **GET /static/snapshots/{filename}:** Servidor estático para cargar las imágenes de evidencia en el Dashboard.

---

## 6. Configuración y Ejecución en Desarrollo (Local)

Para arrancar el MVP, se usarán tres terminales independientes en la máquina de desarrollo:

1. **Backend:**
   `cd backend && pip install -r requirements.txt && uvicorn main:app --reload`
2. **Frontend:**
   `cd frontend && npm install && npm run dev`
3. **Detector:**
   `cd detector && pip install -r requirements.txt && python main.py --source test_video.mp4`

---

## 7. Hoja de Ruta (Roadmap para la Memoria Académica)

* **Fase 1 (MVP Académico - Estado Actual):** Pruebas en máquina local (Windows/Mac). Componentes separados mediante API REST. Bases de datos SQLite y YOLO en CPU o GPU de consumo. Ingesta desde webcam o fichero de vídeo.
* **Fase 2 (Mejora de Robustez):** Inclusión de ByteTrack (algoritmo de Tracking) para hacer seguimiento persistente de individuos (Person ID), reduciendo aún más los falsos positivos. Dashboard de Frontend con configuración visual (dibujar polígonos con el ratón).
* **Fase 3 (Extensión Edge Real):** Containerización con Docker (y `docker-compose`). Despliegue en NVIDIA Jetson Orin Nano mediante TensorRT para acelerar YOLO. Integración con cámaras RTSP de la obra. Incorporación de un módulo de sincronización diferida hacia la nube cuando haya red disponible (almacenamiento de agregados diarios, no streaming).

## Plan de Verificación

1. **Frontend:** Verificaré que el diseño tenga una estética premium, moderna y responsiva, utilizando HTML5 semántico y animaciones fluidas para simular un dashboard de control de seguridad real.
2. **Backend:** Verificaremos las llamadas API (CRUD) usando las utilidades integradas de Swagger en FastAPI.
3. **Detector:** Simularemos el paso de un frame "falso positivo" vs un frame continuo para validar la persistencia en las reglas de negocio.
