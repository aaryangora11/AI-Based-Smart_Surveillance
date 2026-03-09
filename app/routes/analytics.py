from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app import database, models

router = APIRouter(prefix="/analytics", tags=["Analytics"])


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
