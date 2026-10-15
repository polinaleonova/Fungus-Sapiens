from __future__ import annotations

from types import SimpleNamespace
import sys

import numpy as np
import pytest

from app.detector import YoloOiv7Detector, resolve_class_ids


def test_resolves_real_oiv7_mushroom_id_case_insensitive():
    names = {0: "Accordion", 347: "Mushroom", 348: "Musical instrument"}
    assert resolve_class_ids(names, ["mUsHrOoM"]) == [347]
    assert resolve_class_ids(names, ["Mushroom", "Accordion"]) == [0, 347]


def test_wrong_model_or_world_prompt_rejected():
    with pytest.raises(ValueError, match="no OIV7 class"):
        resolve_class_ids({0: "person", 1: "car"}, ["Mushroom"])
    with pytest.raises(ValueError, match="no OIV7 class"):
        resolve_class_ids({347: "Mushroom"}, ["wild mushroom"])


def test_detector_passes_actual_class_ids_to_predict(monkeypatch, settings):
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(torch.cuda, "device_count", lambda: 1)
    monkeypatch.setattr(torch.cuda, "get_device_name", lambda _: "Fake NVIDIA GPU")
    monkeypatch.setattr(torch.cuda, "synchronize", lambda _: None)

    class MockTensor:
        def __init__(self, values):
            self.values = values

        def detach(self):
            return self

        def cpu(self):
            return self

        def tolist(self):
            return self.values

    class MockBoxes:
        xyxy = MockTensor([[10, 20, 110, 220]])
        conf = MockTensor([0.91])
        cls = MockTensor([347])

        def __len__(self):
            return 1

    class FakeYOLO:
        def __init__(self, model_name):
            self.weights = model_name
            self.names = {347: "Mushroom", 381: "Person"}
            self.calls = []

        def to(self, device):
            self.device = device
            return self

        def predict(self, source, **kwargs):
            self.calls.append(kwargs)
            return [SimpleNamespace(boxes=MockBoxes(), names=self.names)]

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=FakeYOLO))
    detector = YoloOiv7Detector(settings)
    assert detector.class_ids == [347]
    found = detector.predict(np.zeros((320, 500, 3), dtype=np.uint8))
    assert len(found) == 1
    assert found[0].label == "Mushroom"
    assert found[0].x1 == 10
    assert all(call["classes"] == [347] for call in detector.model.calls)
    assert all(call["rect"] is True for call in detector.model.calls)
