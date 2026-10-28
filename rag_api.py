"""Authenticated HTTP wrapper for the local SQL RAG pipeline.

This service is separate from Supabase's shared quiz-api. It reads the
existing Neo4j knowledge index and calls OpenAI only for explicit requests.
"""

from __future__ import annotations

import os
import threading
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Callable

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from sql_rag import run_rag


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="IDS706 SQL RAG API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("RAG_ALLOWED_ORIGIN", "https://violathadtanone.github.io")
    ],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class GenerateRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)


class Quota:
    """Process-local quota; use shared storage for multi-worker production."""

    def __init__(self, hourly: int, daily: int) -> None:
        self.hourly = hourly
        self.daily = daily
        self.events: defaultdict[str, deque[datetime]] = defaultdict(deque)
        self.lock = threading.Lock()

    def consume(self, user_id: str, now: datetime | None = None) -> None:
        current = now or datetime.now(timezone.utc)
        with self.lock:
            events = self.events[user_id]
            while events and events[0] <= current - timedelta(days=1):
                events.popleft()
            daily_count = len(events)
            hourly_count = sum(
                timestamp > current - timedelta(hours=1) for timestamp in events
            )
            if daily_count >= self.daily:
                raise HTTPException(429, "Daily SQL generation limit reached.")
            if hourly_count >= self.hourly:
                raise HTTPException(429, "Hourly SQL generation limit reached.")
            events.append(current)


quota = Quota(
    hourly=int(os.getenv("RAG_HOURLY_LIMIT", "10")),
    daily=int(os.getenv("RAG_DAILY_LIMIT", "20")),
)


def configured(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(503, f"RAG backend is not configured: missing {name}.")
    return value


def verify_token(
    token: str,
    get: Callable[..., httpx.Response] | None = None,
) -> str:
    supabase_url = configured("RAG_SUPABASE_URL").rstrip("/")
    anon_key = configured("RAG_SUPABASE_ANON_KEY")
    request = get or httpx.get
    try:
        response = request(
            f"{supabase_url}/auth/v1/user",
            headers={"apikey": anon_key, "Authorization": f"Bearer {token}"},
            timeout=5.0,
        )
    except httpx.HTTPError as error:
        raise HTTPException(503, "Authentication service is unavailable.") from error
    if response.status_code in (401, 403):
        raise HTTPException(401, "Sign in before using the SQL assistant.")
    if response.status_code >= 400:
        raise HTTPException(503, "Authentication could not be verified.")
    user_id = response.json().get("id")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(401, "The authentication response was invalid.")
    return user_id


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate-sql")
def generate_sql(
    request: GenerateRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in before using the SQL assistant.")
    user_id = verify_token(authorization.removeprefix("Bearer ").strip())
    quota.consume(user_id)
    try:
        return run_rag(request.question)
    except KeyError as error:
        raise HTTPException(503, f"RAG backend is not configured: missing {error.args[0]}.") from error
    except Exception as error:
        raise HTTPException(502, "The SQL assistant could not reach its RAG services.") from error
