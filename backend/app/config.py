import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Locate project root and local .env file
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE_PATH = BASE_DIR / ".env"

# Load local .env into os.environ if it exists
# override=False preserves Render/system environment variables so production is never overwritten
if ENV_FILE_PATH.is_file():
    load_dotenv(dotenv_path=str(ENV_FILE_PATH), override=False)
else:
    cwd_env = Path.cwd() / ".env"
    if cwd_env.is_file():
        load_dotenv(dotenv_path=str(cwd_env), override=False)
    else:
        load_dotenv(override=False)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Farmer Procurement Management System"
    VERSION: str = "1.0.0"
    SECRET_KEY: str = "sih-26032-smart-farmer-procurement-secret-key-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # SQLite Database Path
    DATABASE_URL: str = "sqlite:///./farmer_procurement.db"

    # Resend HTTPS API Configuration
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "Smart Farmer <noreply@myproject999.online>"

    class Config:
        case_sensitive = True
        env_file = str(ENV_FILE_PATH) if ENV_FILE_PATH.is_file() else ".env"
        extra = "ignore"

settings = Settings()

