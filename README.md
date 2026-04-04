# Smart Surveillance

AI-based smart surveillance platform with crowd detection, alerting, analytics, snapshots, and a React dashboard.

## What This Project Does

This project combines three parts into one system:

- `Backend`: FastAPI API for auth, sites, alerts, analytics, vision jobs, and media serving
- `Frontend`: React + Vite dashboard for monitoring, alert review, analytics, and vision processing
- `AI Pipeline`: YOLOv8 + OpenCV based crowd detection on prerecorded video with polygon-based zone monitoring

Main capabilities:

- User login and registration
- Site and camera management
- Crowd detection on uploaded prerecorded video
- Polygon zone selection before running detection
- Live processing preview in the frontend
- Alert generation when zone limits are reached
- Alert acknowledgement and alert-history filtering by date
- Snapshot evidence saving and snapshot gallery view
- Dashboard and analytics views backed by database data

## Tech Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL, Uvicorn
- Frontend: React, TypeScript, Vite, Recharts
- AI: Ultralytics YOLOv8, OpenCV, NumPy
- Optional services: Kafka, MinIO, Redis

## Project Structure

```text
backend/
  ai/                  Crowd-detection logic
  app/                 FastAPI app, routes, models, auth, database
  frontend/            React + Vite frontend
  media/               Generated media and local test assets
  .env.example         Safe environment template
  requirements.txt     Python dependencies
```

## Prerequisites

- Python 3.12+ recommended
- Node.js 20+ recommended
- PostgreSQL
- Git

Optional:

- Docker for running PostgreSQL
- Kafka if you want event streaming enabled
- MinIO if you want object storage integration

## Environment Setup

1. Create a local `.env` file from [.env.example](./.env.example).
2. Update the values for your machine if needed.

Example:

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=smartuser
DB_PASS=changeme
DB_NAME=smartdb
DATABASE_URL=postgresql://smartuser:changeme@127.0.0.1:5432/smartdb

JWT_SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=60

KAFKA_BOOTSTRAP=localhost:9092
ENABLE_KAFKA_CONSUMER=false
ENABLE_KAFKA_EVENTS=false
```

## Backend Setup

1. Create and activate a virtual environment.
2. Install Python dependencies.
3. Start the FastAPI server.

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at:

- `http://127.0.0.1:8000`
- Swagger docs: `http://127.0.0.1:8000/docs`

## Frontend Setup

From the project root:

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at:

- `http://127.0.0.1:5173`

## Database Setup

The app uses PostgreSQL through SQLAlchemy.

If you want to run PostgreSQL in Docker, a typical example is:

```powershell
docker run --name smart-surveillance-postgres `
  -e POSTGRES_USER=smartuser `
  -e POSTGRES_PASSWORD=changeme `
  -e POSTGRES_DB=smartdb `
  -p 5432:5432 `
  -d postgres:15
```

Make sure your `.env` matches the same credentials.

## AI Model Setup

The crowd-detection pipeline uses YOLOv8. The code supports model selection, but the model weights are not committed to GitHub.

Place your YOLO weights inside:

```text
ai/models/
```

Example:

```text
ai/models/yolov8n.pt
```

If no model file is present, the AI crowd-detection flow will not be fully usable.

## How To Use The App

1. Start PostgreSQL
2. Start the backend
3. Start the frontend
4. Open the frontend in the browser
5. Register or log in
6. Go to `Vision`
7. Upload a prerecorded video
8. Draw a polygon over the monitored area
9. Choose a detection preset
10. Run crowd detection
11. Review live output, alerts, snapshots, and final processed media

## Detection Presets

The Vision page includes three preset modes:

- `Fast`: quicker processing, lower workload, less reliable for hard videos
- `Balanced`: default mode for most videos
- `Accurate`: slower, but better for difficult or crowded scenes

The backend also performs a basic video-quality assessment and surfaces reliability information in the UI.

## Saved Media

Generated files are stored locally under `media/`.

Common folders:

- `media/alert_snapshots/`
- `media/processed_videos/`
- `media/live_previews/`
- `media/processed_previews/`
- `media/source_videos/`

These are ignored in git because they are runtime-generated files.

## Optional Services

### Kafka

Kafka is optional in this project.

- If Kafka is not running, the app can still work
- If Kafka is enabled, the system can publish and consume alert/event messages
- Local and Docker defaults keep Kafka disabled unless you explicitly set `ENABLE_KAFKA_CONSUMER=true` and/or `ENABLE_KAFKA_EVENTS=true`

### MinIO

MinIO configuration is available in the env file, but local filesystem storage is still used for the current vision/media workflow.

## Useful Commands

Backend syntax check:

```powershell
python -m py_compile app\auth.py app\routes\alerts.py app\routes\vision.py ai\people_count_alert.py
```

Frontend lint:

```powershell
npm --prefix frontend run lint
```

Frontend production build:

```powershell
npm --prefix frontend run build
```

## Deployment

This repository is now prepared for single-server Docker deployment.

Deployment files included:

- [docker-compose.yml](./docker-compose.yml)
- [Dockerfile.backend](./Dockerfile.backend)
- [frontend/Dockerfile](./frontend/Dockerfile)
- [frontend/nginx.conf](./frontend/nginx.conf)

This setup gives you:

- one public frontend link
- backend API behind `/api`
- media served behind `/media`
- PostgreSQL in the same deployment stack

### Recommended Deployment Target

Use a Linux VM or VPS such as:

- DigitalOcean Droplet
- AWS EC2
- Oracle Cloud VM
- Azure VM

### Deploy Steps On A VPS

1. Install Docker and Docker Compose.
2. Clone this repository on the server.
3. Create a real `.env` from `.env.example`.
4. Add your YOLO model file into `ai/models/`.
5. Start the stack:

```bash
docker compose up -d --build
```

6. Open the server IP in the browser.

If you connect a domain later, the app can be exposed from one public URL such as:

```text
https://your-domain.com
```

### Important Deployment Notes

- The frontend is built to call the backend through `/api`
- WebSocket alert/live-vision routes are proxied through Nginx
- PostgreSQL data is persisted through a Docker volume
- Media is persisted through a Docker volume
- AI model weights are still expected locally in `ai/models/`

## Current Status

Implemented:

- Backend + frontend integration
- Auth flow
- Sites and alerts pages
- Dashboard and analytics pages
- Vision processing workflow
- Snapshot gallery
- Alert acknowledgement and date-based alert history
- Live preview updates and processed output review

Still suitable for future improvement:

- AI accuracy tuning on difficult videos
- stronger deployment packaging
- automated tests
- production-grade worker architecture
- production-grade security hardening

## Notes For GitHub Users

This repository intentionally does not include:

- `.env`
- `node_modules`
- Python cache files
- generated preview media
- processed videos and snapshots
- private model weights

If you clone the repo, you must:

- create your own `.env`
- install dependencies
- provide database access
- add YOLO model weights locally

## Author

**Aaryan Gora**
