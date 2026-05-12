from __future__ import annotations

import logging
from typing import Protocol

from app.config import Settings, get_settings
from app.schemas import StoredPlan
from app.services.memory_repo import MemoryPlanRepository

logger = logging.getLogger(__name__)


class PlanRepository(Protocol):
    def save(self, plan: StoredPlan) -> tuple[bool, str]: ...
    def load_recent(self, user_id: str, limit: int = 5) -> list[StoredPlan]: ...


class FirestorePlanRepository:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        from google.cloud import firestore

        self.client = firestore.Client(project=self.settings.google_cloud_project)
        self.collection = self.client.collection("loopplan_requests")

    def save(self, plan: StoredPlan) -> tuple[bool, str]:
        data = plan.model_dump(mode="json")
        self.collection.document(plan.request_id).set(data)
        return True, plan.request_id

    def load_recent(self, user_id: str, limit: int = 5) -> list[StoredPlan]:
        query = (
            self.collection.where("user_id", "==", user_id)
            .order_by("created_at", direction="DESCENDING")
            .limit(limit)
        )
        return [StoredPlan.model_validate(doc.to_dict()) for doc in query.stream()]


def create_repository(settings: Settings | None = None) -> PlanRepository:
    settings = settings or get_settings()
    if settings.firestore_enabled:
        try:
            return FirestorePlanRepository(settings)
        except Exception as exc:  # pragma: no cover - credential dependent
            logger.warning("Firestore unavailable; falling back to memory repository: %s", exc.__class__.__name__)
    return MemoryPlanRepository()
