# app/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, Any, List
from datetime import datetime

# ---------------- AUTH ----------------
class UserCreate(BaseModel):
    email: EmailStr
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: str
    role: str = "viewer"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

# ---------------- SITES ----------------
class SiteCreate(BaseModel):
    name: str

class SiteOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

# ---------------- CAMERAS ----------------
class CameraCreate(BaseModel):
    name: str
    site_id: int

class CameraOut(BaseModel):
    id: int
    name: str
    site_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ---------------- EVENTS ----------------
# app/schemas.py

from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

class EventIn(BaseModel):
    # Accept both AI-style and normal events
    camera_id: Optional[int] = 1  # Default to camera_id=1 if not provided
    event_type: Optional[str] = "crowd_alert"
    severity: Optional[str] = None
    timestamp: Optional[str] = None
    area_id: Optional[str] = None
    crowd_count: Optional[int] = None
    limit: Optional[int] = None
    status: Optional[str] = None
    payload: Optional[Any] = None
    snapshot_url: Optional[str] = None



# ---------------- ALERTS ----------------
class AlertOut(BaseModel):
    id: int
    event_id: int
    message: str
    priority: str
    created_at: datetime

    class Config:
        from_attributes = True
