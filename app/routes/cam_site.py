# backend/app/routes/cam_site.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models, schemas, database

router = APIRouter(prefix="", tags=["Site & Camera Management"])
get_db = database.get_db


# ------ SITES ------

@router.post("/sites", summary="Create a new site")
def create_site(site: schemas.SiteCreate, db: Session = Depends(get_db)):
    new_site = models.Site(name=site.name)
    db.add(new_site)
    db.commit()
    db.refresh(new_site)
    return {"message": "Site created successfully", "site_id": new_site.id}


@router.get("/sites", summary="List all sites")
def get_sites(db: Session = Depends(get_db)):
    sites = db.query(models.Site).all()
    return [
        {
            "id": str(site.id),
            "name": site.name,
            "created_at": site.created_at
        }
        for site in sites
    ]


@router.put("/sites/{site_id}")
def update_site(site_id: int, site: schemas.SiteCreate, db: Session = Depends(get_db)):
    db_site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    db_site.name = site.name
    db.commit()
    db.refresh(db_site)
    return {"message": "Site updated successfully"}


@router.delete("/sites/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    db.delete(site)
    db.commit()
    return {"message": "Site deleted successfully"}


# ------ CAMERAS ------

# ------ CREATE CAMERA ------
@router.post("/cameras", summary="Create a new camera")
def create_camera(camera: schemas.CameraCreate, db: Session = Depends(get_db)):
    new_camera = models.Camera(name=camera.name, site_id=camera.site_id)
    db.add(new_camera)
    db.commit()
    db.refresh(new_camera)
    return {"message": "Camera created successfully", "camera_id": new_camera.id}


# ------ LIST ALL CAMERAS ------
@router.get("/cameras", summary="List all cameras")
def get_all_cameras(db: Session = Depends(get_db)):
    cameras = db.query(models.Camera).all()
    return cameras


@router.put("/cameras/{camera_id}")
def update_camera(camera_id: int, camera: schemas.CameraCreate, db: Session = Depends(get_db)):
    db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    db_camera.name = camera.name
    db_camera.site_id = camera.site_id
    db.commit()
    db.refresh(db_camera)
    return {"message": "Camera updated successfully"}


@router.delete("/cameras/{camera_id}")
def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    db.delete(camera)
    db.commit()
    return {"message": "Camera deleted successfully"}
