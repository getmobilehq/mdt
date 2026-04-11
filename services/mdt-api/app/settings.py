from functools import lru_cache
import os

from pydantic import BaseModel


class Settings(BaseModel):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    aws_region: str = "eu-west-2"
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings(
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_anon_key=os.environ["SUPABASE_ANON_KEY"],
        supabase_service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        supabase_jwt_secret=os.environ["SUPABASE_JWT_SECRET"],
        aws_region=os.environ.get("AWS_REGION", "eu-west-2"),
        environment=os.environ.get("ENVIRONMENT", "development"),
    )
