import asyncio
import json
import threading
from datetime import datetime, timedelta
from pathlib import Path
from time import monotonic
from uuid import uuid4

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload

from ai.people_count_alert import MODEL_DIR, MODEL_PATH, process_video
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
JOB_RETENTION = timedelta(hours=6)
LIVE_PREVIEW_INTERVAL_SECONDS = 0.75
LIVE_PREVIEW_FILES_TO_KEEP = 6
PRESET_CONFIGS = {
    "fast": {
        "label": "Fast",
        "description": "Quicker review with fewer processed frames.",
        "confidence": 0.45,
        "frame_skip": 4,
        "preprocess_mode": "off",
    },
    "balanced": {
        "label": "Balanced",
        "description": "Best general-purpose mode for most test videos.",
        "confidence": 0.35,
        "frame_skip": 3,
        "preprocess_mode": "auto",
    },
    "accurate": {
        "label": "Accurate",
        "description": "Processes more frames and applies mild cleanup for difficult videos.",
        "confidence": 0.28,
        "frame_skip": 1,
        "preprocess_mode": "auto",
    },
}


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


def list_available_models():
    models = []
    for path in sorted(MODEL_DIR.glob("*.pt")):
        size_mb = round(path.stat().st_size / 1024 / 1024, 2)
        models.append(
            {
                "id": path.name,
                "label": path.stem,
                "size_mb": size_mb,
                "is_default": path.name == MODEL_PATH.name,
            }
        )

    if not models and MODEL_PATH.exists():
        models.append(
            {
                "id": MODEL_PATH.name,
                "label": MODEL_PATH.stem,
                "size_mb": round(MODEL_PATH.stat().st_size / 1024 / 1024, 2),
                "is_default": True,
            }
        )

    return models


def analyze_video_quality(video_path: Path):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return {
            "resolution": None,
            "fps": None,
            "duration_seconds": None,
            "brightness_score": None,
            "sharpness_score": None,
            "reliability": "unknown",
            "reliability_score": 0,
            "issues": ["unreadable_video"],
            "message": "The uploaded video could not be analyzed before processing.",
            "recommended_preset": "accurate",
        }

    try:
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration_seconds = round(total_frames / fps, 2) if fps > 0 and total_frames > 0 else None

        sample_count = min(10, total_frames) if total_frames > 0 else 10
        brightness_samples = []
        sharpness_samples = []

        for index in range(max(sample_count, 1)):
            if total_frames > 0:
                frame_index = int((index / max(sample_count - 1, 1)) * max(total_frames - 1, 0))
                capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)

            ok, frame = capture.read()
            if not ok or frame is None:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness_samples.append(float(gray.mean()))
            sharpness_samples.append(float(cv2.Laplacian(gray, cv2.CV_64F).var()))

        brightness = round(sum(brightness_samples) / len(brightness_samples), 2) if brightness_samples else None
        sharpness = round(sum(sharpness_samples) / len(sharpness_samples), 2) if sharpness_samples else None

        issues = []
        if width and height and (width < 960 or height < 540):
            issues.append("low_resolution")
        if brightness is not None and brightness < 75:
            issues.append("low_light")
        elif brightness is not None and brightness < 105:
            issues.append("dim")
        if sharpness is not None and sharpness < 75:
            issues.append("blurry")
        if fps and fps > 45:
            issues.append("high_fps")

        score = 100
        penalties = {
            "low_resolution": 24,
            "low_light": 24,
            "dim": 10,
            "blurry": 22,
            "high_fps": 6,
            "unreadable_video": 100,
        }
        for issue in issues:
            score -= penalties.get(issue, 0)
        score = max(5, score)

        if score >= 80:
            reliability = "high"
            message = "Input quality looks good for reliable crowd counting."
            recommended_preset = "balanced"
        elif score >= 58:
            reliability = "medium"
            message = "The video is usable, but conditions may soften detection quality."
            recommended_preset = "balanced" if "blurry" not in issues else "accurate"
        else:
            reliability = "low"
            message = "This video is challenging. Expect weaker counting and use accurate mode."
            recommended_preset = "accurate"

        if "high_fps" in issues and recommended_preset == "balanced":
            recommended_preset = "fast"

        return {
            "resolution": {"width": width, "height": height},
            "fps": round(fps, 2) if fps else None,
            "duration_seconds": duration_seconds,
            "brightness_score": brightness,
            "sharpness_score": sharpness,
            "reliability": reliability,
            "reliability_score": score,
            "issues": issues,
            "message": message,
            "recommended_preset": recommended_preset,
        }
    finally:
        capture.release()


def resolve_processing_profile(preset: str, quality_assessment: dict | None):
    selected = PRESET_CONFIGS.get(preset, PRESET_CONFIGS["balanced"]).copy()
    issues = set((quality_assessment or {}).get("issues", []))

    if selected["preprocess_mode"] == "auto" and not issues:
        selected["preprocess_mode"] = "off"

    if preset == "balanced":
        if {"low_light", "blurry"} & issues:
            selected["confidence"] = 0.3
            selected["frame_skip"] = 2
            selected["preprocess_mode"] = "auto"
        if "low_resolution" in issues:
            selected["confidence"] = 0.26
            selected["frame_skip"] = 1
    elif preset == "fast" and "low_resolution" in issues:
        selected["frame_skip"] = 3
    elif preset == "accurate":
        selected["confidence"] = min(selected["confidence"], 0.28)
        selected["frame_skip"] = 1

    return selected


def extract_snapshot_filename(payload: dict | None):
    if not payload:
        return None

    snapshot_url = payload.get("snapshot_url")
    if snapshot_url:
        return Path(str(snapshot_url)).name

    snapshot_path = payload.get("snapshot_path")
    if snapshot_path:
        return Path(str(snapshot_path)).name

    snapshot_urls = payload.get("snapshot_urls") or []
    if snapshot_urls:
        return Path(str(snapshot_urls[0])).name

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


def write_live_preview(job_id: str, frame) -> Path:
    LIVE_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    preview_path = LIVE_PREVIEW_DIR / f"{job_id}_{uuid4().hex[:8]}.jpg"
    cv2.imwrite(str(preview_path), frame)
    return preview_path


def cleanup_job_preview_files(job_id: str, keep_latest: int = 2):
    preview_files = sorted(
        LIVE_PREVIEW_DIR.glob(f"{job_id}_*.jpg"),
        key=lambda path: path.stat().st_mtime,
    )
    for stale_file in preview_files[:-keep_latest]:
        try:
            stale_file.unlink(missing_ok=True)
        except PermissionError:
            continue
        except OSError:
            continue


def prune_stale_jobs():
    now = datetime.utcnow()
    removable: list[str] = []

    with PROCESSING_JOBS_LOCK:
        for job_id, job in list(PROCESSING_JOBS.items()):
            finished_at = job.get("finished_at")
            if not finished_at:
                continue
            try:
                finished_dt = datetime.fromisoformat(finished_at)
            except ValueError:
                finished_dt = now
            if now - finished_dt > JOB_RETENTION:
                removable.append(job_id)
                PROCESSING_JOBS.pop(job_id, None)

    for job_id in removable:
        cleanup_job_preview_files(job_id, keep_latest=0)


def update_job(job_id: str, **updates):
    prune_stale_jobs()
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
    model_name: str,
    preprocess_mode: str,
    quality_assessment: dict | None,
    preset: str,
):
    alert_created = False
    last_preview_push = 0.0

    def on_frame(frame, stats):
        nonlocal last_preview_push
        now = monotonic()
        should_refresh_preview = (
            stats["processed_frames"] <= 1
            or now - last_preview_push >= LIVE_PREVIEW_INTERVAL_SECONDS
        )

        updates = {
            "status": "processing",
            "progress": stats,
        }

        if should_refresh_preview:
            try:
                preview_path = write_live_preview(job_id, frame)
                updates["preview_image_url"] = serialize_live_preview(preview_path)
                cleanup_job_preview_files(job_id, keep_latest=LIVE_PREVIEW_FILES_TO_KEEP)
                last_preview_push = now
            except OSError:
                pass

        update_job(job_id, **updates)

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
            model_name=model_name,
            preprocess_mode=preprocess_mode,
            quality_profile=quality_assessment,
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
            processing_profile={
                "preset": preset,
                "confidence": confidence,
                "frame_skip": frame_skip,
                "preprocess_mode": preprocess_mode,
                "model_name": model_name,
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
    finally:
        source_path.unlink(missing_ok=True)


@router.get("/latest")
def get_latest_processed_video():
    prune_stale_jobs()
    videos = [path for path in PROCESSED_VIDEO_DIR.iterdir() if path.is_file()]
    if not videos:
        return {"video": None}

    latest_video = max(videos, key=lambda path: path.stat().st_mtime)
    return {"video": serialize_video(latest_video)}


@router.get("/options")
def get_vision_options():
    return {
        "models": list_available_models(),
        "default_model": MODEL_PATH.name,
        "presets": [
            {"id": preset_id, **config}
            for preset_id, config in PRESET_CONFIGS.items()
        ],
    }


@router.get("/snapshots")
def list_saved_snapshots(limit: int = 60, db: Session = Depends(database.get_db)):
    prune_stale_jobs()
    snapshot_files = sorted(
        [path for path in SNAPSHOT_DIR.iterdir() if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )[: max(1, min(limit, 200))]

    if not snapshot_files:
        return {"snapshots": []}

    indexed_events: dict[str, dict] = {}
    recent_events = (
        db.query(models.Event)
        .options(joinedload(models.Event.camera), joinedload(models.Event.alerts))
        .order_by(models.Event.created_at.desc())
        .limit(max(limit * 5, 120))
        .all()
    )

    for event in recent_events:
        payload = event.payload or {}
        filename = extract_snapshot_filename(payload)
        if not filename or filename in indexed_events:
            continue

        alert = event.alerts[0] if event.alerts else None
        indexed_events[filename] = {
            "camera_name": event.camera.name if event.camera else None,
            "zone_name": payload.get("area_id") or "A0",
            "severity": event.severity,
            "event_type": event.event_type,
            "message": alert.message if alert else None,
            "acknowledged": alert.acknowledged if alert else False,
        }

    snapshots = []
    for path in snapshot_files:
        stat = path.stat()
        event_meta = indexed_events.get(path.name, {})
        snapshots.append(
            {
                "filename": path.name,
                "url": serialize_snapshot(path),
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "size_bytes": stat.st_size,
                "camera_name": event_meta.get("camera_name"),
                "zone_name": event_meta.get("zone_name"),
                "severity": event_meta.get("severity"),
                "event_type": event_meta.get("event_type"),
                "message": event_meta.get("message"),
                "acknowledged": event_meta.get("acknowledged", False),
            }
        )

    return {"snapshots": snapshots}


@router.get("/jobs/{job_id}")
def get_processing_job(job_id: str):
    prune_stale_jobs()
    with PROCESSING_JOBS_LOCK:
        job = PROCESSING_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Processing job not found")
        return dict(job)


@router.websocket("/jobs/{job_id}/stream")
async def stream_processing_job(websocket: WebSocket, job_id: str):
    await websocket.accept()
    last_revision = None

    try:
        while True:
            prune_stale_jobs()
            with PROCESSING_JOBS_LOCK:
                job = PROCESSING_JOBS.get(job_id)
                snapshot = dict(job) if job else None

            if snapshot is None:
                await websocket.send_json({"type": "job_missing", "job_id": job_id})
                return

            revision = (
                snapshot.get("updated_at"),
                snapshot.get("status"),
                snapshot.get("progress", {}).get("processed_frames"),
                len(snapshot.get("snapshots", [])),
            )
            if revision != last_revision:
                await websocket.send_json(
                    {
                        "type": "job_update",
                        "job": snapshot,
                    }
                )
                last_revision = revision

            if snapshot.get("status") in {"completed", "failed"}:
                return

            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        return


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
    preset: str = Form("balanced"),
    model_name: str = Form(MODEL_PATH.name),
    polygons_json: str | None = Form(None),
):
    prune_stale_jobs()
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
    quality_assessment = analyze_video_quality(source_path)
    profile = resolve_processing_profile(preset, quality_assessment)
    resolved_confidence = profile["confidence"]
    resolved_frame_skip = profile["frame_skip"]
    preprocess_mode = profile["preprocess_mode"]
    available_model_ids = {item["id"] for item in list_available_models()}
    resolved_model_name = model_name if model_name in available_model_ids else MODEL_PATH.name

    job_id = uuid4().hex
    with PROCESSING_JOBS_LOCK:
        PROCESSING_JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "message": "Crowd detection job queued",
            "source_filename": file.filename or source_path.name,
            "camera_id": camera_id,
            "crowd_limit": crowd_limit,
            "quality_assessment": quality_assessment,
            "processing_profile": {
                "preset": preset,
                "confidence": resolved_confidence,
                "frame_skip": resolved_frame_skip,
                "preprocess_mode": preprocess_mode,
                "model_name": resolved_model_name,
            },
            "preview_image_url": None,
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
            "confidence": resolved_confidence,
            "frame_skip": resolved_frame_skip,
            "polygons": polygons,
            "model_name": resolved_model_name,
            "preprocess_mode": preprocess_mode,
            "quality_assessment": quality_assessment,
            "preset": preset,
        },
        daemon=True,
        name=f"vision-job-{job_id[:8]}",
    )
    thread.start()

    return {
        "job_id": job_id,
        "status": "queued",
        "message": quality_assessment["message"],
    }
