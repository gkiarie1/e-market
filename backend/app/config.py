from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'postgresql+psycopg://market:market@localhost:5432/market'
    public_base_url: str = 'http://localhost:8000'
    cors_origins: str = 'http://localhost:8081,http://localhost:19006'
    upload_dir: str = './uploads'
    session_hours: int = 24
    firebase_project_id: str = ''
    google_application_credentials: str = ''
    # Use GOOGLE_APPLICATION_CREDENTIALS or workload identity for Admin SDK credentials.


@lru_cache
def settings():
    return Settings()
