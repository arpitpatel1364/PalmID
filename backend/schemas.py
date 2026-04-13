from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional

class UserBase(BaseModel):
    name: str
    avatar: str
    pattern: List[str]

class UserCreate(UserBase):
    id: str

class User(UserBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    created_at: datetime
    login_count: int
    fail_count: int

class AuditLogBase(BaseModel):
    event: str
    user_name: Optional[str] = None
    user_avatar: Optional[str] = None
    gestures: List[str]
    result: str
    session_id: str

class AuditLog(AuditLogBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    timestamp: datetime

class SettingsBase(BaseModel):
    hold_ms: int
    max_fail: int
    lockout_sec: int
    min_pat_len: int
    detection_conf: int
    smoothing: int
    landmark_color: str

class Settings(SettingsBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
