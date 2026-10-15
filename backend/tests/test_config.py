from __future__ import annotations

from app.config import Settings


def test_default_old_caps_are_disabled(monkeypatch):
    for key in (
        "YOLO_MODEL", "OIV7_CLASSES", "YOLO_CONF", "YOLO_IOU", "YOLO_IMGSZ",
        "YOLO_MAX_DET", "MAX_PROCESSING_SIDE", "MAX_UPLOAD_BYTES",
        "MAX_IMAGE_PIXELS", "YOLO_FP16", "CUDA_DEVICE_INDEX",
    ):
        monkeypatch.delenv(key, raising=False)
    settings = Settings.from_env()
    assert settings.target_classes == ("Mushroom",)
    assert settings.max_upload_bytes == 0
    assert settings.max_pixels == 0
    assert settings.model_name == "yolov8l-oiv7.pt"
