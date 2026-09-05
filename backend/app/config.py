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

    # SMTP Configuration
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USERNAME: str = "abhisheksanke999@gmail.com"
    SMTP_PASSWORD: str = "jgla ooje fzes plqp"
    SMTP_FROM: str = "abhisheksanke999@gmail.com"
    SMTP_USE_TLS: bool = False

    # Cloud HTTP Email API (Resend / Brevo)
    RESEND_API_KEY: str = ""


    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

settings = Settings()
