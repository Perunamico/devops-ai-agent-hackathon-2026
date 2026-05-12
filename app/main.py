from __future__ import annotations

from functools import lru_cache

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.agents.orchestrator import PlanOrchestrator
from app.config import get_settings
from app.logging_config import configure_logging
from app.schemas import ErrorResponse, PlanRequest, PlanResponse

settings = get_settings()
configure_logging(settings.log_level)
app = FastAPI(title="LoopPlan Agent", version="1.0.0")


@lru_cache
def get_orchestrator() -> PlanOrchestrator:
    return PlanOrchestrator()


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "service": "loopplan-agent"}


@app.get("/health")
def health() -> dict[str, bool | str]:
    orchestrator = get_orchestrator()
    return {
        "status": "ok",
        "gemini_configured": settings.gemini_configured,
        "firestore_configured": settings.firestore_enabled,
        "runtime": orchestrator.runtime_name,
    }


@app.post("/api/plan", response_model=PlanResponse, responses={422: {"model": ErrorResponse}})
def create_plan(request: PlanRequest) -> PlanResponse:
    return get_orchestrator().run(request)


@app.get("/api/plans/{user_id}")
def get_recent_plans(user_id: str) -> dict[str, object]:
    repo = get_orchestrator().repository
    plans = repo.load_recent(user_id)
    return {"user_id": user_id, "recent_plans": [plan.model_dump(mode="json") for plan in plans]}


@app.exception_handler(ValidationError)
def validation_exception_handler(_, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc), "request_id": None})
