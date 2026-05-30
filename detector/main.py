"""
Video inference engine for Edifica Constructora.

Processes video sources frame by frame with the active YOLO model and applies
business rules to create safety alerts in the local backend.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from logic.rules import (  # noqa: E402
    AlertBuffer,
    bbox_center_normalized,
    check_epi_violations,
    point_in_polygon,
)


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DEFAULT_MODEL = os.path.join(PROJECT_ROOT, "models", "edifica_detector.pt")
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
CAMERA_ID = "CAM-01"
CONFIDENCE_THRESHOLD = 0.25
VIDEOS_DIR = os.path.join(PROJECT_ROOT, "videos")

EXPECTED_CLASSES = {
    0: "Hardhat",
    1: "Mask",
    2: "NO-Hardhat",
    3: "NO-Mask",
    4: "NO-Safety Vest",
    5: "Person",
    6: "Safety Cone",
    7: "Safety Vest",
    8: "machinery",
    9: "vehicle",
}


def default_source() -> str:
    if not os.path.isdir(VIDEOS_DIR):
        return "0"

    videos = [
        name
        for name in os.listdir(VIDEOS_DIR)
        if name.lower().endswith((".mp4", ".avi", ".mkv", ".mov"))
    ]
    return os.path.join(VIDEOS_DIR, videos[0]) if videos else "0"


def parse_args():
    parser = argparse.ArgumentParser(description="Edifica safety detector")
    parser.add_argument("--source", type=str, default=default_source(), help="Video file, webcam index, RTSP URL, or stream URL")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, help="YOLO model path (.pt or .onnx)")
    parser.add_argument("--backend", type=str, default=BACKEND_URL, help="Local backend URL")
    parser.add_argument("--camera-id", type=str, default=CAMERA_ID, help="Camera identifier")
    parser.add_argument("--confidence", type=float, default=CONFIDENCE_THRESHOLD, help="YOLO confidence threshold")
    parser.add_argument("--no-display", action="store_true", help="Disable OpenCV preview window")
    parser.add_argument("--max-frames", type=int, default=0, help="Maximum frames to read (0 = no limit)")
    parser.add_argument("--frame-stride", type=int, default=1, help="Process 1 of every N frames (1 = every frame)")
    parser.add_argument("--realtime", action="store_true", help="For local demo videos, sleep to match source FPS")
    return parser.parse_args()


def normalize_model_names(names) -> dict[int, str]:
    if isinstance(names, dict):
        return {int(key): str(value) for key, value in names.items()}
    return {idx: str(value) for idx, value in enumerate(names)}


def load_model(model_path: str) -> YOLO:
    resolved_path = os.path.abspath(model_path)
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"YOLO model not found: {resolved_path}")

    print(f"[INFO] Loading YOLO model: {resolved_path}")
    model = YOLO(resolved_path)
    names = normalize_model_names(model.names)
    print(f"[INFO] Model classes: {names}")

    mismatches = {
        idx: expected
        for idx, expected in EXPECTED_CLASSES.items()
        if names.get(idx) != expected
    }
    if mismatches:
        print(f"[WARN] Model classes differ from detector rules: {mismatches}")

    return model


def fetch_restricted_zones(backend_url: str) -> list[dict]:
    try:
        resp = requests.get(f"{backend_url}/api/zones", timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        print(f"[WARN] Could not fetch restricted zones: {exc}")
        return []


def crop_with_padding(frame: np.ndarray, bbox: list[float], padding_ratio: float = 0.15) -> np.ndarray:
    if not bbox or len(bbox) != 4:
        return frame

    x1, y1, x2, y2 = map(int, bbox)
    h_img, w_img = frame.shape[:2]
    pad_w = int((x2 - x1) * padding_ratio)
    pad_h = int((y2 - y1) * padding_ratio)
    x1_pad = max(0, x1 - pad_w)
    y1_pad = max(0, y1 - pad_h)
    x2_pad = min(w_img, x2 + pad_w)
    y2_pad = min(h_img, y2 + pad_h)

    if x2_pad <= x1_pad or y2_pad <= y1_pad:
        return frame
    return frame[y1_pad:y2_pad, x1_pad:x2_pad]


def send_alert(
    backend_url: str,
    alert_type: str,
    camera_id: str,
    frame: np.ndarray,
    track_id: int = 0,
    confidence: float = 0.0,
):
    try:
        encoded, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not encoded:
            print(f"[ALERT] Could not encode snapshot for {alert_type}")
            return

        files = {"snapshot": ("snapshot.jpg", io.BytesIO(buffer.tobytes()), "image/jpeg")}
        params = {"type": alert_type, "camera_id": camera_id}
        if track_id > 0:
            params["track_id"] = track_id
        if confidence > 0:
            params["confidence"] = round(confidence, 3)

        resp = requests.post(f"{backend_url}/api/alerts", params=params, files=files, timeout=10)
        if resp.status_code == 201:
            print(f"[ALERT] Sent {alert_type} (id={resp.json().get('id')}, track_id={track_id})")
        elif resp.status_code == 200:
            print(f"[ALERT] Deduplicated {alert_type} in backend (track_id={track_id})")
        else:
            print(f"[ALERT] Backend error: {resp.status_code} {resp.text[:200]}")
    except Exception as exc:
        print(f"[ALERT] Could not send alert: {exc}")


def read_detections(results, class_names: dict[int, str]) -> tuple[list[dict], list[dict]]:
    detections: list[dict] = []
    person_boxes: list[dict] = []

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls.item())
            cls_name = class_names.get(cls_id, str(cls_id))
            det = {
                "class_id": cls_id,
                "class_name": cls_name,
                "bbox": box.xyxy[0].cpu().numpy().tolist(),
                "confidence": float(box.conf.item()),
                "track_id": int(box.id.item()) if box.id is not None else 0,
            }
            detections.append(det)
            if cls_name.lower() == "person":
                person_boxes.append(det)

    return detections, person_boxes


def associated_person_track(violation: dict, persons: list[dict]) -> int:
    bbox = violation.get("bbox", [])
    if not bbox or len(bbox) != 4:
        return int(violation.get("track_id") or 0)

    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    for person in persons:
        pbox = person.get("bbox", [])
        if pbox and pbox[0] <= cx <= pbox[2] and pbox[1] <= cy <= pbox[3]:
            return int(person.get("track_id") or 0)

    return int(violation.get("track_id") or 0)


def main():
    args = parse_args()
    args.frame_stride = max(1, args.frame_stride)

    source = int(args.source) if args.source.isdigit() else args.source
    try:
        model = load_model(args.model)
    except Exception as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)

    class_names = normalize_model_names(model.names)

    print(f"[INFO] Opening video source: {args.source}")
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("[ERROR] Could not open video source.")
        sys.exit(1)

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    cleanup_interval = max(1, int(fps * 10))
    print(f"[INFO] Source: {frame_w}x{frame_h} @ {fps:.1f} FPS")
    print(f"[INFO] Processing every {args.frame_stride} frame(s)")

    zones = fetch_restricted_zones(args.backend)
    print(f"[INFO] Restricted zones loaded: {len(zones)}")

    alert_buffer = AlertBuffer()
    frame_count = 0
    processed_count = 0
    start_time = time.time()

    print("[INFO] Detector started.")

    while True:
        if args.max_frames > 0 and frame_count >= args.max_frames:
            print(f"[INFO] Max frame limit reached: {args.max_frames}")
            break

        ret, frame = cap.read()
        if not ret:
            print("[INFO] End of video or frame read error.")
            break

        frame_count += 1
        if frame_count % args.frame_stride != 0:
            continue

        if args.realtime and isinstance(source, str) and os.path.isfile(source):
            expected_time = frame_count / fps
            actual_time = time.time() - start_time
            if expected_time > actual_time:
                time.sleep(expected_time - actual_time)

        results = model.track(frame, verbose=False, conf=args.confidence, persist=True)
        detections, person_boxes = read_detections(results, class_names)
        processed_count += 1
        current_sec = float(frame_count) / fps

        if detections:
            summary = [(d["class_name"], d["track_id"], round(d["confidence"], 2)) for d in detections]
            print(f"[DEBUG] Frame {frame_count}: {summary}")

        for violation in check_epi_violations(detections):
            person_track = associated_person_track(violation, person_boxes)
            buffer_track = person_track or int(violation.get("track_id") or 0)
            if alert_buffer.update(violation["type"], buffer_track, current_sec):
                crop = crop_with_padding(frame, violation.get("bbox", []))
                send_alert(
                    args.backend,
                    violation["type"],
                    args.camera_id,
                    crop,
                    buffer_track,
                    float(violation.get("confidence", 0.0)),
                )

        for person in person_boxes:
            center = bbox_center_normalized(person["bbox"], frame_w, frame_h)
            for zone in zones:
                if str(zone.get("zone_type", "Restringida")).lower() != "restringida":
                    continue

                polygon = zone.get("polygon_points", [])
                if polygon and point_in_polygon(center, polygon):
                    track_id = int(person.get("track_id") or 0)
                    if alert_buffer.update("RESTRICTED_ZONE", track_id, current_sec):
                        crop = crop_with_padding(frame, person.get("bbox", []))
                        send_alert(
                            args.backend,
                            "RESTRICTED_ZONE",
                            args.camera_id,
                            crop,
                            track_id,
                            float(person.get("confidence", 0.0)),
                        )

        if not args.no_display:
            annotated = results[0].plot() if results else frame
            for zone in zones:
                points = zone.get("polygon_points", [])
                if not points:
                    continue
                poly = np.array(
                    [[int(p["x"] * frame_w), int(p["y"] * frame_h)] for p in points],
                    dtype=np.int32,
                )
                cv2.polylines(annotated, [poly], True, (0, 0, 255), 2)
                if zone.get("name"):
                    cv2.putText(
                        annotated,
                        zone["name"],
                        (poly[0][0], poly[0][1] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (0, 0, 255),
                        2,
                    )

            cv2.imshow("Edifica - Safety Detector", annotated)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        if frame_count % cleanup_interval == 0:
            alert_buffer.cleanup()

    cap.release()
    if not args.no_display:
        cv2.destroyAllWindows()

    print(f"[INFO] Detector stopped. Read frames: {frame_count}. Processed frames: {processed_count}.")


if __name__ == "__main__":
    main()
