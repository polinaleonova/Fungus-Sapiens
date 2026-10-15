"""GPU-only YOLOv8 OIV7 detector; unlike YOLO-World it has fixed class names.

Torch/Ultralytics imports live inside initialization, making HTTP tests runnable
without CUDA or downloading hundreds of MB of checkpoints.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np

from .config import Settings, model_location

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RawDetection:
    x1: float
    y1: float
    x2: float
    y2: float
    label: str
    confidence: float


def resolve_class_ids(
    model_names: Mapping[int, str] | Sequence[str], targets: Sequence[str]
) -> list[int]:
    """Resolve actual class IDs from the loaded checkpoint, ignoring letter case.

    Raises a clear exception if the wrong model is selected or a name isn't in
    this fixed-vocabulary detector. The stock OIV7 Mushroom ID is 347.
    """
    items = model_names.items() if isinstance(model_names, Mapping) else enumerate(model_names)
    lookup = {str(name).strip().casefold(): int(index) for index, name in items}
    missing = [name for name in targets if name.strip().casefold() not in lookup]
    if missing:
        raise ValueError(
            f"The checkpoint has no OIV7 class(es): {', '.join(missing)}. "
            "Use yolov8l-oiv7.pt and OIV7_CLASSES=Mushroom. "
            "OIV7 does not support YOLO-World text prompts."
        )
    return sorted({lookup[name.strip().casefold()] for name in targets})


class YoloOiv7Detector:
    def __init__(self, settings: Settings):
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError(
                "NVIDIA CUDA is unavailable. Verify the NVIDIA driver and CUDA-enabled "
                "PyTorch installation. CPU fallback is intentionally disabled."
            )
        if settings.cuda_device >= torch.cuda.device_count():
            raise RuntimeError(
                f"CUDA GPU {settings.cuda_device} is unavailable; "
                f"found {torch.cuda.device_count()} device(s)"
            )

        from ultralytics import YOLO

        self.device = f"cuda:{settings.cuda_device}"
        self.model_name = settings.model_name
        self.settings = settings
        logger.info("NVIDIA GPU: %s (%s)", torch.cuda.get_device_name(settings.cuda_device), self.device)
        logger.info("Loading YOLOv8 OIV7 weights: %s", settings.model_name)

        self.model = YOLO(model_location(settings.model_name))
        self.model.to(self.device)
        self.class_ids = resolve_class_ids(self.model.names, settings.target_classes)
        logger.info("Selected OIV7 classes: %s -> IDs %s", settings.target_classes, self.class_ids)

        self._options = dict(
            device=self.device,
            imgsz=settings.image_size,
            conf=settings.confidence,
            iou=settings.iou,
            classes=self.class_ids,
            max_det=settings.max_detections,
            agnostic_nms=False,
            half=settings.use_half,
            rect=True,  # preserve aspect ratio, minimum letterbox padding
            verbose=False,
        )
        logger.info("Warming up OIV7 on %s...", self.device)
        with torch.inference_mode():
            blank = np.zeros((settings.image_size, settings.image_size, 3), dtype=np.uint8)
            self.model.predict(source=blank, **self._options)
            torch.cuda.synchronize(settings.cuda_device)
        logger.info("YOLOv8 OIV7 ready")

    def predict(self, image_bgr: np.ndarray) -> list[RawDetection]:
        import torch

        with torch.inference_mode():
            result = self.model.predict(source=image_bgr, **self._options)[0]
        if result.boxes is None or len(result.boxes) == 0:
            return []

        xyxy = result.boxes.xyxy.detach().cpu().tolist()
        scores = result.boxes.conf.detach().cpu().tolist()
        classes = result.boxes.cls.detach().cpu().tolist()
        names = result.names
        detections: list[RawDetection] = []
        for (x1, y1, x2, y2), score, class_id in zip(xyxy, scores, classes):
            index = int(class_id)
            # Defense in depth: keep only OIV7 classes configured at startup.
            if index not in self.class_ids:
                continue
            label = names[index] if isinstance(names, (list, dict)) else str(index)
            detections.append(
                RawDetection(
                    x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2),
                    label=str(label), confidence=float(score),
                )
            )
        return detections
