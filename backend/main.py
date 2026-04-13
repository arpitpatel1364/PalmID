from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os
from backend import models, schemas, crud
from backend.database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PalmID Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_index():
    return FileResponse("index.html")

@app.get("/users", response_model=List[schemas.User])
def read_users(db: Session = Depends(get_db)):
    return crud.get_users(db)

@app.post("/users", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return crud.create_user(db, user)

@app.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db)):
    return crud.delete_user(db, user_id)

@app.post("/users/{user_id}/login")
def update_login_status(user_id: str, success: bool, db: Session = Depends(get_db)):
    user = crud.increment_login(db, user_id, success)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "user": user}

@app.get("/logs", response_model=List[schemas.AuditLog])
def read_logs(db: Session = Depends(get_db)):
    return crud.get_logs(db)

@app.post("/logs", response_model=schemas.AuditLog)
def create_log(log: schemas.AuditLogBase, db: Session = Depends(get_db)):
    return crud.create_log(db, log)

@app.delete("/logs")
def clear_logs(db: Session = Depends(get_db)):
    crud.clear_logs(db)
    return {"status": "logs cleared"}

@app.get("/settings", response_model=schemas.Settings)
def read_settings(db: Session = Depends(get_db)):
    return crud.get_settings(db)

@app.put("/settings", response_model=schemas.Settings)
def update_settings(settings: schemas.SettingsBase, db: Session = Depends(get_db)):
    return crud.update_settings(db, settings)

@app.get("/api/stats")
def read_api_stats():
    return {"status": "ok", "version": "2.0.0"}

@app.get("/api/stream")
def read_api_stream():
    return {"status": "streaming"}

@app.post("/reset")
def reset_all(db: Session = Depends(get_db)):
    crud.reset_all(db)
    return {"status": "all data reset"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
