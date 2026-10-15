"""JPEG/PNG/WebP/BMP/TIFF input, arbitrary aspect ratios, EXIF orientation.

No app-specific 5 MB or 12 MP limits by default. The file is decoded straight
from FastAPI's spooled upload (rather than copying it all into a bytes object).
Huge images can be downscaled for inference while retaining original dimensions
and normalized coordinates. Pillow's decompression-bomb safeguard stays enabled.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import BinaryIO
import warnings

import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings

SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "TIFF"}


@dataclass(frozen=True)
class DecodedImage:
    bgr: np.ndarray
    width: int  # original image width after EXIF rotation
    height: int  # original image height after EXIF rotation


def decode_image(source: BinaryIO | bytes, settings: Settings) -> DecodedImage:
    """Decode user input and resize for processing without distorting the shape.

    Box coordinates produced by YOLO belong to the processed pixel array.
    Normalizing them using bgr.shape maps correctly onto original width/height.
    """
    stream = BytesIO(source) if isinstance(source, bytes) else source
    try:
        stream.seek(0, 2)
        byte_count = stream.tell()
        stream.seek(0)
    except (OSError, ValueError, AttributeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Unreadable image stream") from exc
    if byte_count == 0:
        raise HTTPException(status_code=422, detail="Empty image")
    if settings.max_upload_bytes and byte_count > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds MAX_UPLOAD_BYTES")

    try:
        # Treat dangerous expansion as a 413, not a warning silently ignored.
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(stream) as source_image:
                if source_image.format not in SUPPORTED_FORMATS:
                    raise HTTPException(
                        status_code=415,
                        detail="Supported image formats: JPEG, PNG, WebP, BMP, TIFF",
                    )
                source_width, source_height = source_image.size
                if source_width <= 0 or source_height <= 0:
                    raise HTTPException(status_code=422, detail="Invalid image dimensions")
                if settings.max_pixels and source_width * source_height > settings.max_pixels:
                    raise HTTPException(status_code=413, detail="Image exceeds MAX_IMAGE_PIXELS")

                # Record full-resolution, EXIF-corrected dimensions BEFORE JPEG draft,
                # which can reduce source_image.size in-place.
                orientation = source_image.getexif().get(274, 1)
                if orientation in (5, 6, 7, 8):
                    full_width, full_height = source_height, source_width
                else:
                    full_width, full_height = source_width, source_height

                # JPEG draft can cheaply subsample while decoding enormous photos.
                if settings.max_processing_side and max(source_width, source_height) > settings.max_processing_side:
                    try:
                        source_image.draft("RGB", (
                            settings.max_processing_side, settings.max_processing_side
                        ))
                    except (OSError, ValueError):
                        pass  # Other formats will be resized via thumbnail below.

                image = ImageOps.exif_transpose(source_image)
                if settings.max_processing_side and max(image.size) > settings.max_processing_side:
                    image.thumbnail(
                        (settings.max_processing_side, settings.max_processing_side),
                        Image.Resampling.LANCZOS,
                    )
                rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
                bgr = np.ascontiguousarray(rgb[:, :, ::-1])
                return DecodedImage(bgr=bgr, width=full_width, height=full_height)
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=413, detail="Image exceeds Pillow safety limit") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, EOFError) as exc:
        raise HTTPException(status_code=422, detail="Invalid or corrupt image") from exc
