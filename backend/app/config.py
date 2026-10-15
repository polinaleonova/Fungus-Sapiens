"""Configuration for a fixed-vocabulary YOLOv8 Open Images V7 detector."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    model_name: str
    target_classes: tuple[str, ...]
    confidence: float
    iou: float
    image_size: int
    max_detections: int
    max_processing_side: int
    max_upload_bytes: int
    max_pixels: int
    use_half: bool
    cuda_device: int

    @classmethod
    def from_env(cls) -> "Settings":
        # Read the .env next to the backend, independent of the current working directory.
        # Actual environment variables take precedence over file values.
        load_dotenv(BACKEND_DIR / ".env", override=False)
        names = tuple(
            name.strip()
            for name in os.getenv("OIV7_CLASSES", "Mushroom").split(",")
            if name.strip()
        )
        settings = cls(
            model_name=os.getenv("YOLO_MODEL", "yolov8x-oiv7.pt").strip(),
            target_classes=names,
            confidence=float(os.getenv("YOLO_CONF", "0.20")),
            iou=float(os.getenv("YOLO_IOU", "0.50")),
            image_size=int(os.getenv("YOLO_IMGSZ", "640")),
            max_detections=int(os.getenv("YOLO_MAX_DET", "25")),
            # This is an optional *processing* downscale, NOT an upload size limit.
            max_processing_side=int(os.getenv("MAX_PROCESSING_SIDE", "2560")),
            # 0 = disable the previous hard-coded 5 MB / 12 MP application caps.
            max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", "0")),
            max_pixels=int(os.getenv("MAX_IMAGE_PIXELS", "0")),
            use_half=os.getenv("YOLO_FP16", "true").lower() in ("1", "true", "yes", "on"),
            cuda_device=int(os.getenv("CUDA_DEVICE_INDEX", "0")),
        )
        if not settings.model_name or not settings.target_classes:
            raise ValueError("YOLO_MODEL and OIV7_CLASSES must not be empty")
        if not 0 < settings.confidence <= 1 or not 0 < settings.iou <= 1:
            raise ValueError("YOLO_CONF and YOLO_IOU must be in (0, 1]")
        if settings.image_size < 32 or settings.image_size % 32:
            raise ValueError("YOLO_IMGSZ must be >= 32 and divisible by 32")
        if settings.max_detections <= 0:
            raise ValueError("YOLO_MAX_DET must be positive")
        if min(settings.max_processing_side, settings.max_upload_bytes, settings.max_pixels) < 0:
            raise ValueError("MAX_PROCESSING_SIDE, MAX_UPLOAD_BYTES and MAX_IMAGE_PIXELS must be >= 0")
        if settings.cuda_device < 0:
            raise ValueError("CUDA_DEVICE_INDEX must be >= 0")
        return settings


def model_location(model_name: str) -> str:
    """Prefer a local checkpoint in backend/; otherwise allow Ultralytics to download it."""
    candidate = Path(model_name)
    if candidate.is_file():
        return str(candidate)
    bundled = BACKEND_DIR / model_name
    return str(bundled) if bundled.is_file() else model_name
