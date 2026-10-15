"""FungusSapiens FastAPI app: compatible POST /detect with YOLOv8 OIV7."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Callable
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from .config import Settings
from .detector import YoloOiv7Detector
from .images import decode_image
from .schemas import DetectResponse, to_normalized_boxes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Clients can upload an image without a content type (e.g. application/octet-stream).
# The decoder checks actual image bytes, not just user-supplied MIME headers.
ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff",
    "application/octet-stream", None,
}


def create_app(
    detector_factory: Callable | None = None,
    settings: Settings | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    if detector_factory is None:
        detector_factory = lambda: YoloOiv7Detector(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # If CUDA / model / class validation fails, startup intentionally fails.
        app.state.detector = await run_in_threadpool(detector_factory)
        app.state.gpu_lock = asyncio.Lock()
        yield

    app = FastAPI(
        title="FungusSapiens - YOLOv8 OIV7",
        description="Detect mushrooms in images of varying resolutions and aspect ratios.",
        version="2.0.0",
        lifespan=lifespan,
    )

    @app.post("/detect", response_model=DetectResponse)
    async def detect(request: Request, file: UploadFile = File(...)) -> DetectResponse:
        """Upload a still image in multipart/form-data, field named 'file'."""
        if file.content_type not in ALLOWED_MIME:
            raise HTTPException(status_code=415, detail="Unsupported image content type")

        try:
            # FastAPI spools uploaded data to a temporary file for large inputs.
            # Decode in a thread so event loop doesn't block for large images.
            decoded = await run_in_threadpool(decode_image, file.file, settings)
        finally:
            await file.close()

        lock = request.app.state.gpu_lock
        if lock.locked():
            raise HTTPException(status_code=429, detail="GPU busy; drop this frame")

        async with lock:
            started = perf_counter()
            try:
                detections = await run_in_threadpool(
                    request.app.state.detector.predict, decoded.bgr
                )
            except Exception as exc:
                logger.exception("YOLOv8 OIV7 inference failed")
                raise HTTPException(status_code=503, detail="GPU inference failed") from exc
            elapsed_ms = round((perf_counter() - started) * 1000, 2)

        processed_h, processed_w = decoded.bgr.shape[:2]
        return DetectResponse(
            frame_id=str(uuid4()),
            width=decoded.width,
            height=decoded.height,
            detections=to_normalized_boxes(detections, processed_w, processed_h),
            inference_ms=elapsed_ms,
            device=request.app.state.detector.device,
        )

    return app


app = create_app()
