import os
from pydantic_settings import BaseSettings

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
    RESEND_FROM_EMAIL: str = "Smart Farmer <onboarding@resend.dev>"

    # Gmail SMTP Configuration
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""



    class Config:
        case_sensitive = True
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
        extra = "ignore"

settings = Settings()
