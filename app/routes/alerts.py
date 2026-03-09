from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models, database

router = APIRouter()

# Convert DB objects → UI expected format
def format_alert(a: models.Alert):
    payload = a.event.payload if a.event.payload else {}

    return {
        "id": str(a.id),
        "type": a.event.event_type.replace("_", " "),
        "cameraId": str(a.event.camera_id),
        "cameraName": f"Camera {a.event.camera_id}",
        "zoneName": payload.get("area_id", "Zone A"),
        "count": payload.get("crowd_count", None),
        "severity": a.priority.capitalize(),
        "timestamp": payload.get("timestamp", a.event.created_at.isoformat()),
        "snapshotUrl": payload.get("snapshot_url", None),
        "acknowledged": a.acknowledged
    }


@router.get("/alerts", tags=["Alerts"])
def get_active_alerts(db: Session = Depends(database.get_db)):
    alerts = db.query(models.Alert).filter(models.Alert.acknowledged == False).all()
    return {"alerts": [format_alert(a) for a in alerts]}


@router.post("/alerts/{alert_id}/acknowledge", tags=["Alerts"])
def acknowledge_alert(alert_id: int, db: Session = Depends(database.get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged = True
    db.commit()
    return {"message": "Alert acknowledged", "alert_id": alert_id}
