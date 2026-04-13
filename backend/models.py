from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    avatar = Column(String)
    pattern = Column(JSON)  # List of strings (gestures)
    created_at = Column(DateTime, default=datetime.utcnow)
    login_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event = Column(String)
    user_name = Column(String)
    user_avatar = Column(String)
    gestures = Column(JSON)
    result = Column(String)
    session_id = Column(String)

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    hold_ms = Column(Integer, default=1500)
    max_fail = Column(Integer, default=5)
    lockout_sec = Column(Integer, default=30)
    min_pat_len = Column(Integer, default=3)
    detection_conf = Column(Integer, default=70) # x 100
    smoothing = Column(Integer, default=2)
    landmark_color = Column(String, default="#7B61FF")
 