import httpx
import cohere
from sqlalchemy import select
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.db import AppSetting
from app.models.schemas import (
    SaveSettingsRequest,
    SettingsStatusResponse,
    ValidateKeyRequest,
    ValidateKeyResponse,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _mask(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return f"{key[:6]}...{key[-4:]}"


@router.get("", response_model=SettingsStatusResponse)
async def get_settings():
    or_key = settings.openrouter_api_key
    co_key = settings.cohere_api_key
    return SettingsStatusResponse(
        openrouter_key_set=bool(or_key),
        openrouter_key_preview=_mask(or_key),
        cohere_key_set=bool(co_key),
        cohere_key_preview=_mask(co_key),
    )


@router.post("/validate", response_model=ValidateKeyResponse)
async def validate_key(body: ValidateKeyRequest):
    if body.provider == "openrouter":
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {body.api_key}"},
                )
            if r.status_code == 200:
                return ValidateKeyResponse(valid=True)
            return ValidateKeyResponse(valid=False, error=f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            return ValidateKeyResponse(valid=False, error=str(e))

    elif body.provider == "cohere":
        try:
            client = cohere.AsyncClientV2(api_key=body.api_key)
            await client.embed(
                texts=["test"],
                model="embed-english-light-v3.0",
                input_type="search_query",
                embedding_types=["float"],
            )
            return ValidateKeyResponse(valid=True)
        except Exception as e:
            return ValidateKeyResponse(valid=False, error=str(e))

    return ValidateKeyResponse(valid=False, error=f"Unknown provider: {body.provider}")


@router.post("", response_model=SettingsStatusResponse)
async def save_settings(body: SaveSettingsRequest, db: AsyncSession = Depends(get_db)):
    # Upsert both keys
    for key, value in [
        ("openrouter_api_key", body.openrouter_api_key),
        ("cohere_api_key", body.cohere_api_key),
    ]:
        existing = await db.get(AppSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))

    await db.commit()

    # Apply to live settings object
    settings.openrouter_api_key = body.openrouter_api_key
    settings.cohere_api_key = body.cohere_api_key

    # Reset all singleton clients so they reinit with new keys
    import app.services.embedders.openai as _oe
    import app.services.embedders.cohere as _ce
    import app.services.rerankers.cohere as _cr
    import app.services.evaluator as _ev

    _oe._client = None
    _ce._client = None
    _cr._client = None
    _ev._client = None

    return await get_settings()
