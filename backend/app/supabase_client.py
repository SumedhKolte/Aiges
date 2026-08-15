"""Service-role Supabase client.

Every write in Aegis flows through here. The service role bypasses RLS, which
is exactly why it lives on the backend only: the AI's tool calls are validated
in Python before they are ever allowed to touch money.
"""

from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings


@lru_cache
def admin() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)
