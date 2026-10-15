# 🍄 Fungus Sapiens

**Fungus Sapiens** is a mobile application for detecting mushrooms using a smartphone camera and a **YOLOv8** computer vision model trained on the **Open Images V7 (OIV7)** class set.

The app captures camera frames, sends them to a Python server for processing on an **NVIDIA GPU (CUDA)**, and displays detected objects as bounding boxes over the camera preview.

> [!IMPORTANT]
> This project **detects** objects belonging to the `Mushroom` class; it does **not identify mushroom species**. **Do not use its results to determine whether a mushroom is edible or safe.**

## Features

- Detect mushrooms in frames captured by a smartphone camera.
- Choose a target capture rate of **1, 5, or 10 frames per second**. The actual rate depends on the camera, network, and GPU; frames are skipped while the previous one is being processed.
- Display bounding boxes with class labels and model confidence scores.
- Show statistics: captured and processed frames, actual capture rate, and inference time.
- Toggle the camera flashlight.
- Resize frames automatically before uploading and map bounding boxes correctly across different image aspect ratios.
- Handle camera errors, network errors, request timeouts, and busy GPU responses.
- Clean up temporary frame files on the phone after processing.

## Tech Stack

| Component | Technologies |
| --- | --- |
| Mobile application | React Native, Expo SDK 57, TypeScript, Expo Router |
| Camera and image preparation | `expo-camera`, `expo-image-manipulator`, `expo-file-system` |
| Backend | Python, FastAPI, Uvicorn |
| Detector | Ultralytics YOLOv8, Open Images V7 |
| Computing | CUDA-enabled PyTorch on an NVIDIA GPU |
| Image processing | Pillow, NumPy |
| Communication | HTTP, `multipart/form-data`, JSON |

## Architecture

```text
Smartphone camera (Expo / React Native)
          │
          ├─ capture a frame and resize its longest side to 1280 px
          │
          ▼
POST /detect (multipart/form-data, "file" field)
          │
          ▼
FastAPI → validate and decode the image
          │
          ▼
YOLOv8 OIV7 → NVIDIA CUDA
          │
          ▼
JSON: bounding-box coordinates, confidence, inference time
          │
          ▼
Mobile app → bounding boxes over the camera preview
```

Bounding boxes use **normalized coordinates from 0 to 1**. The server returns the image's original dimensions, corrected for EXIF orientation. The mobile app projects the boxes onto the center-cropped camera preview.

## Project Structure

```text
FungusSapiens/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py             # Settings loaded from .env
│   │   ├── detector.py           # YOLOv8 OIV7 model loading and inference
│   │   ├── images.py             # Image validation, decoding, resizing
│   │   ├── main.py               # FastAPI application and POST /detect
│   │   └── schemas.py            # API response schema and coordinates
│   ├── check_model.py            # CUDA and model verification
│   ├── requirements.txt
│   └── yolov8x-oiv7.pt           # Model weights, if stored locally
├── mobile/
│   ├── assets/
│   ├── src/
│   │   ├── app/
│   │   │   ├── _layout.tsx       # Root layout
│   │   │   ├── index.tsx         # Main screen and camera
│   │   │   └── explore.tsx
│   │   ├── components/
│   │   │   └── detection-overlay.tsx
│   │   └── lib/
│   │       ├── bbox-layout.ts    # Project boxes onto the preview
│   │       └── detection-api.ts  # Requests to the backend
│   ├── .env.example
│   ├── app.json
│   ├── package.json
│   └── package-lock.json
└── README.md                     # This file
```

## Requirements

**Backend:**

- Python and `pip` (the project does not pin a specific Python version).
- An **NVIDIA GPU** with a working driver and compatible CUDA environment.
- **CUDA-enabled PyTorch** installed.
- The `yolov8x-oiv7.pt` weights file, or the ability to download it through Ultralytics.

**Mobile app:**

- Node.js **22.13 or later** and npm (according to the mobile project's original README).
- An Android or iOS smartphone with a camera.
- A version of **Expo Go** compatible with Expo SDK 57, or a custom development build.
- Network access from the smartphone to the computer hosting the backend.

> The current detector **requires a CUDA server**: there is **no automatic CPU fallback**. Although the Expo web app may run, camera scanning is disabled in the code when `Platform.OS === 'web'`.

## Quick Start

Open **two terminals**: one for the backend and one for the mobile app. Commands below start from the `FungusSapiens/` project root.

### 1. Install and start the backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**Linux / macOS:**

```bash
source .venv/bin/activate
```

Install a **CUDA-enabled PyTorch build** compatible with your GPU and driver. Use the command provided by the [official PyTorch installer](https://pytorch.org/get-started/locally/) for your system. Then install the remaining dependencies:

```bash
python -m pip install -r requirements.txt
```

Verify CUDA support:

```bash
python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
```

Expected output: `CUDA available: True`.

If needed, place `yolov8x-oiv7.pt` inside `backend/`. By default, the server checks for a local file; if none is found, it passes the model name to Ultralytics, which may download the weights.

Check the model:

```bash
python check_model.py
```

Start the API so other devices on your local network can connect:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Swagger API documentation on your computer: <http://127.0.0.1:8000/docs>.

### 2. Configure and start the mobile app

In **another terminal**, from the project root:

```bash
cd mobile
npm ci
```

Create `mobile/.env` using `mobile/.env.example` as a template:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

Replace `192.168.1.100` with the **local IP address of the computer** running the backend. The address above is only an example. On Windows, use `ipconfig` to find your address; on Linux, use `ip addr`.

**Important:** Do not use `localhost` or `127.0.0.1` on a physical phone. Those addresses refer to the phone itself, not the backend computer. Your phone must be able to reach the computer over the network; check your firewall and port `8000` as well.

Start Expo:

```bash
npx expo start --go
```

Open the app by scanning the QR code with Expo Go (Android) or the iPhone Camera app. Grant camera permission and tap **Start Mushroom Detection** (the button's actual label may depend on the app's UI language).

If your phone cannot connect to Metro, try:

```bash
npx expo start --go --tunnel
```

Tunnel mode helps the phone connect **to Expo**, but it does **not** automatically expose your local FastAPI server to the phone. `EXPO_PUBLIC_API_URL` must still point to a reachable backend.

## Backend Configuration

You may create an optional `backend/.env` file. The following values match the defaults in the source code:

```dotenv
YOLO_MODEL=yolov8x-oiv7.pt
OIV7_CLASSES=Mushroom
YOLO_CONF=0.20
YOLO_IOU=0.50
YOLO_IMGSZ=640
YOLO_MAX_DET=25
MAX_PROCESSING_SIDE=2560
MAX_UPLOAD_BYTES=0
MAX_IMAGE_PIXELS=0
YOLO_FP16=true
CUDA_DEVICE_INDEX=0
```

| Variable | Description |
| --- | --- |
| `YOLO_MODEL` | Name of or path to the YOLOv8 OIV7 weights file. |
| `OIV7_CLASSES` | Comma-separated classes from the model's fixed vocabulary; defaults to `Mushroom`. |
| `YOLO_CONF` | Minimum detector confidence. |
| `YOLO_IOU` | Intersection-over-Union threshold for non-maximum suppression. |
| `YOLO_IMGSZ` | Model input size; at least 32 and divisible by 32. |
| `YOLO_MAX_DET` | Maximum number of detections. |
| `MAX_PROCESSING_SIDE` | Downscale the longest image side for processing; `0` disables this downscaling. |
| `MAX_UPLOAD_BYTES` | Optional uploaded-file size limit; `0` disables this application-level limit. |
| `MAX_IMAGE_PIXELS` | Optional image pixel-count limit; `0` disables this application-level limit. |
| `YOLO_FP16` | Enable half-precision processing on the GPU. |
| `CUDA_DEVICE_INDEX` | NVIDIA GPU index, starting at `0`. |

When `MAX_UPLOAD_BYTES=0` and `MAX_IMAGE_PIXELS=0`, these **additional** limits are disabled. Pillow's safety checks and any external server or network limits still apply.

> **Note:** The mobile `index.tsx` still contains comments mentioning the backend's previous 5 MB / 12 MP limits and a reference to YOLO-World. The actual backend uses **YOLOv8 OIV7**, and its former hard-coded upload limits are disabled by default.

## API

### `POST /detect`

Upload one image as `multipart/form-data` with the required field name **`file`**.

Supported formats: **JPEG, PNG, WebP, BMP, TIFF**. The server checks the actual image contents, not just the file extension.

Example request (from a terminal on the backend computer):

```bash
curl -X POST "http://127.0.0.1:8000/detect" -F "file=@example.jpg"
```

**Example response** (illustrative values):

```json
{
  "frame_id": "550e8400-e29b-41d4-a716-446655440000",
  "width": 1280,
  "height": 960,
  "detections": [
    {
      "id": "mushroom-1",
      "x1": 0.12,
      "y1": 0.25,
      "x2": 0.38,
      "y2": 0.64,
      "label": "Mushroom",
      "confidence": 0.91
    }
  ],
  "inference_ms": 48.2,
  "device": "cuda:0"
}
```

`x1`, `y1` are the top-left corner of the bounding box; `x2`, `y2` are the bottom-right corner. All box coordinates are normalized to `[0, 1]`. The `inference_ms` field measures detector execution time on the server, not the full network round-trip latency.

**API error responses:**

| HTTP | Reason |
| --- | --- |
| `413` | A configured file-size/pixel-count limit or Pillow safety limit was exceeded. |
| `415` | Unsupported MIME type or image format. |
| `422` | Empty, invalid, or corrupted image (or a standard request-validation error). |
| `429` | GPU is busy; the frame is dropped. |
| `503` | Model inference failed. |

The detector is loaded when FastAPI starts. If CUDA, the weights file, or a configured model class is unavailable, **server startup fails**.

## Development and Checks

**Mobile:**

```bash
cd mobile
npx expo lint
npx tsc --noEmit
npx expo-doctor
```

**Backend:**

```bash
cd backend
python check_model.py
```

No separate automated backend test configuration was found in the provided source files. `check_model.py` verifies model loading and GPU availability, but it does not replace functional API tests.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `CUDA available: False` | NVIDIA driver and whether you installed the CUDA-enabled PyTorch build. There is no CPU fallback. |
| Backend fails to start | Availability of `yolov8x-oiv7.pt`, correctness of `OIV7_CLASSES`, and startup logs. |
| Phone shows "Server address missing" | Make sure `mobile/.env` contains `EXPO_PUBLIC_API_URL`; restart Expo after changing environment variables. |
| Network error / 9-second timeout | Computer IP, Uvicorn running with `--host 0.0.0.0`, network reachability, and firewall settings. |
| `HTTP 429` | The GPU is processing another frame; lower the target capture rate. |
| Camera unavailable | Camera permissions, device support, and app state. |
| Expo Go cannot open the project | Compatibility between Expo Go and SDK 57; use an appropriate development build if necessary. |
| Expo dependency issues | Run `npx expo-doctor` and `npx expo install --fix`. |

## Limitations and Safety

- Detecting an object labeled `Mushroom` **does not identify its species** or determine whether it is edible, poisonous, or safe to consume.
- Capture rates of 1/5/10 frames per second are **targets**, not guarantees.
- The current backend performs **at most one GPU inference at a time**; concurrent requests may receive `429`.
- HTTP requests to the local server are unencrypted. Do not expose this server to the public internet without authentication, HTTPS, and additional security measures.
- Mobile scanning is intended for **Android and iOS** and is disabled in the web implementation.

## Useful Links

- [Expo documentation](https://docs.expo.dev/)
- [Expo Go](https://expo.dev/go)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Ultralytics](https://docs.ultralytics.com/)
- [PyTorch installation](https://pytorch.org/get-started/locally/)

---

*This README was prepared based on the `backend/` and `mobile/` source files of the Fungus Sapiens project.*
