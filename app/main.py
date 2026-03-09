# app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.cam_site import router as cam_site_router
from app.routes.events import router as events_router
from app.routes.uploads import router as upload_router
from app.routes.alerts import router as alerts_router
from app.routes.analytics import router as analytics_router
from app.auth import router as auth_router

from app.kafka_consumer import start_consumer
from app import models, database

# -----------------------------------------
# Create App
# -----------------------------------------
app = FastAPI(
    title="Smart Surveillance Backend",
    swagger_ui_oauth2_redirect_url=None
)

# -----------------------------------------
# CORS (Frontend communication)
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to your frontend URL later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------
# DB Models
# -----------------------------------------
models.Base.metadata.create_all(bind=database.engine)

# -----------------------------------------
# Include Routers
# -----------------------------------------

# Sites + Cameras (THIS IS YOUR MAIN ROUTER)
app.include_router(cam_site_router, prefix="/sites/manage", tags=["Sites & Cameras"])

# Authentication
app.include_router(auth_router, prefix="/auth", tags=["Auth"])

# Events (AI + Backend)
app.include_router(events_router, prefix="/events", tags=["Events"])

# Uploads (Snapshots)
app.include_router(upload_router, prefix="/uploads", tags=["Uploads"])

# Alerts
app.include_router(alerts_router, prefix="/alerts", tags=["Alerts"])

# Analytics
app.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])

# -----------------------------------------
# Root Route
# -----------------------------------------
@app.get("/")
def root():
    return {"message": "Smart Surveillance API Running"}

# -----------------------------------------
# Kafka Consumer Startup
# -----------------------------------------
@app.on_event("startup")
def startup_event():
    print("▶ Starting Kafka Consumer...")
    start_consumer()
