from __future__ import annotations

from threading import Lock

from app.schemas import StoredPlan


class MemoryPlanRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._items: list[StoredPlan] = []

    def save(self, plan: StoredPlan) -> tuple[bool, str]:
        with self._lock:
            self._items.append(plan)
        return True, plan.request_id

    def load_recent(self, user_id: str, limit: int = 5) -> list[StoredPlan]:
        with self._lock:
            items = [item for item in self._items if item.user_id == user_id]
        return sorted(items, key=lambda item: item.created_at, reverse=True)[:limit]
