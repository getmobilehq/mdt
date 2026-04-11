import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache
def service_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
