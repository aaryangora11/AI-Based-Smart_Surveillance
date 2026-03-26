from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.cam_site import router as cam_site_router
from app.routes.events import router as events_router
from app.routes.uploads import router as upload_router
from app.routes.alerts import router as alerts_router
from app.routes.analytics import router as analytics_router
from app.routes.vision import MEDIA_ROOT, router as vision_router
from app.auth import router as auth_router

from app.kafka_consumer import start_consumer
from app import models, database

app = FastAPI(
    title="Smart Surveillance Backend",
    swagger_ui_oauth2_redirect_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

models.Base.metadata.create_all(bind=database.engine)

app.include_router(cam_site_router, prefix="/sites", tags=["Sites & Cameras"])
app.include_router(auth_router, prefix="/auth", tags=["Auth"])
app.include_router(events_router, prefix="/events", tags=["Events"])
app.include_router(upload_router, prefix="/uploads", tags=["Uploads"])
app.include_router(alerts_router, prefix="/alerts", tags=["Alerts"])
app.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
app.include_router(vision_router, prefix="/vision", tags=["Vision"])
app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")


@app.get("/")
def root():
    return {"message": "Smart Surveillance API Running"}


@app.on_event("startup")
def startup_event():
    start_consumer()
