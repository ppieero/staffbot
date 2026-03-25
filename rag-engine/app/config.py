from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    QDRANT_URL: str = "http://localhost:6333"
    AWS_ENDPOINT_URL: str = "http://localhost:9000"
    AWS_ACCESS_KEY_ID: str = "staffbot"
    AWS_SECRET_ACCESS_KEY: str = "staffbot123"
    AWS_S3_BUCKET: str = "staffbot-docs"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
