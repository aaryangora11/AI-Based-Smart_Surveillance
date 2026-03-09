# backend/app/routes/events.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app import models, database

router = APIRouter(prefix="/events", tags=["Events"])
get_db = database.get_db


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
    """
    Fetch all events with optional filters.
    Supports filtering by camera, zone, severity, event_type, and time range.
    """

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

    # Optional: filter by zone (if zone relationship exists)
    if zone_id:
        query = (
            query.join(models.Camera, models.Camera.id == models.Event.camera_id)
            .filter(models.Camera.zone_id == zone_id)
        )

    events = query.order_by(models.Event.created_at.desc()).all()
    return events
