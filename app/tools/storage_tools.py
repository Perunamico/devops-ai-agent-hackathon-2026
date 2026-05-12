from __future__ import annotations

from app.schemas import PlanResponse, StoredPlan
from app.services.firestore_repo import PlanRepository


def save_plan_to_firestore(repo: PlanRepository, response: PlanResponse, original_message: str) -> dict[str, bool | str]:
    stored = StoredPlan(
        user_id=response.user_id,
        request_id=response.request_id,
        original_message=original_message,
        final_plan=response.final_plan.model_dump(mode="json"),
        agent_trace=[trace.model_dump(mode="json") for trace in response.agent_trace],
        evaluation_score=response.evaluation_score,
        created_at=response.created_at,
    )
    try:
        saved, document_id = repo.save(stored)
        return {"saved": saved, "document_id": document_id}
    except Exception:
        return {"saved": False, "document_id": response.request_id}


def load_recent_plans(repo: PlanRepository, user_id: str) -> list[StoredPlan]:
    try:
        return repo.load_recent(user_id)
    except Exception:
        return []
