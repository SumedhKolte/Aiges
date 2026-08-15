"""Service-role Supabase client.

Every write in Aegis flows through here. The service role bypasses RLS, which
is exactly why it lives on the backend only: the AI's tool calls are validated
in Python before they are ever allowed to touch money.
"""

from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from .config import get_settings


class _NoRow:
    """Stand-in for a `maybe_single()` query that matched nothing.

    PostgREST answers 406 when `maybe_single()` finds zero rows, and
    supabase-py surfaces that by returning `None` from `execute()` rather than
    a response whose `.data` is `None`. Reading `.data` on it therefore raises
    AttributeError and 500s the request — for the entirely ordinary case of
    "this contract has no dispute yet".

    Every `maybe_single().execute()` is written as `... or NO_ROW` so the
    absent-row case flows through as `data is None`, which the call sites
    already handle.
    """

    data: Any = None


NO_ROW = _NoRow()


@lru_cache
def admin() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)
