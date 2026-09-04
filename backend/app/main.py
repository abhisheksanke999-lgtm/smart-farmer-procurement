import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .database import engine, Base
from .seed import seed_database

# Import routers
from .routers import auth, farmer, dealer, admin, notifications, ml

# Create database tables
Base.metadata.create_all(bind=engine)

# Auto seed database with initial admin & sample data
seed_database()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-grade Smart Farmer Procurement Management Application."
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
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
