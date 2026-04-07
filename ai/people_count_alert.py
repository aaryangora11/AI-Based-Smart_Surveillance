import csv
import json
import logging
import os
import platform
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
from kafka import KafkaProducer
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# =====================================================
# CONFIGURATION
# =====================================================
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
MODEL_PATH = BASE_DIR / "models" / "yolov8n.pt"
MODEL_DIR = MODEL_PATH.parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MEDIA_ROOT = PROJECT_ROOT / "media"
SNAPSHOT_DIR = MEDIA_ROOT / "alert_snapshots"
LOG_DIR = ARTIFACTS_DIR / "logs"

DEFAULT_CROWD_LIMIT = 4
DEFAULT_CONFIDENCE = 0.35
DEFAULT_CAMERA_ID = "7"
DEFAULT_CSV_FLUSH_BATCH = 5
DEFAULT_FRAME_SKIP = 3
STATUS_CONFIRM_FRAMES = 2

SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# =====================================================
# KAFKA SETUP
# =====================================================
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
TOPIC_NAME = "crowd_events"
KAFKA_EVENTS_ENABLED = os.getenv("ENABLE_KAFKA_EVENTS", "true").strip().lower() in {"1", "true", "yes", "on"}


def create_kafka_producer():
    if not KAFKA_EVENTS_ENABLED:
        return None

    try:
        producer = KafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda value: json.dumps(value).encode("utf-8"),
            retries=2,
            request_timeout_ms=3000,
            max_block_ms=2000,
        )
        logger.info("Kafka producer connected to %s", KAFKA_BOOTSTRAP)
        return producer
    except Exception:
        logger.warning("Kafka producer could not connect to %s. Continuing without Kafka events.", KAFKA_BOOTSTRAP)
        return None


producer = None

# =====================================================
#NOTIFICATIONS
# =====================================================
try:
    from winotify import Notification, audio
except Exception:
    Notification = None
    audio = None


def notify(title, message, severity="info", beep=False):
    def _send():
        try:
            if Notification:
                note = Notification(app_id="Crowd Detector", title=title, msg=message)
                if severity == "orange" and hasattr(audio, "Reminder"):
                    note.set_audio(audio.Reminder, loop=False)
                elif severity == "red" and hasattr(audio, "Default"):
                    note.set_audio(audio.Default, loop=False)
                note.show()
        except Exception:
            pass

        if beep and platform.system() == "Windows":
            try:
                import winsound

                winsound.Beep(1000, 400)
            except Exception:
                pass

    threading.Thread(target=_send, daemon=True).start()


# =====================================================
# HELPERS
# =====================================================
def ist_now_str():
    ist = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist).strftime("%Y-%m-%d %I:%M:%S %p IST")


def point_in_poly(point, polygon):
    return cv2.pointPolygonTest(np.array(polygon, np.int32), (float(point[0]), float(point[1])), False) >= 0


def detection_anchor(x1, y1, x2, y2):
    # Foot-point anchors are more reliable for zone occupancy than box centers.
    return int((x1 + x2) / 2), int(y2 - max(2, (y2 - y1) * 0.08))


def create_full_frame_polygon(frame_width, frame_height):
    return [(0, 0), (frame_width - 1, 0), (frame_width - 1, frame_height - 1), (0, frame_height - 1)]


def ensure_polygons(polygons, frame_width, frame_height):
    if polygons:
        return polygons

    return [create_full_frame_polygon(frame_width, frame_height)]


def save_snapshot(frame, polygons, camera_id, area_index, count, limit):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_name = f"camera{camera_id}_A{area_index}_crowded_{timestamp}.jpg"
    file_path = SNAPSHOT_DIR / file_name

    overlay = frame.copy()
    cv2.polylines(overlay, [np.array(polygons[area_index], np.int32)], True, (0, 0, 255), 3)
    cv2.putText(
        overlay,
        f"Area A{area_index} Overcrowded ({count}/{limit})",
        (30, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 0, 255),
        3,
    )

    cv2.imwrite(str(file_path), overlay)
    return str(file_path)


def publish_crowd_event(camera_id, area_id, count, limit, status, snapshot_path=None):
    global producer

    event = {
        "timestamp": ist_now_str(),
        "camera_id": camera_id,
        "area_id": f"A{area_id}",
        "crowd_count": count,
        "limit": limit,
        "status": status,
        "snapshot_path": snapshot_path or "",
        "event_type": "crowd_alert",
    }

    if not producer:
        producer = create_kafka_producer()
        if not producer:
            return

    try:
        producer.send(TOPIC_NAME, event)
        producer.flush()
    except Exception:
        producer = None


@dataclass
class DetectionArtifacts:
    output_video: Path
    csv_log: Path
    snapshots: list[str]
    total_frames: int
    processed_frames: int
    max_count: int


def create_video_writer(output_video: Path, fps: float, frame_width: int, frame_height: int):
    codec_candidates = ["avc1", "H264", "mp4v"]

    for codec in codec_candidates:
        writer = cv2.VideoWriter(
            str(output_video),
            cv2.VideoWriter_fourcc(*codec),
            fps,
            (frame_width, frame_height),
        )
        if writer.isOpened():
            logger.info("Video writer using codec %s for %s", codec, output_video.name)
            return writer
        writer.release()

    raise RuntimeError(f"Unable to create output video at {output_video}")


def resolve_model_path(model_name: str | None):
    if not model_name:
        return MODEL_PATH

    candidate = MODEL_DIR / model_name
    if candidate.exists():
        return candidate

    explicit = Path(model_name)
    if explicit.exists():
        return explicit

    return MODEL_PATH


def preprocess_frame(frame, preprocess_mode="off", quality_profile=None):
    if preprocess_mode == "off":
        return frame

    quality_profile = quality_profile or {}
    issues = set(quality_profile.get("issues", []))
    auto_mode = preprocess_mode == "auto"
    apply_low_light = preprocess_mode == "mild" or (auto_mode and {"low_light", "dim"} & issues)
    apply_sharpen = preprocess_mode == "mild" or (auto_mode and {"blurry", "low_resolution"} & issues)

    processed = frame.copy()

    if apply_low_light:
        lab = cv2.cvtColor(processed, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_channel = clahe.apply(l_channel)
        processed = cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

    if apply_sharpen:
        blurred = cv2.GaussianBlur(processed, (0, 0), 2.2)
        processed = cv2.addWeighted(processed, 1.22, blurred, -0.22, 0)

    return processed


def draw_overlays(frame, polygons, area_limits, last_status, counts):
    for area_index, polygon in enumerate(polygons):
        points = np.array(polygon, np.int32).reshape((-1, 1, 2))

        state = last_status.get(area_index, "green")
        color = (0, 255, 0) if state == "green" else (0, 165, 255) if state == "orange" else (0, 0, 255)
        label = "Normal" if state == "green" else "Limit Reached" if state == "orange" else "Overcrowded"

        cv2.polylines(frame, [points], True, color, 2)

        center_x = int(np.mean([point[0] for point in polygon]))
        center_y = int(np.mean([point[1] for point in polygon]))

        cv2.putText(
            frame,
            f"A{area_index}: {counts[area_index]}/{area_limits[area_index]}",
            (center_x - 50, center_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2,
        )
        cv2.putText(
            frame,
            label,
            (center_x - 50, center_y + 26),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )


def process_video(
    source,
    output_video_path,
    crowd_limit=DEFAULT_CROWD_LIMIT,
    confidence=DEFAULT_CONFIDENCE,
    camera_id=DEFAULT_CAMERA_ID,
    frame_skip=DEFAULT_FRAME_SKIP,
    polygons=None,
    show_preview=False,
    publish_events=True,
    save_snapshots=True,
    frame_callback=None,
    status_callback=None,
    model_name=None,
    preprocess_mode="off",
    quality_profile=None,
):
    source_path = str(source)
    output_video = Path(output_video_path)
    output_video.parent.mkdir(parents=True, exist_ok=True)

    resolved_model_path = resolve_model_path(model_name)
    if not resolved_model_path.exists():
        raise FileNotFoundError(f"YOLO model not found at {resolved_model_path}")

    model = YOLO(str(resolved_model_path))
    capture = cv2.VideoCapture(source_path)
    if not capture.isOpened():
      raise RuntimeError("Unable to open video source.")

    frame_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    frame_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
    fps = capture.get(cv2.CAP_PROP_FPS) or 20.0
    capture.release()

    active_polygons = ensure_polygons(polygons, frame_width, frame_height)
    area_limits = [crowd_limit for _ in active_polygons]
    last_status = {area_index: "green" for area_index in range(len(active_polygons))}
    pending_status = {area_index: None for area_index in range(len(active_polygons))}
    pending_hits = {area_index: 0 for area_index in range(len(active_polygons))}
    last_counts = [0 for _ in active_polygons]

    csv_log_path = LOG_DIR / f"camera_{camera_id}_alerts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    snapshots: list[str] = []
    csv_buffer = []
    total_frames = 0
    processed_frames = 0
    max_count = 0

    writer = create_video_writer(output_video, fps, frame_width, frame_height)

    with csv_log_path.open("w", newline="") as file:
        csv.writer(file).writerow(["timestamp", "camera_id", "area", "count", "status", "limit"])

    stream = model.track(source=source_path, conf=confidence, classes=[0], stream=True)

    try:
        for result in stream:
            total_frames += 1
            frame = result.orig_img.copy()
            display_frame = preprocess_frame(frame, preprocess_mode=preprocess_mode, quality_profile=quality_profile)

            if total_frames % frame_skip != 0:
                draw_overlays(display_frame, active_polygons, area_limits, last_status, last_counts)
                writer.write(display_frame)
                if frame_callback:
                    frame_callback(
                        display_frame.copy(),
                        {
                            "total_frames": total_frames,
                            "processed_frames": processed_frames,
                            "max_count": max_count,
                        },
                    )
                if show_preview:
                    cv2.imshow("Crowd Detection", display_frame)
                if show_preview and cv2.waitKey(1) & 0xFF == ord("q"):
                    break
                continue

            processed_frames += 1
            timestamp = ist_now_str()
            boxes = getattr(result, "boxes", None)
            centers = []

            if boxes is not None and len(boxes) > 0:
                xyxy = boxes.xyxy.cpu().numpy().astype(int)
                for (x1, y1, x2, y2) in xyxy:
                    anchor_x, anchor_y = detection_anchor(x1, y1, x2, y2)
                    centers.append((anchor_x, anchor_y))
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                    cv2.circle(display_frame, (anchor_x, anchor_y), 4, (255, 255, 255), -1)

            counts = []
            for area_index, polygon in enumerate(active_polygons):
                count = sum(point_in_poly(point, polygon) for point in centers)
                max_count = max(max_count, count)
                limit = area_limits[area_index]
                status = "green" if count < limit else "orange" if count == limit else "red"
                counts.append(count)
                last_counts[area_index] = count
                stable_status = last_status.get(area_index)

                if stable_status == status:
                    pending_status[area_index] = None
                    pending_hits[area_index] = 0
                    continue

                if pending_status[area_index] == status:
                    pending_hits[area_index] += 1
                else:
                    pending_status[area_index] = status
                    pending_hits[area_index] = 1

                if pending_hits[area_index] < STATUS_CONFIRM_FRAMES:
                    continue

                last_status[area_index] = status
                pending_status[area_index] = None
                pending_hits[area_index] = 0
                snapshot = ""
                status_text = "Normal" if status == "green" else "Limit Reached" if status == "orange" else "Overcrowded"

                print(
                    f"\n[EVENT] {timestamp} | Camera {camera_id} | "
                    f"Area A{area_index} -> {status_text} ({count}/{limit})"
                )

                if status == "orange":
                    notify("Limit Reached", f"Camera {camera_id} - Area A{area_index}: {count}/{limit}", "orange")
                    if publish_events:
                        publish_crowd_event(camera_id, area_index, count, limit, "Limit Reached")
                elif status == "red":
                    notify("Overcrowded", f"Camera {camera_id} - Area A{area_index}: {count}/{limit}", "red", beep=True)
                    if save_snapshots:
                        snapshot = save_snapshot(display_frame, active_polygons, camera_id, area_index, count, limit)
                        snapshots.append(snapshot)
                    if publish_events:
                        publish_crowd_event(camera_id, area_index, count, limit, "Overcrowded", snapshot)

                if status_callback:
                    status_callback(
                        {
                            "timestamp": timestamp,
                            "camera_id": camera_id,
                            "area_index": area_index,
                            "count": count,
                            "limit": limit,
                            "status": status,
                            "status_text": status_text,
                            "snapshot_path": snapshot or None,
                        }
                    )

                csv_buffer.append([timestamp, camera_id, area_index, count, status_text, limit])

            draw_overlays(display_frame, active_polygons, area_limits, last_status, counts)
            writer.write(display_frame)
            if frame_callback:
                frame_callback(
                    display_frame.copy(),
                    {
                        "total_frames": total_frames,
                        "processed_frames": processed_frames,
                        "max_count": max_count,
                    },
                )

            if len(csv_buffer) >= DEFAULT_CSV_FLUSH_BATCH:
                with csv_log_path.open("a", newline="") as file:
                    csv.writer(file).writerows(csv_buffer)
                csv_buffer.clear()

            if show_preview:
                cv2.imshow("Crowd Detection", display_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        if csv_buffer:
            with csv_log_path.open("a", newline="") as file:
                csv.writer(file).writerows(csv_buffer)

        writer.release()
        if show_preview:
            cv2.destroyAllWindows()

    return DetectionArtifacts(
        output_video=output_video,
        csv_log=csv_log_path,
        snapshots=snapshots,
        total_frames=total_frames,
        processed_frames=processed_frames,
        max_count=max_count,
    )


def run(source):
    output_name = f"crowd_detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
    output_video = ARTIFACTS_DIR / output_name
    result = process_video(source, output_video, show_preview=True)
    print(f"Detection finished. Alerts saved in {result.csv_log}")
    print(f"Processed video saved in {result.output_video}")


if __name__ == "__main__":
    print("Choose source:")
    print("1. Video file")
    print("2. RTSP/HTTP stream")
    choice = input("Enter (1/2): ").strip()

    if choice == "1":
        source = input("Enter video path: ").strip()
        if not source:
            print("A source video path is required.")
            raise SystemExit(1)
    elif choice == "2":
        source = input("Enter stream URL: ").strip()
    else:
        print("Invalid choice")
        raise SystemExit(1)

    run(source)
