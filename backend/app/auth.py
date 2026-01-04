from __future__ import annotations

from fastapi import Header, HTTPException


def get_owner_id(x_owner_id: str | None = Header(default=None)) -> str:
    """
    MVP auth stub.

    In production:
      - replace with Supabase JWT verification
      - derive owner_id from token claims (sub)

    For now:
      - client MUST send X-Owner-Id header
    """
    if not x_owner_id:
        raise HTTPException(
            status_code=401,
            detail="Missing auth. Provide X-Owner-Id header (MVP stub).",
        )
    return x_owner_id

