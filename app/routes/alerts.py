import asyncio
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
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


def normalize_alert_timestamp(raw_timestamp, fallback: datetime):
    if not raw_timestamp:
        return fallback.isoformat()

    timestamp_text = str(raw_timestamp).strip()

    try:
        return datetime.fromisoformat(timestamp_text.replace("Z", "+00:00")).isoformat()
    except ValueError:
        pass

    normalized = timestamp_text.replace(" IST", "").strip()
    for fmt in ("%Y-%m-%d %I:%M:%S %p", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(normalized, fmt).isoformat()
        except ValueError:
            continue

    return fallback.isoformat()


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
        "timestamp": normalize_alert_timestamp(payload.get("timestamp"), alert.created_at or alert.event.created_at),
        "snapshotUrl": serialize_snapshot_url(payload),
        "acknowledged": alert.acknowledged,
        "message": alert.message,
    }


def fetch_alerts(
    db: Session,
    limit: int | None = None,
    alert_date: str | None = None,
    include_acknowledged: bool = False,
):
    query = db.query(models.Alert).join(models.Event).order_by(models.Alert.created_at.desc())

    if not include_acknowledged:
        query = query.filter(models.Alert.acknowledged == False)

    if alert_date:
        try:
            start = datetime.strptime(alert_date, "%Y-%m-%d")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.") from error

        end = start + timedelta(days=1)
        query = query.filter(models.Alert.created_at >= start, models.Alert.created_at < end)

    if limit:
        query = query.limit(limit)

    return query.all()


@router.get("", tags=["Alerts"])
def get_active_alerts(
    limit: int | None = None,
    date: str | None = Query(default=None, description="Fetch alerts for a specific date in YYYY-MM-DD format."),
    include_acknowledged: bool = Query(default=False, description="Include acknowledged alerts in the response."),
    db: Session = Depends(database.get_db),
):
    alerts = fetch_alerts(db, limit=limit, alert_date=date, include_acknowledged=include_acknowledged)
    return {"alerts": [format_alert(alert) for alert in alerts]}


@router.post("/{alert_id}/acknowledge", tags=["Alerts"])
def acknowledge_alert(alert_id: int, db: Session = Depends(database.get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged = True
    db.commit()
    return {"message": "Alert acknowledged", "alert_id": alert_id}


@router.post("/acknowledge-all", tags=["Alerts"])
def acknowledge_all_alerts(db: Session = Depends(database.get_db)):
    alerts = db.query(models.Alert).filter(models.Alert.acknowledged == False).all()

    if not alerts:
        return {"message": "No active alerts to acknowledge", "count": 0}

    for alert in alerts:
        alert.acknowledged = True

    db.commit()
    return {"message": "All alerts acknowledged", "count": len(alerts)}


@router.websocket("/stream")
async def alerts_stream(websocket: WebSocket):
    await websocket.accept()
    last_signature = None

    try:
        while True:
            db = database.SessionLocal()
            try:
                alerts = fetch_alerts(db, limit=6)
                payload = [format_alert(alert) for alert in alerts]
                signature = tuple((item["id"], item["timestamp"], item["acknowledged"]) for item in payload)
            finally:
                db.close()

            if signature != last_signature:
                await websocket.send_json(
                    {
                        "type": "alerts_snapshot",
                        "alerts": payload,
                    }
                )
                last_signature = signature

            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        return
