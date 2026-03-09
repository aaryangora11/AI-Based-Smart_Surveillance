from sqlalchemy import Column, Integer, String, ForeignKey, JSON, TIMESTAMP, text, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

# ---------------------- USER MODEL ----------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="viewer")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


# ---------------------- SITE MODEL ----------------------
class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    cameras = relationship("Camera", back_populates="site", cascade="all, delete")


# ---------------------- CAMERA MODEL ----------------------
class  Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    site = relationship("Site", back_populates="cameras")
    events = relationship("Event", back_populates="camera", cascade="all, delete")


# ---------------------- EVENT MODEL ----------------------
class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    camera = relationship("Camera", back_populates="events")
    alerts = relationship("Alert", back_populates="event", cascade="all, delete")


# ---------------------- ALERT MODEL ----------------------
class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    message = Column(String, nullable=False)
    priority = Column(String, nullable=False, default="high")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    acknowledged = Column(Boolean, default=False)

    event = relationship("Event", back_populates="alerts")
