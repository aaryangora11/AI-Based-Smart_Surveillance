from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, database

router = APIRouter(tags=["Site & Camera Management"])
get_db = database.get_db


def serialize_site(site: models.Site):
    return {
        "id": str(site.id),
        "name": site.name,
        "created_at": site.created_at,
    }


def serialize_camera(camera: models.Camera):
    return {
        "id": str(camera.id),
        "name": camera.name,
        "site_id": str(camera.site_id),
        "site_name": camera.site.name if camera.site else None,
        "created_at": camera.created_at,
    }


@router.post("", summary="Create a new site")
def create_site(site: schemas.SiteCreate, db: Session = Depends(get_db)):
    new_site = models.Site(name=site.name)
    db.add(new_site)
    db.commit()
    db.refresh(new_site)
    return {"message": "Site created successfully", "site": serialize_site(new_site)}


@router.get("", summary="List all sites")
def get_sites(db: Session = Depends(get_db)):
    sites = db.query(models.Site).all()
    return [serialize_site(site) for site in sites]


@router.put("/{site_id}")
def update_site(site_id: int, site: schemas.SiteCreate, db: Session = Depends(get_db)):
    db_site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")

    db_site.name = site.name
    db.commit()
    db.refresh(db_site)
    return {"message": "Site updated successfully", "site": serialize_site(db_site)}


@router.delete("/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    db.delete(site)
    db.commit()
    return {"message": "Site deleted successfully"}


@router.post("/cameras", summary="Create a new camera")
def create_camera(camera: schemas.CameraCreate, db: Session = Depends(get_db)):
    site = db.query(models.Site).filter(models.Site.id == camera.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    new_camera = models.Camera(name=camera.name, site_id=camera.site_id)
    db.add(new_camera)
    db.commit()
    db.refresh(new_camera)
    return {"message": "Camera created successfully", "camera": serialize_camera(new_camera)}


@router.get("/cameras", summary="List all cameras")
def get_all_cameras(db: Session = Depends(get_db)):
    cameras = db.query(models.Camera).all()
    return [serialize_camera(camera) for camera in cameras]


@router.put("/cameras/{camera_id}")
def update_camera(camera_id: int, camera: schemas.CameraCreate, db: Session = Depends(get_db)):
    db_camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not db_camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    site = db.query(models.Site).filter(models.Site.id == camera.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    db_camera.name = camera.name
    db_camera.site_id = camera.site_id
    db.commit()
    db.refresh(db_camera)
    return {"message": "Camera updated successfully", "camera": serialize_camera(db_camera)}


@router.delete("/cameras/{camera_id}")
def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    camera = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    db.delete(camera)
    db.commit()
    return {"message": "Camera deleted successfully"}
