"""
rules.py – Reglas de negocio y persistencia temporal (Time-to-Alert).

Implementa un buffer de estado por tipo de infracción para evitar falsos
positivos generados por un solo frame.  Solo se emite una alerta cuando la
infracción persiste durante un umbral de tiempo configurable.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Configuración de umbrales (en segundos)
# ---------------------------------------------------------------------------

EPI_ALERT_THRESHOLD_SEC = 2.0       # Infracción EPI persistente durante 2 s
ZONE_ALERT_THRESHOLD_SEC = 1.0      # Persona en zona restringida durante 1 s
COOLDOWN_SEC = 30.0                 # Cooldown entre alertas del mismo tipo


@dataclass
class InfractionState:
    """Estado interno de una infracción para un evento individual."""
    first_seen: float = 0.0
    last_seen: float = 0.0
    alerted: bool = False
    last_alert_time: float = 0.0


class AlertBuffer:
    """
    Buffer de estado para gestionar la persistencia temporal.

    Usa una clave (tipo_infraccion, track_id) para llevar un registro
    por cada persona detectada y tipo de infracción.
    """

    def __init__(
        self,
        epi_threshold: float = EPI_ALERT_THRESHOLD_SEC,
        zone_threshold: float = ZONE_ALERT_THRESHOLD_SEC,
        cooldown: float = COOLDOWN_SEC,
        frame_timeout: float = 1.0,
    ):
        self.epi_threshold = epi_threshold
        self.zone_threshold = zone_threshold
        self.cooldown = cooldown
        self.frame_timeout = frame_timeout  # Si pasa más de esto sin ver la infracción, se resetea
        self._states: dict[tuple[str, int], InfractionState] = {}

    def _get_threshold(self, alert_type: str) -> float:
        if alert_type == "RESTRICTED_ZONE":
            return self.zone_threshold
        return self.epi_threshold

    def update(self, alert_type: str, track_id: int = 0) -> bool:
        """
        Registra que se ha visto una infracción en este frame.

        Devuelve True si la infracción ha persistido el tiempo suficiente
        y no está en cooldown → se debe disparar la alerta.
        """
        now = time.time()
        key = (alert_type, track_id)
        state = self._states.get(key)

        if state is None or (now - state.last_seen) > self.frame_timeout:
            # Primera vez que se ve, o se perdió la infracción → reiniciar
            self._states[key] = InfractionState(first_seen=now, last_seen=now)
            return False

        state.last_seen = now
        threshold = self._get_threshold(alert_type)
        elapsed = now - state.first_seen

        if elapsed >= threshold:
            # Comprobar cooldown
            if state.alerted and (now - state.last_alert_time) < self.cooldown:
                return False
            state.alerted = True
            state.last_alert_time = now
            return True

        return False

    def cleanup(self, max_age: float = 60.0):
        """Elimina estados antiguos para evitar memory leaks."""
        now = time.time()
        to_remove = [k for k, v in self._states.items() if (now - v.last_seen) > max_age]
        for k in to_remove:
            del self._states[k]


# ---------------------------------------------------------------------------
# Utilidades de zona restringida
# ---------------------------------------------------------------------------

def point_in_polygon(point: tuple[float, float], polygon: list[dict]) -> bool:
    """
    Comprueba si un punto (normalizado 0-1) está dentro de un polígono.

    Args:
        point: (x, y) en coordenadas normalizadas.
        polygon: Lista de dicts {"x": float, "y": float}.

    Returns:
        True si el punto está dentro del polígono.
    """
    pts = np.array([[p["x"], p["y"]] for p in polygon], dtype=np.float32)
    result = cv2.pointPolygonTest(pts, point, measureDist=False)
    return result >= 0


def bbox_center_normalized(bbox: tuple, frame_w: int, frame_h: int) -> tuple[float, float]:
    """Calcula el centro normalizado (0-1) de un bounding box [x1, y1, x2, y2]."""
    x1, y1, x2, y2 = bbox
    cx = ((x1 + x2) / 2) / frame_w
    cy = ((y1 + y2) / 2) / frame_h
    return (cx, cy)


def check_epi_violations(detections: list[dict]) -> list[dict]:
    """
    Analiza las detecciones de un frame y retorna las infracciones EPI.

    Cada detección es un dict con al menos: 
        {"class_name": str, "bbox": [x1,y1,x2,y2], "confidence": float}

    Retorna lista de dicts: {"type": "NO_HARDHAT"|"NO_VEST"|"NO_MASK", "track_id": int, "bbox": [...]}
    """
    violations = []

    for det in detections:
        cls = det.get("class_name", "").upper().replace(" ", "_").replace("-", "_")
        if cls in ("NO_HARDHAT", "NO_SAFETY_VEST", "NO_VEST", "NO_MASK"):
            if "HARDHAT" in cls:
                alert_type = "NO_HARDHAT"
            elif "MASK" in cls:
                alert_type = "NO_MASK"
            else:
                alert_type = "NO_VEST"
            violations.append({
                "type": alert_type,
                "track_id": det.get("track_id", 0),
                "bbox": det.get("bbox", []),
                "confidence": det.get("confidence", 0.0),
            })

    return violations
