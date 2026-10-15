from __future__ import annotations

import pytest

from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        model_name="yolov8l-oiv7.pt",
        target_classes=("Mushroom",),
        confidence=0.2,
        iou=0.5,
        image_size=640,
        max_detections=25,
        max_processing_side=512,
        max_upload_bytes=0,
        max_pixels=0,
        use_half=True,
        cuda_device=0,
    )
