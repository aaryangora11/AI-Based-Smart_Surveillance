from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app import database, models

router = APIRouter(tags=["Analytics"])


@router.get("/count")
def total_events(db: Session = Depends(database.get_db)):
    count = db.query(models.Event).count()
    return {"totalEvents": count}


@router.get("/by-event-type")
def analytics_by_event_type(db: Session = Depends(database.get_db)):
    results = (
        db.query(models.Event.event_type, func.count(models.Event.id))
        .group_by(models.Event.event_type)
        .all()
    )
    return [{"label": r[0], "value": r[1]} for r in results]


@router.get("/by-severity")
def analytics_by_severity(db: Session = Depends(database.get_db)):
    results = (
        db.query(models.Event.severity, func.count(models.Event.id))
        .group_by(models.Event.severity)
        .all()
    )
    return [{"label": r[0], "value": r[1]} for r in results]


@router.get("/summary")
def analytics_summary(db: Session = Depends(database.get_db)):
    latest_event = db.query(models.Event).order_by(models.Event.created_at.desc()).first()
    active_alerts = db.query(models.Alert).filter(models.Alert.acknowledged == False).count()

    return {
        "totalEvents": db.query(models.Event).count(),
        "activeAlerts": active_alerts,
        "totalSites": db.query(models.Site).count(),
        "totalCameras": db.query(models.Camera).count(),
        "latestEvent": {
            "type": latest_event.event_type,
            "severity": latest_event.severity,
            "created_at": latest_event.created_at.isoformat(),
        }
        if latest_event
        else None,
    }
