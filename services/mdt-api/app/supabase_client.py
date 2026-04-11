from functools import lru_cache

from supabase import Client, create_client

from .settings import get_settings


@lru_cache
def service_client() -> Client:
    """Service-role client — bypasses RLS. Use only for audit writes and admin ops."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def user_client(access_token: str) -> Client:
    """Per-request client scoped to the caller's JWT so RLS applies to every query."""
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client
