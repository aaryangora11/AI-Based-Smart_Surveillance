# Option A: add into main.py or better create app/routes/upload.py and include it
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.minio_client import upload_fileobj_to_minio
from sqlalchemy.orm import Session
from app import database

router = APIRouter(prefix="/upload", tags=["Upload"])

@router.post("/snapshot")
def upload_snapshot(file: UploadFile = File(...)):
    """
    Receives a snapshot file (image) and uploads to MinIO.
    Returns the public URL to the uploaded snapshot.
    """
    try:
        content = file.file  # file-like
        filename = file.filename or None
        content_type = file.content_type or None
        url = upload_fileobj_to_minio(content, filename=filename, content_type=content_type)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
