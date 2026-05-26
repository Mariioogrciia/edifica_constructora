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
CONFIDENCE_THRESHOLD = 0.40
DISPLAY_WINDOW = True  # Mostrar ventana de OpenCV durante la demo


def parse_args():
    parser = argparse.ArgumentParser(description="Edifica – Detector de Seguridad")
    parser.add_argument("--source", type=str, default="0", help="Fuente de vídeo: ruta a fichero, '0' para webcam, o URL RTSP")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="Ruta al modelo YOLO (.pt o .onnx)")
    parser.add_argument("--backend", type=str, default=BACKEND_URL, help="URL del backend local")
    parser.add_argument("--camera-id", type=str, default=CAMERA_ID, help="Identificador de cámara")
    parser.add_argument("--confidence", type=float, default=CONFIDENCE_THRESHOLD, help="Umbral de confianza YOLO")
    parser.add_argument("--no-display", action="store_true", help="No mostrar ventana de OpenCV")
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


def send_alert(backend_url: str, alert_type: str, camera_id: str, frame: np.ndarray):
    """Envía una alerta al backend con el snapshot del frame actual."""
    try:
        # Codificar frame como JPEG
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        files = {"snapshot": ("snapshot.jpg", io.BytesIO(buffer.tobytes()), "image/jpeg")}
        params = {"type": alert_type, "camera_id": camera_id}
        resp = requests.post(f"{backend_url}/api/alerts", params=params, files=files, timeout=10)
        if resp.status_code == 201:
            print(f"[ALERT] ✓ {alert_type} enviada correctamente (id={resp.json().get('id')})")
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

    # Mapeo de clases YOLO relevantes (depende del dataset de entrenamiento)
    # Para la demo con el modelo estándar de COCO, "person" es la clase 0.
    # Con un modelo personalizado para EPIs, habrá clases como:
    # "Hardhat", "NO-Hardhat", "Safety Vest", "NO-Safety Vest", "Person"

    frame_count = 0
    cleanup_interval = int(fps * 10)  # Limpiar buffer cada ~10 segundos

    print("[INFO] ─── Detector iniciado. Pulsa 'q' para salir. ───")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[INFO] Fin del vídeo o error al leer frame.")
            break

        frame_count += 1

        # Inferencia YOLO
        results = model(frame, verbose=False, conf=args.confidence)

        detections = []
        person_boxes = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = float(box.conf[0])
                bbox = box.xyxy[0].cpu().numpy().tolist()

                det = {
                    "class_name": cls_name,
                    "bbox": bbox,
                    "confidence": conf,
                    "track_id": 0,  # Sin tracker en MVP
                }
                detections.append(det)

                if cls_name.lower() == "person":
                    person_boxes.append(det)

        # --- Regla 1: Infracciones EPI ---
        epi_violations = check_epi_violations(detections)
        for v in epi_violations:
            should_alert = alert_buffer.update(v["type"], v["track_id"])
            if should_alert:
                send_alert(args.backend, v["type"], args.camera_id, frame)

        # --- Regla 2: Zonas restringidas ---
        for person in person_boxes:
            center = bbox_center_normalized(person["bbox"], frame_w, frame_h)
            for zone in zones:
                polygon = zone.get("polygon_points", [])
                if polygon and point_in_polygon(center, polygon):
                    should_alert = alert_buffer.update("RESTRICTED_ZONE", person.get("track_id", 0))
                    if should_alert:
                        send_alert(args.backend, "RESTRICTED_ZONE", args.camera_id, frame)

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
