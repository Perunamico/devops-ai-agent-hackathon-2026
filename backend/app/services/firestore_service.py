import uuid
import logging
from datetime import datetime, timezone
from typing import Any

from app.config import Settings

logger = logging.getLogger(__name__)


class FirestoreService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._db = self._build_client()
        # In-memory fallback when Firestore is disabled
        self._mem: dict[str, dict] = {}

    def _build_client(self):
        if not self._settings.firestore_enabled:
            return None
        try:
            from google.cloud import firestore
            return firestore.Client(
                project=self._settings.google_cloud_project,
                database=self._settings.firestore_database,
            )
        except Exception as e:
            logger.warning("Firestore unavailable, using in-memory store: %s", e)
            return None

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    # ---- generic helpers ----

    def _set(self, collection: str, doc_id: str, data: dict) -> None:
        if self._db:
            self._db.collection(collection).document(doc_id).set(data, merge=True)
        else:
            self._mem[f"{collection}/{doc_id}"] = data

    def _get(self, collection: str, doc_id: str) -> dict | None:
        if self._db:
            doc = self._db.collection(collection).document(doc_id).get()
            return doc.to_dict() if doc.exists else None
        return self._mem.get(f"{collection}/{doc_id}")

    def _add(self, collection: str, data: dict) -> str:
        doc_id = str(uuid.uuid4())
        if self._db:
            self._db.collection(collection).document(doc_id).set(data)
        else:
            self._mem[f"{collection}/{doc_id}"] = data
        return doc_id

    def _list(self, collection: str) -> list[dict]:
        if self._db:
            docs = self._db.collection(collection).stream()
            return [{**d.to_dict(), "id": d.id} for d in docs]
        prefix = f"{collection}/"
        return [{"id": k[len(prefix):], **v} for k, v in self._mem.items() if k.startswith(prefix)]

    def _delete(self, collection: str, doc_id: str) -> None:
        if self._db:
            self._db.collection(collection).document(doc_id).delete()
        else:
            self._mem.pop(f"{collection}/{doc_id}", None)

    # ---- users ----

    def get_user(self, user_id: str) -> dict | None:
        return self._get("users", user_id)

    def upsert_user(self, user_id: str, data: dict) -> None:
        self._set("users", user_id, {"id": user_id, **data})

    # ---- pets ----

    def create_pet(self, user_id: str, pet_data: dict) -> str:
        pet_id = str(uuid.uuid4())
        data = {"id": pet_id, "user_id": user_id, "created_at": self._now().isoformat(), **pet_data}
        self._set(f"users/{user_id}/pets", pet_id, data)
        return pet_id

    def get_pet_by_user(self, user_id: str) -> dict | None:
        pets = self._list(f"users/{user_id}/pets")
        return pets[0] if pets else None

    # ---- user inputs ----

    def save_user_input(self, user_id: str, input_data: dict) -> str:
        input_id = str(uuid.uuid4())
        data = {"id": input_id, "user_id": user_id, "created_at": self._now().isoformat(), **input_data}
        self._set(f"users/{user_id}/user_inputs", input_id, data)
        return input_id

    def save_chat_message(self, user_id: str, message_data: dict) -> str:
        message_id = str(uuid.uuid4())
        data = {"id": message_id, "user_id": user_id, "created_at": self._now().isoformat(), **message_data}
        self._set(f"users/{user_id}/chat_messages", message_id, data)
        return message_id

    # ---- memories ----

    def upsert_private_memory(self, user_id: str, data: dict) -> None:
        existing = self._get(f"users/{user_id}/memories", "private") or {}
        merged = _merge_memory(existing, data)
        merged["updated_at"] = self._now().isoformat()
        self._set(f"users/{user_id}/memories", "private", merged)

    def upsert_public_memory(self, user_id: str, data: dict) -> None:
        existing = self._get(f"users/{user_id}/memories", "public") or {}
        merged = _merge_memory(existing, data)
        merged["updated_at"] = self._now().isoformat()
        self._set(f"users/{user_id}/memories", "public", merged)

    def get_public_memory(self, user_id: str) -> dict | None:
        return self._get(f"users/{user_id}/memories", "public")

    def get_private_memory(self, user_id: str) -> dict | None:
        return self._get(f"users/{user_id}/memories", "private")

    def add_blocked_memory(self, user_id: str, data: dict) -> str:
        data["created_at"] = self._now().isoformat()
        return self._add(f"users/{user_id}/blocked_memories", data)

    def add_review_required(self, user_id: str, data: dict) -> str:
        data["status"] = "pending"
        data["created_at"] = self._now().isoformat()
        return self._add(f"users/{user_id}/review_required", data)

    def get_review_items(self, user_id: str) -> list[dict]:
        items = self._list(f"users/{user_id}/review_required")
        return [i for i in items if i.get("status") == "pending"]

    def get_blocked_topics(self, user_id: str) -> list[str]:
        blocked = self._list(f"users/{user_id}/blocked_memories")
        return [b.get("blocked_topic", "") for b in blocked if b.get("blocked_topic")]

    def resolve_review_item(self, user_id: str, item_id: str, action: str) -> None:
        item = self._get(f"users/{user_id}/review_required", item_id)
        if not item:
            return
        if action == "approve":
            self.upsert_public_memory(user_id, {
                "safe_summaries": [item.get("candidate_summary", "")],
                "safe_topic_tags": [],
                "public_conversation_hooks": [],
                "shareable_interests": [],
            })
            self._set(f"users/{user_id}/review_required", item_id, {**item, "status": "approved"})
        elif action == "reject":
            self.add_blocked_memory(user_id, {"blocked_topic": item.get("candidate_summary", ""), "reason": "user_rejected"})
            self._set(f"users/{user_id}/review_required", item_id, {**item, "status": "rejected"})

    # ---- exchange tokens (新方式: payloadRaw ベース) ----

    def save_exchange_token(self, token_key: str, data: dict) -> None:
        """data には payload_raw, token_key, issued_by, expires_at, used を含む"""
        self._set("exchange_tokens", token_key, data)

    def get_exchange_token(self, token_key: str) -> dict | None:
        return self._get("exchange_tokens", token_key)

    def mark_exchange_token_used(self, token_key: str) -> None:
        existing = self._get("exchange_tokens", token_key) or {}
        self._set("exchange_tokens", token_key, {**existing, "used": True})

    def mark_exchange_token_used_with_session(self, token_key: str, session_id: str) -> None:
        existing = self._get("exchange_tokens", token_key) or {}
        self._set("exchange_tokens", token_key, {**existing, "used": True, "session_id": session_id})

    def delete_exchange_token(self, token_key: str) -> None:
        self._delete("exchange_tokens", token_key)

    # ---- exchange match records ----

    def save_match_record(self, data: dict) -> str:
        """resolver_id, token_owner_id, payload_raw, recorded_at, pending_id, session_id=None"""
        record_id = str(uuid.uuid4())
        data["id"] = record_id
        self._set("exchange_match_records", record_id, data)
        return record_id

    def get_match_record(self, record_id: str) -> dict | None:
        return self._get("exchange_match_records", record_id)

    def update_match_record(self, record_id: str, data: dict) -> None:
        existing = self._get("exchange_match_records", record_id) or {}
        self._set("exchange_match_records", record_id, {**existing, **data})

    def find_reverse_match(self, resolver_id: str, token_owner_id: str) -> dict | None:
        """token_owner_id が resolver_id のトークンを照合済みかチェック"""
        records = self._list("exchange_match_records")
        for r in records:
            if r.get("resolver_id") == token_owner_id and r.get("token_owner_id") == resolver_id:
                return r
        return None

    def find_pending_match_by_pending_id(self, pending_id: str) -> dict | None:
        records = self._list("exchange_match_records")
        for r in records:
            if r.get("pending_id") == pending_id:
                return r
        return None

    # ---- exchange sessions (新方式) ----

    def create_exchange_session(self, data: dict) -> str:
        session_id = str(uuid.uuid4())
        data["id"] = session_id
        data.setdefault("status", "active")
        data.setdefault("created_at", self._now().isoformat())
        data.setdefault("ended_at", None)
        data.setdefault("common_message", None)
        data.setdefault("analysis_id", None)
        self._set("exchange_sessions", session_id, data)
        return session_id

    def get_exchange_session(self, session_id: str) -> dict | None:
        return self._get("exchange_sessions", session_id)

    def update_exchange_session(self, session_id: str, data: dict) -> None:
        existing = self._get("exchange_sessions", session_id) or {}
        self._set("exchange_sessions", session_id, {**existing, **data})

    # ---- (旧方式互換: 参加者管理) ----

    def add_participant(self, session_id: str, user_id: str) -> None:
        data = {"session_id": session_id, "user_id": user_id, "approved": False, "joined_at": self._now().isoformat()}
        self._set(f"exchange_sessions/{session_id}/participants", user_id, data)

    def approve_participant(self, session_id: str, user_id: str) -> None:
        existing = self._get(f"exchange_sessions/{session_id}/participants", user_id) or {}
        self._set(f"exchange_sessions/{session_id}/participants", user_id, {**existing, "approved": True})

    def get_participants(self, session_id: str) -> list[dict]:
        return self._list(f"exchange_sessions/{session_id}/participants")

    # ---- exchange analyses ----

    def save_exchange_analysis(self, session_id: str, data: dict) -> str:
        analysis_id = str(uuid.uuid4())
        data["id"] = analysis_id
        data["session_id"] = session_id
        data["created_at"] = self._now().isoformat()
        self._set("exchange_analyses", analysis_id, data)
        self.update_exchange_session(session_id, {"analysis_id": analysis_id})
        return analysis_id

    def get_exchange_analysis(self, analysis_id: str) -> dict | None:
        return self._get("exchange_analyses", analysis_id)

    def get_analysis_by_session(self, session_id: str) -> dict | None:
        session = self.get_exchange_session(session_id)
        if not session or not session.get("analysis_id"):
            return None
        return self.get_exchange_analysis(session["analysis_id"])

    # ---- report cards ----

    def save_report_cards(self, analysis_id: str, cards: list[dict]) -> list[str]:
        ids = []
        for card in cards:
            card_id = str(uuid.uuid4())
            card["id"] = card_id
            card["created_at"] = self._now().isoformat()
            self._set(f"report_cards/{analysis_id}/cards", card_id, card)
            ids.append(card_id)
        return ids

    def get_report_cards(self, analysis_id: str) -> list[dict]:
        return self._list(f"report_cards/{analysis_id}/cards")

    def save_card_feedback(self, analysis_id: str, card_id: str, reaction: str) -> None:
        existing = self._get(f"report_cards/{analysis_id}/cards", card_id) or {}
        self._set(f"report_cards/{analysis_id}/cards", card_id, {**existing, "reaction": reaction})


def _merge_memory(existing: dict, new: dict) -> dict:
    result = dict(existing)
    for key, value in new.items():
        if isinstance(value, list) and isinstance(result.get(key), list):
            combined = result[key] + [v for v in value if v not in result[key]]
            result[key] = combined[:50]  # cap list size
        else:
            result[key] = value
    return result
