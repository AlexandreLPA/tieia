"""Face detection microservice using MediaPipe.

Accepts a video file, samples frames at regular intervals, detects faces
in each frame, and returns face bounding boxes with timestamps. Used for
auto-reframe (16:9 → 9:16) by centering on the active speaker's face.
"""

import json
import logging
import os
import subprocess
import uuid
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="TiêIA Face Detection Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Initialize MediaPipe face detection (lazy)
_detector = None


class _MediaPipeDetector:
    name = "mediapipe-face-detection"

    def __init__(self) -> None:
        self._detector = mp.solutions.face_detection.FaceDetection(
            model_selection=1,  # 1 = full range (better for far faces)
            min_detection_confidence=0.5,
        )

    def detect(self, frame) -> list[dict]:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self._detector.process(rgb)
        faces = []
        for det in result.detections or []:
            bbox = det.location_data.relative_bounding_box
            faces.append({
                "x": round(float(bbox.xmin), 4),
                "y": round(float(bbox.ymin), 4),
                "width": round(float(bbox.width), 4),
                "height": round(float(bbox.height), 4),
                "confidence": round(float(det.score[0]), 3),
            })
        return faces


class _HaarDetector:
    """OpenCV's bundled frontal-face cascade: no model download needed."""

    name = "opencv-haar-frontalface"

    def __init__(self) -> None:
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self._cascade = cv2.CascadeClassifier(path)
        if self._cascade.empty():
            raise RuntimeError(f"Cannot load face cascade: {path}")

    def detect(self, frame) -> list[dict]:
        height, width = frame.shape[:2]
        gray = cv2.equalizeHist(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        min_side = max(24, int(min(width, height) * 0.06))
        boxes, _, weights = self._cascade.detectMultiScale3(
            gray,
            scaleFactor=1.1,
            minNeighbors=6,
            minSize=(min_side, min_side),
            outputRejectLevels=True,
        )
        faces = []
        for (x, y, w, h), weight in zip(boxes, weights):
            faces.append({
                "x": round(x / width, 4),
                "y": round(y / height, 4),
                "width": round(w / width, 4),
                "height": round(h / height, 4),
                # Cascade weights aren't probabilities; squash to 0-1
                "confidence": round(float(min(1.0, max(0.0, weight / 10))), 3),
            })
        return faces


def _get_detector():
    """MediaPipe when it still ships the legacy `solutions` API (removed in
    0.10.30+, which broke every detection); OpenCV's cascade otherwise."""
    global _detector
    if _detector is None:
        if hasattr(mp, "solutions"):
            _detector = _MediaPipeDetector()
        else:
            logger.warning("mediapipe %s has no solutions API; using OpenCV face cascade", mp.__version__)
            _detector = _HaarDetector()
    return _detector


def _get_video_info(path: str) -> dict:
    """Get video duration and dimensions via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    data = json.loads(proc.stdout)
    duration = float(data.get("format", {}).get("duration", 0))
    width, height = 0, 0
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = int(stream.get("width", 0))
            height = int(stream.get("height", 0))
            break
    return {"duration": duration, "width": width, "height": height}


def _detect_faces_in_video(
    video_path: str,
    sample_interval: float = 1.0,
    max_samples: int = 120,
) -> list[dict]:
    """Sample frames from a video and detect faces in each.

    Returns a list of:
    {
        "timestamp": float,
        "faces": [{"x": float, "y": float, "width": float, "height": float, "confidence": float}]
    }

    Coordinates are normalized 0-1 relative to frame dimensions.
    """
    detector = _get_detector()
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    frame_interval = int(fps * sample_interval)

    results = []
    frame_idx = 0
    sample_count = 0

    while cap.isOpened() and sample_count < max_samples:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break

        timestamp = frame_idx / fps
        faces = detector.detect(frame)

        results.append({
            "timestamp": round(timestamp, 2),
            "faces": faces,
        })

        frame_idx += frame_interval
        sample_count += 1

    cap.release()
    return results


@app.get("/health")
async def health():
    try:
        detector_name = _get_detector().name
        model_loaded = True
    except Exception:
        detector_name = "mediapipe-face-detection"
        model_loaded = False

    return {
        "service": "face-detection",
        "status": "running",
        "model": {
            "loaded": model_loaded,
            "name": detector_name,
            "installed": model_loaded,
        },
        "version": "0.1.0",
    }


@app.post("/detect")
async def detect_faces(
    file: UploadFile = File(...),
    sample_interval: float = Form(default=1.0),
    max_samples: int = Form(default=120),
):
    """Detect faces in a video file.

    Samples frames at `sample_interval` seconds and returns face bounding
    boxes (normalized 0-1) for each sampled frame.

    Returns:
    {
        "frames": [{"timestamp": float, "faces": [{"x", "y", "width", "height", "confidence"}]}],
        "video_width": int,
        "video_height": int,
        "duration": float,
        "total_faces_detected": int
    }
    """
    ext = Path(file.filename or "video.mp4").suffix.lower()
    upload_id = uuid.uuid4().hex[:8]
    upload_path = str(UPLOAD_DIR / f"face_{upload_id}{ext}")

    contents = await file.read()
    with open(upload_path, "wb") as f:
        f.write(contents)

    try:
        info = _get_video_info(upload_path)
        frames = _detect_faces_in_video(
            upload_path,
            sample_interval=sample_interval,
            max_samples=max_samples,
        )

        total_faces = sum(len(f["faces"]) for f in frames)

        return {
            "frames": frames,
            "video_width": info["width"],
            "video_height": info["height"],
            "duration": info["duration"],
            "total_faces_detected": total_faces,
        }

    except Exception as e:
        logger.exception("Face detection failed")
        raise HTTPException(status_code=500, detail=f"Face detection failed: {str(e)}")
    finally:
        if os.path.exists(upload_path):
            try:
                os.remove(upload_path)
            except OSError:
                pass
