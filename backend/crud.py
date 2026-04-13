from sqlalchemy.orm import Session
from . import models, schemas
import uuid

def get_users(db: Session):
    return db.query(models.User).all()

def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(**user.dict())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: str):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        db.delete(user)
        db.commit()
    return user

def increment_login(db: Session, user_id: str, success: bool):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user:
        if success:
            user.login_count += 1
            user.fail_count = 0
        else:
            user.fail_count += 1
        db.commit()
        db.refresh(user)
    return user

def get_logs(db: Session, limit: int = 100):
    return db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(limit).all()

def create_log(db: Session, log: schemas.AuditLogBase):
    db_log = models.AuditLog(**log.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def clear_logs(db: Session):
    db.query(models.AuditLog).delete()
    db.commit()

def get_settings(db: Session):
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

def update_settings(db: Session, settings: schemas.SettingsBase):
    db_settings = get_settings(db)
    for key, value in settings.dict().items():
        setattr(db_settings, key, value)
    db.commit()
    db.refresh(db_settings)
    return db_settings

def reset_all(db: Session):
    db.query(models.User).delete()
    db.query(models.AuditLog).delete()
    # Reset settings to default
    settings = get_settings(db)
    db.delete(settings)
    db.commit()
    return True
 