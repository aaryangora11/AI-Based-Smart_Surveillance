import json
import threading
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ai.people_count_alert import process_video
from app import database, models

MEDIA_ROOT = Path("media")
SOURCE_VIDEO_DIR = MEDIA_ROOT / "source_videos"
PROCESSED_VIDEO_DIR = MEDIA_ROOT / "processed_videos"
PROCESSED_PREVIEW_DIR = MEDIA_ROOT / "processed_previews"
LIVE_PREVIEW_DIR = MEDIA_ROOT / "live_previews"
SNAPSHOT_DIR = MEDIA_ROOT / "alert_snapshots"
SOURCE_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
LIVE_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(tags=["Vision"])

ALLOWED_VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
PROCESSING_JOBS: dict[str, dict] = {}
PROCESSING_JOBS_LOCK = threading.Lock()


def serialize_video(path: Path):
    stat = path.stat()
    preview_path = PROCESSED_PREVIEW_DIR / f"{path.stem}.jpg"
    return {
        "filename": path.name,
        "video_url": f"/media/processed_videos/{path.name}",
        "thumbnail_url": f"/media/processed_previews/{preview_path.name}" if preview_path.exists() else None,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "size_bytes": stat.st_size,
    }


def serialize_snapshot(snapshot_path: str | Path):
    path = Path(snapshot_path)
    return f"/media/alert_snapshots/{path.name}"


def serialize_live_preview(preview_path: Path | None):
    if preview_path and preview_path.exists():
        return f"/media/live_previews/{preview_path.name}"
    return None


def generate_video_preview(video_path: Path):
    preview_path = PROCESSED_PREVIEW_DIR / f"{video_path.stem}.jpg"
    capture = cv2.VideoCapture(str(video_path))

    if not capture.isOpened():
        return None

    try:
        frame_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        target_index = min(max(frame_total // 6, 0), max(frame_total - 1, 0))
        if target_index > 0:
            capture.set(cv2.CAP_PROP_POS_FRAMES, target_index)

        ok, frame = capture.read()
        if not ok or frame is None:
            capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = capture.read()

        if ok and frame is not None:
            cv2.imwrite(str(preview_path), frame)
            return preview_path
    finally:
        capture.release()

    return None


def get_or_create_ai_site(db: Session):
    site = db.query(models.Site).filter(models.Site.name == "AI Monitoring Hub").first()
    if site:
        return site

    site = models.Site(name="AI Monitoring Hub")
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def get_or_create_camera(db: Session, camera_label: str):
    numeric_camera_id = int(camera_label) if str(camera_label).isdigit() else None

    camera = None
    if numeric_camera_id is not None:
        camera = db.query(models.Camera).filter(models.Camera.id == numeric_camera_id).first()

    if camera is None:
        camera = db.query(models.Camera).filter(models.Camera.name == f"Camera {camera_label}").first()

    if camera:
        return camera

    site = get_or_create_ai_site(db)
    camera = models.Camera(name=f"Camera {camera_label}", site_id=site.id)
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera


def build_payload(camera_label: str, source_filename: str, crowd_limit: int, artifacts, snapshot_urls: list[str]):
    max_count = artifacts.max_count
    if max_count > crowd_limit:
        severity = "high"
        event_type = "crowd_alert"
        message = f"Overcrowding detected on Camera {camera_label}: {max_count}/{crowd_limit}"
        priority = "high"
    elif max_count == crowd_limit:
        severity = "medium"
        event_type = "crowd_alert"
        message = f"Crowd limit reached on Camera {camera_label}: {max_count}/{crowd_limit}"
        priority = "medium"
    else:
        severity = "low"
        event_type = "crowd_monitoring"
        message = f"Crowd levels normal on Camera {camera_label}: {max_count}/{crowd_limit}"
        priority = None

    payload = {
        "timestamp": datetime.utcnow().isoformat(),
        "camera_label": camera_label,
        "source_filename": source_filename,
        "crowd_count": max_count,
        "limit": crowd_limit,
        "status": "overcrowded" if severity == "high" else "limit_reached" if severity == "medium" else "normal",
        "processed_frames": artifacts.processed_frames,
        "total_frames": artifacts.total_frames,
        "processed_video_url": f"/media/processed_videos/{artifacts.output_video.name}",
        "snapshot_url": snapshot_urls[0] if snapshot_urls else None,
        "snapshot_urls": snapshot_urls,
        "csv_log": str(artifacts.csv_log),
        "area_id": "A0",
    }
    return severity, event_type, message, priority, payload


def persist_detection_run(
    db: Session,
    camera_label: str,
    crowd_limit: int,
    source_filename: str,
    artifacts,
    create_alert: bool = True,
):
    camera = get_or_create_camera(db, camera_label)
    snapshot_urls = [serialize_snapshot(path) for path in artifacts.snapshots]
    severity, event_type, message, priority, payload = build_payload(
        camera_label, source_filename, crowd_limit, artifacts, snapshot_urls
    )

    event = models.Event(
        camera_id=camera.id,
        event_type=event_type,
        severity=severity,
        payload=payload,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    alert = None
    if create_alert and priority:
        alert = models.Alert(
            event_id=event.id,
            message=message,
            priority=priority,
            acknowledged=False,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

    return event, alert, snapshot_urls


def persist_live_status_event(
    db: Session,
    camera_label: str,
    source_filename: str,
    output_video_path: Path,
    status_event: dict,
):
    camera = get_or_create_camera(db, camera_label)
    severity = "high" if status_event["status"] == "red" else "medium" if status_event["status"] == "orange" else "low"
    priority = "high" if severity == "high" else "medium" if severity == "medium" else None
    snapshot_url = serialize_snapshot(status_event["snapshot_path"]) if status_event.get("snapshot_path") else None
    payload = {
        "timestamp": status_event["timestamp"],
        "camera_label": camera_label,
        "source_filename": source_filename,
        "crowd_count": status_event["count"],
        "limit": status_event["limit"],
        "status": status_event["status_text"],
        "processed_video_url": f"/media/processed_videos/{output_video_path.name}",
        "snapshot_path": status_event.get("snapshot_path"),
        "snapshot_url": snapshot_url,
        "area_id": f"A{status_event['area_index']}",
    }

    event = models.Event(
        camera_id=camera.id,
        event_type="crowd_alert",
        severity=severity,
        payload=payload,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    alert = None
    if priority:
        message = (
            f"{status_event['status_text']} on {camera.name} in A{status_event['area_index']}: "
            f"{status_event['count']}/{status_event['limit']}"
        )
        alert = models.Alert(
            event_id=event.id,
            message=message,
            priority=priority,
            acknowledged=False,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

    return event, alert, snapshot_url


def parse_polygons(polygons_json: str | None):
    polygons = None
    if polygons_json:
        parsed = json.loads(polygons_json)
        if not isinstance(parsed, list):
            raise ValueError("Polygon payload must be a list.")

        polygons = []
        for polygon in parsed:
            if not isinstance(polygon, list) or len(polygon) < 3:
                raise ValueError("Each polygon must contain at least 3 points.")

            normalized_polygon = []
            for point in polygon:
                if not isinstance(point, (list, tuple)) or len(point) != 2:
                    raise ValueError("Each polygon point must have x and y coordinates.")
                normalized_polygon.append((int(point[0]), int(point[1])))

            polygons.append(normalized_polygon)

    return polygons


def write_live_preview(preview_path: Path, frame):
    cv2.imwrite(str(preview_path), frame)


def update_job(job_id: str, **updates):
    with PROCESSING_JOBS_LOCK:
        job = PROCESSING_JOBS.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updated_at"] = datetime.utcnow().isoformat()


def append_job_snapshot(job_id: str, snapshot_url: str):
    with PROCESSING_JOBS_LOCK:
        job = PROCESSING_JOBS.get(job_id)
        if not job:
            return
        if snapshot_url not in job["snapshots"]:
            job["snapshots"].append(snapshot_url)
        job["updated_at"] = datetime.utcnow().isoformat()


def run_processing_job(
    job_id: str,
    source_path: Path,
    output_path: Path,
    source_filename: str,
    camera_id: str,
    crowd_limit: int,
    confidence: float,
    frame_skip: int,
    polygons,
):
    preview_path = LIVE_PREVIEW_DIR / f"{job_id}.jpg"
    alert_created = False

    def on_frame(frame, stats):
        write_live_preview(preview_path, frame)
        update_job(
            job_id,
            status="processing",
            progress=stats,
            preview_image_url=serialize_live_preview(preview_path),
        )

    def on_status_change(status_event: dict):
        nonlocal alert_created
        db = database.SessionLocal()
        try:
            _, alert, snapshot_url = persist_live_status_event(
                db=db,
                camera_label=camera_id,
                source_filename=source_filename,
                output_video_path=output_path,
                status_event=status_event,
            )
            if snapshot_url:
                append_job_snapshot(job_id, snapshot_url)
            if alert:
                alert_created = True
                update_job(job_id, alert_created=True)
        finally:
            db.close()

    try:
        artifacts = process_video(
            source=source_path,
            output_video_path=output_path,
            crowd_limit=crowd_limit,
            camera_id=camera_id,
            confidence=confidence,
            frame_skip=frame_skip,
            polygons=polygons,
            show_preview=False,
            frame_callback=on_frame,
            status_callback=on_status_change,
        )

        db = database.SessionLocal()
        try:
            event, alert, snapshot_urls = persist_detection_run(
                db=db,
                camera_label=camera_id,
                crowd_limit=crowd_limit,
                source_filename=source_filename,
                artifacts=artifacts,
                create_alert=not alert_created,
            )
        finally:
            db.close()

        generate_video_preview(artifacts.output_video)
        update_job(
            job_id,
            status="completed",
            message="Crowd detection completed successfully",
            video=serialize_video(artifacts.output_video),
            csv_log=str(artifacts.csv_log),
            snapshots=list(dict.fromkeys([*PROCESSING_JOBS[job_id]["snapshots"], *snapshot_urls])),
            polygons_used=[[list(point) for point in polygon] for polygon in (polygons or [])],
            progress={
                "total_frames": artifacts.total_frames,
                "processed_frames": artifacts.processed_frames,
                "max_count": artifacts.max_count,
            },
            event={
                "id": event.id,
                "type": event.event_type,
                "severity": event.severity,
            },
            alert_created=alert_created or alert is not None,
            finished_at=datetime.utcnow().isoformat(),
        )
    except FileNotFoundError as error:
        update_job(job_id, status="failed", error=str(error), finished_at=datetime.utcnow().isoformat())
    except Exception as error:
        update_job(
            job_id,
            status="failed",
            error=f"Vision processing failed: {error}",
            finished_at=datetime.utcnow().isoformat(),
        )


@router.get("/latest")
def get_latest_processed_video():
    videos = [path for path in PROCESSED_VIDEO_DIR.iterdir() if path.is_file()]
    if not videos:
        return {"video": None}

    latest_video = max(videos, key=lambda path: path.stat().st_mtime)
    return {"video": serialize_video(latest_video)}


@router.get("/jobs/{job_id}")
def get_processing_job(job_id: str):
    with PROCESSING_JOBS_LOCK:
        job = PROCESSING_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Processing job not found")
        return dict(job)


@router.post("/upload-video")
async def upload_processed_video(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported video type. Use mp4, webm, mov, avi, mkv.")

    safe_name = Path(file.filename or "crowd_detection_video").stem.replace(" ", "_")
    target_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{safe_name}_{uuid4().hex[:8]}{suffix}"
    target_path = PROCESSED_VIDEO_DIR / target_name

    content = await file.read()
    target_path.write_bytes(content)
    generate_video_preview(target_path)

    return {
        "message": "Processed video uploaded successfully",
        "video": serialize_video(target_path),
    }


@router.post("/process-video")
async def process_source_video(
    file: UploadFile = File(...),
    crowd_limit: int = Form(4),
    camera_id: str = Form("7"),
    confidence: float = Form(0.35),
    frame_skip: int = Form(3),
    polygons_json: str | None = Form(None),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported video type. Use mp4, webm, mov, avi, mkv.")

    try:
        polygons = parse_polygons(polygons_json)
    except (json.JSONDecodeError, ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail=f"Invalid polygon data: {error}") from error

    source_name = Path(file.filename or "source_video").stem.replace(" ", "_")
    token = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}"
    source_path = SOURCE_VIDEO_DIR / f"{token}_{source_name}{suffix}"
    output_path = PROCESSED_VIDEO_DIR / f"{token}_{source_name}_processed.mp4"

    content = await file.read()
    source_path.write_bytes(content)

    job_id = uuid4().hex
    preview_path = LIVE_PREVIEW_DIR / f"{job_id}.jpg"

    with PROCESSING_JOBS_LOCK:
        PROCESSING_JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "message": "Crowd detection job queued",
            "source_filename": file.filename or source_path.name,
            "camera_id": camera_id,
            "crowd_limit": crowd_limit,
            "preview_image_url": serialize_live_preview(preview_path),
            "video": None,
            "csv_log": None,
            "snapshots": [],
            "polygons_used": [[list(point) for point in polygon] for polygon in (polygons or [])],
            "progress": {
                "total_frames": 0,
                "processed_frames": 0,
                "max_count": 0,
            },
            "event": None,
            "alert_created": False,
            "error": None,
            "started_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "finished_at": None,
        }

    thread = threading.Thread(
        target=run_processing_job,
        kwargs={
            "job_id": job_id,
            "source_path": source_path,
            "output_path": output_path,
            "source_filename": file.filename or source_path.name,
            "camera_id": camera_id,
            "crowd_limit": crowd_limit,
            "confidence": confidence,
            "frame_skip": frame_skip,
            "polygons": polygons,
        },
        daemon=True,
        name=f"vision-job-{job_id[:8]}",
    )
    thread.start()

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Crowd detection started",
    }
