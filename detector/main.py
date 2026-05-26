"""
main.py – Motor de inferencia de vídeo para Edifica Constructora.

Procesa una fuente de vídeo (archivo, webcam o RTSP) frame a frame usando
YOLOv8 y aplica las reglas de negocio de persistencia temporal para generar
alertas hacia el Backend local.

Uso:
    python main.py --source test_video.mp4
    python main.py --source 0          # Webcam
    python main.py --source rtsp://...  # Cámara IP
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time

import cv2
import numpy as np
import requests
from ultralytics import YOLO

# Añadir el directorio actual al path para importar logic
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from logic.rules import (
    AlertBuffer,
    bbox_center_normalized,
    check_epi_violations,
    point_in_polygon,
)

# ---------------------------------------------------------------------------
# Configuración por defecto
# ---------------------------------------------------------------------------

DEFAULT_MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "best.pt")
BACKEND_URL = "http://localhost:8000"
CAMERA_ID = "CAM-01"
CONFIDENCE_THRESHOLD = 0.25
DISPLAY_WINDOW = True  # Mostrar ventana de OpenCV durante la demo

# Buscar un vídeo en la carpeta 'videos' por defecto
VIDEOS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "videos")
DEFAULT_SOURCE = "0"
if os.path.exists(VIDEOS_DIR) and os.path.isdir(VIDEOS_DIR):
    videos = [f for f in os.listdir(VIDEOS_DIR) if f.lower().endswith((".mp4", ".avi", ".mkv", ".mov"))]
    if videos:
        DEFAULT_SOURCE = os.path.join(VIDEOS_DIR, videos[0])


def parse_args():
    parser = argparse.ArgumentParser(description="Edifica – Detector de Seguridad")
    parser.add_argument("--source", type=str, default=DEFAULT_SOURCE, help="Fuente de vídeo: ruta a fichero, '0' para webcam, o URL RTSP")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Ruta al modelo YOLO (.pt o .onnx)")
    parser.add_argument("--backend", type=str, default=BACKEND_URL, help="URL del backend local")
    parser.add_argument("--camera-id", type=str, default=CAMERA_ID, help="Identificador de cámara")
    parser.add_argument("--confidence", type=float, default=CONFIDENCE_THRESHOLD, help="Umbral de confianza YOLO")
    parser.add_argument("--no-display", action="store_true", help="No mostrar ventana de OpenCV")
    parser.add_argument("--max-frames", type=int, default=0, help="Máximo de frames a procesar (0 = infinito)")
    return parser.parse_args()


def fetch_restricted_zones(backend_url: str) -> list[dict]:
    """Obtiene las zonas restringidas del backend."""
    try:
        resp = requests.get(f"{backend_url}/api/zones", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[WARN] No se pudieron obtener zonas restringidas: {e}")
        return []


def send_alert(backend_url: str, alert_type: str, camera_id: str, frame: np.ndarray, track_id: int = 0):
    """Envía una alerta al backend con el snapshot del frame actual."""
    try:
        # Codificar frame como JPEG
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        files = {"snapshot": ("snapshot.jpg", io.BytesIO(buffer.tobytes()), "image/jpeg")}
        params = {"type": alert_type, "camera_id": camera_id}
        if track_id > 0:
            params["track_id"] = track_id
            
        resp = requests.post(f"{backend_url}/api/alerts", params=params, files=files, timeout=10)
        if resp.status_code == 201:
            print(f"[ALERT] ✓ {alert_type} enviada correctamente (id={resp.json().get('id')}, track_id={track_id})")
        else:
            # Si el backend devuelve 200 en vez de 201, significa que fue deduplicada (ya existía)
            if resp.status_code == 200:
                print(f"[ALERT] ≈ {alert_type} deduplicada en backend (track_id={track_id})")
            else:
                print(f"[ALERT] ✗ Error al enviar: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[ALERT] ✗ No se pudo enviar alerta: {e}")


def main():
    args = parse_args()

    # Resolver fuente de vídeo
    source = args.source
    if source.isdigit():
        source = int(source)

    print(f"[INFO] Cargando modelo YOLO: {args.model}")
    model = YOLO(args.model)

    print(f"[INFO] Abriendo fuente de vídeo: {args.source}")
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("[ERROR] No se pudo abrir la fuente de vídeo.")
        sys.exit(1)

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    print(f"[INFO] Resolución: {frame_w}x{frame_h} @ {fps:.1f} FPS")

    # Obtener zonas restringidas
    zones = fetch_restricted_zones(args.backend)
    print(f"[INFO] Zonas restringidas cargadas: {len(zones)}")

    # Buffer de alertas
    alert_buffer = AlertBuffer()

    frame_count = 0
    cleanup_interval = int(fps * 10)  # Limpiar buffer cada ~10 segundos

    print("[INFO] ─── Detector iniciado. Pulsa 'q' para salir. ───")
    start_time = time.time()

    while True:
        if args.max_frames > 0 and frame_count >= args.max_frames:
            print(f"[INFO] Alcanzado el límite de {args.max_frames} frames. Finalizando.")
            break

        ret, frame = cap.read()
        if not ret:
            print("[INFO] Fin del vídeo o error al leer frame.")
            # Notificar al backend para que limpie el estado del detector activo
            try:
                requests.post(f"{args.backend}/api/analyze/stop?camera_id={args.camera_id}", timeout=5)
            except Exception:
                pass
            break

        frame_count += 1

        # Sincronización con tiempo real para vídeos locales
        if isinstance(source, str) and os.path.isfile(source):
            expected_time = frame_count / fps
            actual_time = time.time() - start_time
            if actual_time > expected_time + 0.2:
                # Vamos atrasados, saltar frame
                continue
            elif expected_time > actual_time:
                # Vamos adelantados, dormir un poco
                time.sleep(expected_time - actual_time)

        # Inferencia YOLO con tracker activado para identificar a las mismas personas
        results = model.track(frame, verbose=False, conf=args.confidence, persist=True)

        detections = []
        person_boxes = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls.item())
                cls_name = model.names[cls_id]
                conf = float(box.conf.item())
                bbox = box.xyxy[0].cpu().numpy().tolist()
                track_id = int(box.id.item()) if box.id is not None else 0

                det = {
                    "class_name": cls_name,
                    "bbox": bbox,
                    "confidence": conf,
                    "track_id": track_id,
                }
                detections.append(det)

                if cls_name.lower() == "person":
                    person_boxes.append(det)

        # Calcular el tiempo del vídeo en segundos para evitar que la latencia de CPU cause resets del buffer
        current_sec = float(frame_count) / fps

        # --- Regla 1: Infracciones EPI ---
        epi_violations = check_epi_violations(detections)
        if detections:
            print(f"[DEBUG] Detecciones en frame {frame_count}: {[ (d['class_name'], d['track_id'], round(d['confidence'], 2)) for d in detections ]}")
        if epi_violations:
            print(f"[DEBUG] ¡Infracciones EPI detectadas!: {epi_violations}")
        for v in epi_violations:
            # Buscar a qué persona pertenece esta infracción calculando su centro
            v_cx = (v["bbox"][0] + v["bbox"][2]) / 2
            v_cy = (v["bbox"][1] + v["bbox"][3]) / 2
            person_id = v["track_id"]
            for p in person_boxes:
                if p["bbox"][0] <= v_cx <= p["bbox"][2] and p["bbox"][1] <= v_cy <= p["bbox"][3]:
                    person_id = p.get("track_id", 0)
                    break
                    
            # Acumulamos el tiempo usando el track_id original de la infracción para garantizar 
            # la continuidad (la asociación espacial con la persona puede parpadear)
            should_alert = alert_buffer.update(v["type"], v["track_id"], current_sec)
            if should_alert:
                # Recortar solo el área de la infracción
                crop_frame = frame
                bbox = v.get("bbox", [])
                if bbox and len(bbox) == 4:
                    x1, y1, x2, y2 = map(int, bbox)
                    # Añadir un pequeño margen de padding para contexto
                    h_img, w_img = frame.shape[:2]
                    pad_w = int((x2 - x1) * 0.15)
                    pad_h = int((y2 - y1) * 0.15)
                    x1_pad = max(0, x1 - pad_w)
                    y1_pad = max(0, y1 - pad_h)
                    x2_pad = min(w_img, x2 + pad_w)
                    y2_pad = min(h_img, y2 + pad_h)
                    if x2_pad > x1_pad and y2_pad > y1_pad:
                        crop_frame = frame[y1_pad:y2_pad, x1_pad:x2_pad]
                
                send_alert(args.backend, v["type"], args.camera_id, crop_frame, person_id)

        # --- Regla 2: Zonas restringidas ---
        for person in person_boxes:
            center = bbox_center_normalized(person["bbox"], frame_w, frame_h)
            for zone in zones:
                polygon = zone.get("polygon_points", [])
                if polygon and point_in_polygon(center, polygon):
                    track_id = person.get("track_id", 0)
                    should_alert = alert_buffer.update("RESTRICTED_ZONE", track_id, current_sec)
                    if should_alert:
                        # Recortar el área del intruso
                        crop_frame = frame
                        bbox = person.get("bbox", [])
                        if bbox and len(bbox) == 4:
                            x1, y1, x2, y2 = map(int, bbox)
                            h_img, w_img = frame.shape[:2]
                            pad_w = int((x2 - x1) * 0.15)
                            pad_h = int((y2 - y1) * 0.15)
                            x1_pad = max(0, x1 - pad_w)
                            y1_pad = max(0, y1 - pad_h)
                            x2_pad = min(w_img, x2 + pad_w)
                            y2_pad = min(h_img, y2 + pad_h)
                            if x2_pad > x1_pad and y2_pad > y1_pad:
                                crop_frame = frame[y1_pad:y2_pad, x1_pad:x2_pad]
                        
                        send_alert(args.backend, "RESTRICTED_ZONE", args.camera_id, crop_frame, track_id)

        # --- Visualización ---
        if not args.no_display:
            annotated = results[0].plot() if results else frame
            # Dibujar zonas restringidas
            for zone in zones:
                pts = zone.get("polygon_points", [])
                if pts:
                    poly = np.array(
                        [[int(p["x"] * frame_w), int(p["y"] * frame_h)] for p in pts],
                        dtype=np.int32,
                    )
                    cv2.polylines(annotated, [poly], True, (0, 0, 255), 2)
                    if zone.get("name"):
                        cv2.putText(
                            annotated, zone["name"],
                            (poly[0][0], poly[0][1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2,
                        )

            cv2.imshow("Edifica – Detector de Seguridad", annotated)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        # Limpieza periódica del buffer
        if frame_count % cleanup_interval == 0:
            alert_buffer.cleanup()

    cap.release()
    if not args.no_display:
        cv2.destroyAllWindows()
    print("[INFO] Detector detenido.")


if __name__ == "__main__":
    main()
