from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, database

router = APIRouter()


def serialize_snapshot_url(payload: dict):
    snapshot_url = payload.get("snapshot_url")
    if snapshot_url:
        return snapshot_url

    snapshot_path = payload.get("snapshot_path")
    if snapshot_path:
        return f"/media/alert_snapshots/{Path(snapshot_path).name}"

    snapshot_urls = payload.get("snapshot_urls") or []
    return snapshot_urls[0] if snapshot_urls else None


def format_alert(alert: models.Alert):
    payload = alert.event.payload if alert.event.payload else {}
    camera = alert.event.camera

    return {
        "id": str(alert.id),
        "type": alert.event.event_type.replace("_", " "),
        "cameraId": str(alert.event.camera_id),
        "cameraName": camera.name if camera else f"Camera {alert.event.camera_id}",
        "zoneName": payload.get("area_id", "Zone A"),
        "count": payload.get("crowd_count"),
        "severity": alert.priority.capitalize(),
        "timestamp": payload.get("timestamp", alert.event.created_at.isoformat()),
        "snapshotUrl": serialize_snapshot_url(payload),
        "acknowledged": alert.acknowledged,
        "message": alert.message,
    }


@router.get("", tags=["Alerts"])
def get_active_alerts(limit: int | None = None, db: Session = Depends(database.get_db)):
    query = (
        db.query(models.Alert)
        .filter(models.Alert.acknowledged == False)
        .order_by(models.Alert.created_at.desc())
    )

    if limit:
        query = query.limit(limit)

    alerts = query.all()
    return {"alerts": [format_alert(alert) for alert in alerts]}


@router.post("/{alert_id}/acknowledge", tags=["Alerts"])
def acknowledge_alert(alert_id: int, db: Session = Depends(database.get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged = True
    db.commit()
    return {"message": "Alert acknowledged", "alert_id": alert_id}
