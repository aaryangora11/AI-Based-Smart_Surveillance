from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import database, models, schemas

router = APIRouter(tags=["Events"])
get_db = database.get_db


def get_or_create_ai_site(db: Session):
    site = db.query(models.Site).filter(models.Site.name == "AI Monitoring Hub").first()
    if site:
        return site

    site = models.Site(name="AI Monitoring Hub")
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def get_or_create_camera(db: Session, camera_label: str | int | None):
    if camera_label is None:
        camera_label = "1"

    camera_text = str(camera_label)
    numeric_camera_id = int(camera_text) if camera_text.isdigit() else None

    camera = None
    if numeric_camera_id is not None:
        camera = db.query(models.Camera).filter(models.Camera.id == numeric_camera_id).first()

    if camera is None:
        camera = db.query(models.Camera).filter(models.Camera.name == f"Camera {camera_text}").first()

    if camera:
        return camera

    site = get_or_create_ai_site(db)
    camera = models.Camera(name=f"Camera {camera_text}", site_id=site.id)
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera


def normalize_snapshot_url(payload: dict, snapshot_path: str | None = None):
    snapshot_url = payload.get("snapshot_url")
    if snapshot_url:
        return snapshot_url

    resolved_path = snapshot_path or payload.get("snapshot_path")
    if resolved_path:
        return f"/media/alert_snapshots/{Path(str(resolved_path)).name}"

    return None


def derive_severity(event: schemas.EventIn):
    if event.severity:
        return event.severity.lower()

    status = (event.status or "").strip().lower()
    if status in {"overcrowded", "red"}:
        return "high"
    if status in {"limit reached", "limit_reached", "orange"}:
        return "medium"
    return "low"


def derive_priority(severity: str):
    return "high" if severity == "high" else "medium" if severity == "medium" else None


def ingest_event_payload(db: Session, event: schemas.EventIn):
    camera = get_or_create_camera(db, event.camera_id)
    payload = dict(event.payload or {})
    snapshot_path = event.snapshot_path or payload.get("snapshot_path")
    payload.update(
        {
            "timestamp": event.timestamp or datetime.utcnow().isoformat(),
            "area_id": event.area_id or payload.get("area_id", "A0"),
            "crowd_count": event.crowd_count if event.crowd_count is not None else payload.get("crowd_count"),
            "limit": event.limit if event.limit is not None else payload.get("limit"),
            "status": event.status or payload.get("status"),
            "snapshot_path": snapshot_path,
            "snapshot_url": event.snapshot_url or normalize_snapshot_url(payload, snapshot_path),
        }
    )

    severity = derive_severity(event)
    event_type = event.event_type or "crowd_alert"
    db_event = models.Event(
        camera_id=camera.id,
        event_type=event_type,
        severity=severity,
        payload=payload,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    alert = None
    priority = derive_priority(severity)
    if priority:
        area_label = payload.get("area_id", "A0")
        crowd_count = payload.get("crowd_count", "unknown")
        limit = payload.get("limit", "unknown")
        status_label = "Overcrowded" if severity == "high" else "Limit reached"
        alert = models.Alert(
            event_id=db_event.id,
            message=f"{status_label} on {camera.name} in {area_label}: {crowd_count}/{limit}",
            priority=priority,
            acknowledged=False,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

    return db_event, alert


@router.get("/")
def list_events(
    db: Session = Depends(get_db),
    zone_id: Optional[int] = None,
    camera_id: Optional[int] = None,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
):
    query = db.query(models.Event)

    if camera_id:
        query = query.filter(models.Event.camera_id == camera_id)
    if event_type:
        query = query.filter(models.Event.event_type == event_type)
    if severity:
        query = query.filter(models.Event.severity == severity)
    if start:
        query = query.filter(models.Event.created_at >= start)
    if end:
        query = query.filter(models.Event.created_at <= end)

    if zone_id:
        query = (
            query.join(models.Camera, models.Camera.id == models.Event.camera_id)
            .filter(models.Camera.zone_id == zone_id)
        )

    events = query.order_by(models.Event.created_at.desc()).all()
    return events


@router.post("/ingest")
def ingest_event(event: schemas.EventIn, db: Session = Depends(get_db)):
    db_event, alert = ingest_event_payload(db, event)
    return {
        "message": "Event ingested successfully",
        "event_id": db_event.id,
        "alert_id": alert.id if alert else None,
    }
