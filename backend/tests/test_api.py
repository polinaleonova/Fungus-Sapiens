from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.detector import RawDetection
from app.main import create_app


class FakeDetector:
    device = "cuda:0"

    def predict(self, array):
        height, width = array.shape[:2]
        return [RawDetection(
            x1=width * 0.25, y1=height * 0.5,
            x2=width * 0.75, y2=height * 0.875,
            label="Mushroom", confidence=0.91,
        )]


def image_payload(width=2000, height=1000, fmt="PNG") -> bytes:
    stream = BytesIO()
    Image.new("RGB", (width, height), "gray").save(stream, fmt)
    return stream.getvalue()


def test_api_shape_and_normalization_match_legacy_mobile_client(settings):
    app = create_app(detector_factory=FakeDetector, settings=settings)
    with TestClient(app) as client:
        response = client.post(
            "/detect", files={"file": ("wide.png", image_payload(), "image/png")}
        )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["width"] == 2000 and result["height"] == 1000
    assert result["device"] == "cuda:0"
    assert result["inference_ms"] >= 0
    assert result["frame_id"]
    assert result["detections"] == [
        {"id": "mushroom-1", "x1": 0.25, "y1": 0.5,
         "x2": 0.75, "y2": 0.875,
         "label": "Mushroom", "confidence": 0.91}
    ]


def test_api_allows_octet_stream_and_landscape(settings):
    app = create_app(detector_factory=FakeDetector, settings=settings)
    with TestClient(app) as client:
        response = client.post(
            "/detect",
            files={"file": ("portrait", image_payload(300, 900, "JPEG"), "application/octet-stream")},
        )
    assert response.status_code == 200
    assert response.json()["width"] == 300
    assert response.json()["height"] == 900


def test_api_rejects_garbage_and_unsupported_type(settings):
    app = create_app(detector_factory=FakeDetector, settings=settings)
    with TestClient(app) as client:
        bad = client.post("/detect", files={"file": ("bad.png", b"garbage", "image/png")})
        wrong = client.post("/detect", files={"file": ("bad.txt", b"hello", "text/plain")})
    assert bad.status_code == 422
    assert wrong.status_code == 415
