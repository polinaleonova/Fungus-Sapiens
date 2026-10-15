"""Stable mobile API JSON schema; box coordinates are normalized to [0, 1]."""

from __future__ import annotations

import math

from pydantic import BaseModel, Field

from .detector import RawDetection


class DetectionBox(BaseModel):
    id: str
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)
    label: str
    confidence: float = Field(ge=0, le=1)


class DetectResponse(BaseModel):
    frame_id: str
    width: int
    height: int
    detections: list[DetectionBox]
    inference_ms: float
    device: str


def to_normalized_boxes(
    detections: list[RawDetection], width: int, height: int
) -> list[DetectionBox]:
    boxes: list[DetectionBox] = []
    if width <= 0 or height <= 0:
        return boxes
    for item in detections:
        values = (item.x1, item.y1, item.x2, item.y2, item.confidence)
        if not all(math.isfinite(value) for value in values):
            continue
        x1 = min(1.0, max(0.0, item.x1 / width))
        x2 = min(1.0, max(0.0, item.x2 / width))
        y1 = min(1.0, max(0.0, item.y1 / height))
        y2 = min(1.0, max(0.0, item.y2 / height))
        if x2 <= x1 or y2 <= y1:
            continue
        boxes.append(
            DetectionBox(
                id=f"mushroom-{len(boxes) + 1}",
                x1=round(x1, 6), y1=round(y1, 6),
                x2=round(x2, 6), y2=round(y2, 6),
                label=item.label,
                confidence=round(min(1, max(0, item.confidence)), 4),
            )
        )
    return boxes
