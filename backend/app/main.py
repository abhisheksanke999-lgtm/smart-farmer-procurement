import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure local .env file is loaded into os.environ before accessing any config or routers
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE_PATH = BASE_DIR / ".env"
if ENV_FILE_PATH.is_file():
    load_dotenv(dotenv_path=str(ENV_FILE_PATH), override=False)
else:
    cwd_env = Path.cwd() / ".env"
    if cwd_env.is_file():
        load_dotenv(dotenv_path=str(cwd_env), override=False)
    else:
        load_dotenv(override=False)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .database import engine, Base
from .migrate import run_migrations
from .seed import seed_database

# Import routers
from .routers import auth, farmer, dealer, admin, notifications, ml

# Create database tables and safe migrations
Base.metadata.create_all(bind=engine)
run_migrations()

# Auto seed database with initial admin & sample data
seed_database()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-grade Smart Farmer Procurement Management Application."
)

# CORS configuration
cors_origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
frontend_url = os.environ.get("FRONTEND_URL", "").strip()
if frontend_url and frontend_url not in cors_origins:
    cors_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(farmer.router)
app.include_router(dealer.router)
app.include_router(admin.router)
app.include_router(notifications.router)
app.include_router(ml.router)

# Mount static files directory for frontend
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "static"))
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse({"message": "Smart Farmer Procurement Management API is running."})

@app.get("/api/health")
def health_check():
    return {
        "status": "HEALTHY",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION
    }
