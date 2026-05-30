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

EPI_ALERT_THRESHOLD_SEC = 0.1       # Infracción EPI persistente durante 0.1 s (2-3 frames, para videos de prueba muy cortos)
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
        self._sent_keys: set[tuple[str, int]] = set()

    def _get_threshold(self, alert_type: str) -> float:
        if alert_type == "RESTRICTED_ZONE":
            return self.zone_threshold
        return self.epi_threshold

    def update(self, alert_type: str, track_id: int = 0, custom_now: Optional[float] = None) -> bool:
        """
        Registra que se ha visto una infracción en este frame.

        Devuelve True si la infracción ha persistido el tiempo suficiente
        y no está en cooldown → se debe disparar la alerta.
        """
        now = custom_now if custom_now is not None else time.time()
        key = (alert_type, track_id)
        if key in self._sent_keys:
            return False
        state = self._states.get(key)

        if state is None or (now - state.last_seen) > self.frame_timeout:
            # Primera vez que se ve, o se perdió la infracción → reiniciar
            self._states[key] = InfractionState(first_seen=now, last_seen=now)
            return False

        state.last_seen = now
        threshold = self._get_threshold(alert_type)
        elapsed = now - state.first_seen

        if elapsed >= threshold:
            # Comprobar cooldown (en segundos de tiempo real o de video)
            if state.alerted and (now - state.last_alert_time) < self.cooldown:
                return False
            state.alerted = True
            state.last_alert_time = now
            self._sent_keys.add(key)
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
    Usa una combinación de detecciones directas de infracciones (ej. NO-Hardhat)
    y un sistema heurístico negativo (si se detecta una persona pero no se le detecta casco/chaleco).

    Cada detección es un dict con al menos: 
        {"class_name": str, "bbox": [x1,y1,x2,y2], "confidence": float}

    Retorna lista de dicts: {"type": "NO_HARDHAT"|"NO_VEST"|"NO_MASK", "track_id": int, "bbox": [...]}
    """
    violations = []
    
    # 1. Separar las detecciones por categorías
    persons = []
    hardhats = []
    no_hardhats = []
    vests = []
    no_vests = []
    masks = []
    no_masks = []
    
    for det in detections:
        cls = det.get("class_name", "")
        cls_upper = cls.upper().replace(" ", "_").replace("-", "_")
        
        if cls_upper == "PERSON":
            persons.append(det)
        elif cls_upper == "HARDHAT":
            hardhats.append(det)
        elif cls_upper in ("NO_HARDHAT", "NO_HELMET"):
            no_hardhats.append(det)
        elif cls_upper in ("SAFETY_VEST", "VEST"):
            vests.append(det)
        elif cls_upper in ("NO_SAFETY_VEST", "NO_VEST"):
            no_vests.append(det)
        elif cls_upper == "MASK":
            masks.append(det)
        elif cls_upper == "NO_MASK":
            no_masks.append(det)

    # 2. Registrar infracciones directas detectadas por el modelo
    # Para evitar duplicados en el mismo frame para la misma persona,
    # llevamos un registro de personas que ya tienen una infracción explícita de cada tipo.
    explicit_hardhat_infraction_persons = set()
    explicit_vest_infraction_persons = set()
    
    # Infracciones directas de NO-Hardhat
    for det in no_hardhats:
        bbox = det.get("bbox", [])
        track_id = det.get("track_id", 0)
        violations.append({
            "type": "NO_HARDHAT",
            "track_id": track_id,
            "bbox": bbox,
            "confidence": det.get("confidence", 0.0),
        })
        # Intentar asociar con una persona para marcarla y no generar la heurística negativa
        if bbox:
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
            for p in persons:
                p_bbox = p.get("bbox", [])
                if p_bbox and p_bbox[0] <= cx <= p_bbox[2] and p_bbox[1] <= cy <= p_bbox[3]:
                    explicit_hardhat_infraction_persons.add(p.get("track_id", 0))
                    break

    # Infracciones directas de NO-Vest / NO-Safety Vest
    for det in no_vests:
        bbox = det.get("bbox", [])
        track_id = det.get("track_id", 0)
        violations.append({
            "type": "NO_VEST",
            "track_id": track_id,
            "bbox": bbox,
            "confidence": det.get("confidence", 0.0),
        })
        if bbox:
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
            for p in persons:
                p_bbox = p.get("bbox", [])
                if p_bbox and p_bbox[0] <= cx <= p_bbox[2] and p_bbox[1] <= cy <= p_bbox[3]:
                    explicit_vest_infraction_persons.add(p.get("track_id", 0))
                    break

    # Infracciones directas de NO-Mask
    for det in no_masks:
        violations.append({
            "type": "NO_MASK",
            "track_id": det.get("track_id", 0),
            "bbox": det.get("bbox", []),
            "confidence": det.get("confidence", 0.0),
        })

    # 3. Heurística negativa para personas sin equipo detectado
    for p in persons:
        p_bbox = p.get("bbox", [])
        if not p_bbox or len(p_bbox) != 4:
            continue
        
        p_track_id = p.get("track_id", 0)
        
        # --- CASCO / HARDHAT ---
        # Si esta persona ya tiene una infracción directa de NO-Hardhat, no aplicar heurística
        if p_track_id not in explicit_hardhat_infraction_persons:
            # Comprobar si hay algún casco (Hardhat) puesto sobre esta persona
            has_hardhat = False
            for h in hardhats:
                h_bbox = h.get("bbox", [])
                if h_bbox:
                    hcx = (h_bbox[0] + h_bbox[2]) / 2
                    hcy = (h_bbox[1] + h_bbox[3]) / 2
                    if p_bbox[0] <= hcx <= p_bbox[2] and p_bbox[1] <= hcy <= p_bbox[3]:
                        has_hardhat = True
                        break
            
            # Si no tiene Hardhat (ni se le detectó casco explícitamente), inferimos NO_HARDHAT
            if not has_hardhat:
                # Estimamos la región de la cabeza (top 25% de la caja de la persona)
                head_y2 = p_bbox[1] + (p_bbox[3] - p_bbox[1]) * 0.25
                head_bbox = [p_bbox[0], p_bbox[1], p_bbox[2], head_y2]
                violations.append({
                    "type": "NO_HARDHAT",
                    "track_id": p_track_id,
                    "bbox": head_bbox,
                    "confidence": p.get("confidence", 0.0),
                    "inferred": True
                })

        # --- CHALECO / SAFETY VEST ---
        if p_track_id not in explicit_vest_infraction_persons:
            has_vest = False
            for v in vests:
                v_bbox = v.get("bbox", [])
                if v_bbox:
                    vcx = (v_bbox[0] + v_bbox[2]) / 2
                    vcy = (v_bbox[1] + v_bbox[3]) / 2
                    if p_bbox[0] <= vcx <= p_bbox[2] and p_bbox[1] <= vcy <= p_bbox[3]:
                        has_vest = True
                        break
            
            if not has_vest:
                # Estimamos la región del pecho/torso (20% a 65% de la caja de la persona)
                torso_y1 = p_bbox[1] + (p_bbox[3] - p_bbox[1]) * 0.20
                torso_y2 = p_bbox[1] + (p_bbox[3] - p_bbox[1]) * 0.65
                torso_bbox = [p_bbox[0], torso_y1, p_bbox[2], torso_y2]
                violations.append({
                    "type": "NO_VEST",
                    "track_id": p_track_id,
                    "bbox": torso_bbox,
                    "confidence": p.get("confidence", 0.0),
                    "inferred": True
                })

    return violations
