"""Typed settings loaded from backend/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Supabase -----------------------------------------------------------
    supabase_url: str
    supabase_anon_key: str = ""
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # --- OpenAI -------------------------------------------------------------
    openai_api_key: str
    openai_realtime_model: str = "gpt-realtime"
    openai_realtime_voice: str = "ash"
    openai_vision_model: str = "gpt-4o"
    openai_jury_model: str = "gpt-4o"
    openai_reel_model: str = "gpt-4o-mini"
    # Narration for the Trust Reel. gpt-4o-mini-tts takes a style instruction,
    # which is what keeps the read understated instead of advertisey.
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "ash"

    # --- Wiring -------------------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    # --- Risk engine --------------------------------------------------------
    aegis_risk_halt_threshold: int = 70
    aegis_entropy_max_latency_ms: int = 4000
    aegis_entropy_min_match: float = 0.72
    aegis_max_auto_lock_cents: int = 5_000_000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
