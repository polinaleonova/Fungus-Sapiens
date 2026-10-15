from __future__ import annotations

from dataclasses import replace
from io import BytesIO

import numpy as np
import pytest
from fastapi import HTTPException
from PIL import Image

from app.images import decode_image


def photo(width: int, height: int, mode: str = "RGB", fmt: str = "PNG") -> bytes:
    stream = BytesIO()
    Image.new(mode, (width, height), (128, 0, 32)).save(stream, format=fmt)
    return stream.getvalue()


@pytest.mark.parametrize("dimensions", [(160, 320), (400, 100), (512, 512), (2000, 1000), (300, 1600)])
def test_accept_any_aspect_ratio_with_original_size(settings, dimensions):
    w, h = dimensions
    decoded = decode_image(photo(w, h), settings)
    assert (decoded.width, decoded.height) == (w, h)
    processed_h, processed_w = decoded.bgr.shape[:2]
    assert max(processed_w, processed_h) <= 512
    assert abs(processed_w / processed_h - w / h) < 0.015
    assert decoded.bgr.dtype == np.uint8


def test_jpeg_exif_orientation_and_resize_preserve_real_size(settings):
    stream = BytesIO()
    pic = Image.new("RGB", (2000, 1000), "orange")
    exif = Image.Exif()
    exif[274] = 6  # 90-degree clockwise rotation
    pic.save(stream, format="JPEG", exif=exif)
    decoded = decode_image(stream, settings)
    assert decoded.width == 1000
    assert decoded.height == 2000
    assert decoded.bgr.shape[0] > decoded.bgr.shape[1]
    assert max(decoded.bgr.shape[:2]) <= 512


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP", "BMP", "TIFF"])
def test_common_image_formats(settings, fmt):
    assert decode_image(photo(100, 70, fmt=fmt), settings).bgr.shape == (70, 100, 3)


def test_more_than_old_5mb_limit_accepted(settings):
    payload = photo(1600, 1500, fmt="BMP")
    assert len(payload) > 5 * 1024 * 1024
    assert decode_image(payload, settings).width == 1600


def test_old_12mp_limit_removed(settings):
    # JPEG compressed bytes are small, but the source image is 13+ MP.
    payload = photo(4096, 3200, fmt="JPEG")
    decoded = decode_image(payload, settings)
    assert (decoded.width, decoded.height) == (4096, 3200)
    assert max(decoded.bgr.shape[:2]) <= 512


def test_explicit_limits_are_honored(settings):
    for name, value in (("max_upload_bytes", 10), ("max_pixels", 100)):
        limited = replace(settings, **{name: value})
        with pytest.raises(HTTPException) as exc:
            decode_image(photo(50, 60), limited)
        assert exc.value.status_code == 413


def test_broken_image_returns_422(settings):
    with pytest.raises(HTTPException) as exc:
        decode_image(b"not a valid photo", settings)
    assert exc.value.status_code == 422


def test_empty_image_returns_422(settings):
    with pytest.raises(HTTPException) as exc:
        decode_image(b"", settings)
    assert exc.value.status_code == 422


def test_bgr_pixel_order(settings):
    decoded = decode_image(photo(15, 10), settings)
    assert tuple(decoded.bgr[0, 0]) == (32, 0, 128)
