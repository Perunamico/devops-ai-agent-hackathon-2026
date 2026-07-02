import uuid
import logging
from datetime import datetime, timezone
from typing import Any

from app.config import Settings

logger = logging.getLogger(__name__)

# private プロフィール内の content を get_memory_list の確認依頼項目として
# 採番するときの ID 規則。承認API側（resolve_review_item）でこの ID を解釈する。
_PROFILE_CONTENT_ID_PREFIX = "private-profile-"


def _profile_content_id(profile_index: int, content_index: int) -> str:
    return f"{_PROFILE_CONTENT_ID_PREFIX}{profile_index}-{content_index}"


def _parse_profile_content_id(item_id: str) -> tuple[int, int] | None:
    """`private-profile-{i}-{j}` を (i, j) に解析する。
    トピック単位の `private-profile-{i}` や他形式の ID は None を返す。"""
    if not item_id.startswith(_PROFILE_CONTENT_ID_PREFIX):
        return None
    parts = item_id[len(_PROFILE_CONTENT_ID_PREFIX):].split("-")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0]), int(parts[1])
    except ValueError:
        return None


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

    def get_recent_chat_messages(self, user_id: str, limit: int = 8) -> list[dict]:
        """直近の会話を created_at 昇順（古い→新しい）で末尾 limit 件返す。

        Firestore は order_by で取得、in-memory フォールバックは _list が順序を保証しないため
        created_at でソートする。
        """
        collection = f"users/{user_id}/chat_messages"
        if self._db:
            from google.cloud import firestore
            docs = (
                self._db.collection(collection)
                .order_by("created_at", direction=firestore.Query.DESCENDING)
                .limit(limit)
                .stream()
            )
            items = [{**d.to_dict(), "id": d.id} for d in docs]
            items.reverse()  # 昇順に戻す
            return items
        items = self._list(collection)
        items.sort(key=lambda m: m.get("created_at", ""))
        return items[-limit:]

    def count_chat_messages(self, user_id: str) -> int:
        """これまでの会話往復数（chat_messages ドキュメント数）を返す。

        記憶要約を注入するタイミング判定に使う。Firestore は count 集約クエリ、
        in-memory フォールバックは _list の件数で数える。
        """
        collection = f"users/{user_id}/chat_messages"
        if self._db:
            try:
                result = self._db.collection(collection).count().get()
                # count().get() は [[AggregationResult(value=...)]] を返す
                return int(result[0][0].value)
            except Exception as e:
                logger.warning("count_chat_messages aggregation failed, falling back to stream: %s", e)
                return sum(1 for _ in self._db.collection(collection).stream())
        return len(self._list(collection))

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

    def set_public_memory_fields(self, user_id: str, data: dict) -> None:
        """公開メモリの指定フィールドを丸ごと置換する（union 追記しない）。

        upsert_public_memory はリストを追記マージするため、毎ターン再構成すると
        カードが増え続ける。公開カードは統合済みプロフィールから作り直して置換する。
        """
        existing = self._get(f"users/{user_id}/memories", "public") or {}
        existing.update(data)
        existing["updated_at"] = self._now().isoformat()
        self._set(f"users/{user_id}/memories", "public", existing)

    def set_private_memory_profiles(self, user_id: str, profiles: list[dict]) -> None:
        """嗜好プロフィール配列を丸ごと上書きする（毎ターン再構成のマージ結果を反映）。

        upsert_private_memory はリストを追記マージするため、トピック更新では重複が残る。
        ここでは profiles フィールドだけを置き換える。
        """
        existing = self._get(f"users/{user_id}/memories", "private") or {}
        existing["profiles"] = profiles
        existing["updated_at"] = self._now().isoformat()
        self._set(f"users/{user_id}/memories", "private", existing)

    def get_selected_labels(self, user_id: str) -> list[dict]:
        """ユーザーがルールベースで選んだ「好きなもの」ラベルの正本を返す。"""
        return (self._get(f"users/{user_id}/memories", "private") or {}).get("selected_labels") or []

    def set_selected_labels(self, user_id: str, labels: list[dict]) -> None:
        """選択ラベルの正本を丸ごと置換する（設定画面での編集を反映）。"""
        existing = self._get(f"users/{user_id}/memories", "private") or {}
        existing["selected_labels"] = labels
        existing["updated_at"] = self._now().isoformat()
        self._set(f"users/{user_id}/memories", "private", existing)

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

    def get_memory_list(self, user_id: str) -> dict[str, list[dict]]:
        review = [
            {
                "id": item.get("id", ""),
                "summary": item.get("candidate_summary", ""),
                "detail": item.get("reason", ""),
                "source": "review_required",
                "created_at": item.get("created_at", ""),
                "can_approve": True,
            }
            for item in self.get_review_items(user_id)
            if item.get("candidate_summary")
        ]

        allowed: list[dict] = []
        secret: list[dict] = []
        seen_allowed: set[str] = set()
        seen_secret: set[str] = set()

        def add_item(items: list[dict], seen: set[str], item: dict) -> None:
            summary = str(item.get("summary") or "").strip()
            if not summary or summary in seen:
                return
            seen.add(summary)
            items.append({**item, "summary": summary})

        private_memory = self.get_private_memory(user_id) or {}
        public_memory = self.get_public_memory(user_id) or {}
        profiles = private_memory.get("profiles") or []

        # 未確認（未深掘り）のラベルは、カード文言に「（未確認）」を添える。
        # 会話で深掘りされると profile が置換され unconfirmed が外れてマークも消える。
        unconfirmed_names = {
            str(p.get("topic") or "").strip()
            for p in profiles
            if p.get("origin") == "label" and p.get("unconfirmed")
        }
        unconfirmed_names.discard("")

        def mark(summary: str) -> str:
            s = str(summary or "").strip()
            return f"{s}（未確認）" if s in unconfirmed_names else summary

        # 公開カードのチップに出す「中身のカテゴリー(category_large)」の対応表。
        # いずれもメモリ保存エージェントが決めたカテゴリーを使う:
        #   - profiles 由来の要約 → そのプロフィールの category_large
        #   - review 承認など profiles を通らない要約 → 保存済み summary_categories
        summary_category: dict[str, str] = dict(public_memory.get("summary_categories") or {})
        for profile in profiles:
            large = profile.get("category_large") or ""
            if not large:
                continue
            for content in profile.get("contents") or []:
                text = str(content.get("content") or "").strip()
                if text:
                    summary_category[text] = large

        for index, value in enumerate(public_memory.get("safe_summaries") or []):
            add_item(allowed, seen_allowed, {
                "id": f"public-safe_summaries-{index}",
                "summary": mark(value),
                "detail": "公開要約",
                "source": "public",
                "created_at": public_memory.get("updated_at", ""),
                # チップは中身のカテゴリーのみ。対応が無ければ空にしてチップを出さない。
                "category": summary_category.get(str(value).strip(), ""),
            })

        for profile_index, profile in enumerate(profiles):
            topic = profile.get("topic") or "未分類の記憶"
            category = " / ".join(
                part for part in (
                    profile.get("category_large"),
                    profile.get("category_medium"),
                    profile.get("category_small"),
                )
                if part
            )
            contents = profile.get("contents") or []
            if not contents and topic not in seen_allowed:
                add_item(secret, seen_secret, {
                    "id": f"private-profile-{profile_index}",
                    "summary": topic,
                    "detail": category,
                    "source": "private",
                    "created_at": private_memory.get("updated_at", ""),
                    "category": profile.get("category_large", ""),
                })
            for content_index, content in enumerate(contents):
                shareability = content.get("shareability")
                item = {
                    "id": _profile_content_id(profile_index, content_index),
                    "summary": mark(content.get("content") or topic),
                    "detail": category or topic,
                    "source": "private",
                    "created_at": private_memory.get("updated_at", ""),
                    "category": profile.get("category_large", "") or topic,
                }
                if shareability in ("ok", "summary_only"):
                    add_item(allowed, seen_allowed, item | {"source": "public"})
                elif shareability == "unknown":
                    # 共有可否が未確認の内容は確認依頼に出し、公開/非公開を選べるようにする。
                    review.append(item | {"can_approve": True})
                else:
                    add_item(secret, seen_secret, item)

        # interests / hooks / tags はマッチング用に保存はするが、カードとしては並べない。
        # interests / values / recent_topics はトピックのタグであり、
        # エピソード（profiles）と重複する。カードとしては並べない（保存は維持）。

        for key, detail in (
            ("conversation_style_notes", "会話スタイル"),
            ("preferred_suggestion_style", "提案スタイル"),
        ):
            value = private_memory.get(key)
            if value:
                add_item(secret, seen_secret, {
                    "id": f"private-{key}",
                    "summary": value,
                    "detail": detail,
                    "source": "private",
                    "created_at": private_memory.get("updated_at", ""),
                    "category": detail,
                })

        for index, item in enumerate(self._list(f"users/{user_id}/blocked_memories")):
            add_item(secret, seen_secret, {
                "id": item.get("id", f"blocked-{index}"),
                "summary": item.get("blocked_topic", ""),
                "detail": item.get("reason", "共有しない情報"),
                "source": "blocked",
                "created_at": item.get("created_at", ""),
            })

        return {"review": review, "allowed": allowed, "secret": secret}

    def get_blocked_topics(self, user_id: str) -> list[str]:
        blocked = self._list(f"users/{user_id}/blocked_memories")
        return [b.get("blocked_topic", "") for b in blocked if b.get("blocked_topic")]

    def resolve_review_item(self, user_id: str, item_id: str, action: str) -> None:
        # private プロフィール内の未確認(unknown)内容は review_required ドキュメントを
        # 持たないため、profiles の shareability を直接書き換えて確定する。
        location = _parse_profile_content_id(item_id)
        if location is not None:
            self._resolve_profile_content(user_id, location, action)
            return

        item = self._get(f"users/{user_id}/review_required", item_id)
        if not item:
            return
        if action == "approve":
            candidate = item.get("candidate_summary", "")
            category = item.get("category_large", "")
            self.upsert_public_memory(user_id, {
                "safe_summaries": [candidate],
                "safe_topic_tags": [],
                "public_conversation_hooks": [],
                "shareable_interests": [],
                # カードのチップに出すカテゴリー（エージェントが決めたもの）を保存。
                "summary_categories": {candidate: category} if candidate else {},
            })
            self._set(f"users/{user_id}/review_required", item_id, {**item, "status": "approved"})
        elif action == "reject":
            self.add_blocked_memory(user_id, {"blocked_topic": item.get("candidate_summary", ""), "reason": "user_rejected"})
            self._set(f"users/{user_id}/review_required", item_id, {**item, "status": "rejected"})

    def _resolve_profile_content(
        self, user_id: str, location: tuple[int, int], action: str
    ) -> None:
        """private プロフィール内の content の shareability を確定する。
        approve なら "ok"（公開へ反映）、reject なら "private"（秘匿のまま）。"""
        profile_index, content_index = location
        private_memory = self.get_private_memory(user_id) or {}
        profiles = private_memory.get("profiles") or []
        if not (0 <= profile_index < len(profiles)):
            return
        profile = profiles[profile_index]
        contents = profile.get("contents") or []
        if not (0 <= content_index < len(contents)):
            return
        content = contents[content_index]

        if action == "approve":
            content["shareability"] = "ok"
            self.set_private_memory_profiles(user_id, profiles)
            # _persist_profiles の公開反映に倣い、要約・興味・タグを Public Memory へ追加。
            category_path = [
                profile.get("category_large"),
                profile.get("category_medium"),
                profile.get("category_small"),
            ]
            text = content.get("content")
            topic = profile.get("topic")
            self.upsert_public_memory(user_id, {
                "safe_summaries": [text] if text else [],
                "shareable_interests": [topic] if topic else [],
                "safe_topic_tags": [t for t in category_path if t],
            })
        elif action == "reject":
            content["shareability"] = "private"
            self.set_private_memory_profiles(user_id, profiles)

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
        # 相互確認ゲート用: 各ユーザーが「成功画面に到達した」ことを記録する。
        data.setdefault("ready_user_ids", [])
        self._set("exchange_sessions", session_id, data)
        return session_id

    def get_exchange_session(self, session_id: str) -> dict | None:
        return self._get("exchange_sessions", session_id)

    def update_exchange_session(self, session_id: str, data: dict) -> None:
        existing = self._get("exchange_sessions", session_id) or {}
        self._set("exchange_sessions", session_id, {**existing, **data})

    def find_active_session_by_pair(self, user_x: str, user_y: str) -> dict | None:
        """このユーザーペアのアクティブなセッションを返す（冪等な get-or-create の土台）。

        同時照合で複数生成されても両側が同一セッションへ収束するよう、created_at 昇順で
        先頭1件を返す。_list は順序を保証しないため明示的にソートする。
        """
        pair = {user_x, user_y}
        candidates = [
            s for s in self._list("exchange_sessions")
            if s.get("status") == "active"
            and {s.get("user_a_id"), s.get("user_b_id")} == pair
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda s: s.get("created_at", ""))
        return candidates[0]

    def mark_session_ready(self, session_id: str, user_id: str) -> None:
        """セッションの ready_user_ids に user_id を重複なく追加する。"""
        existing = self._get("exchange_sessions", session_id) or {}
        ready = list(existing.get("ready_user_ids") or [])
        if user_id not in ready:
            ready.append(user_id)
            self._set("exchange_sessions", session_id, {**existing, "ready_user_ids": ready})

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

    # ---- friends（交流が成立した相手の一覧）----

    def get_friends_overview(self, user_id: str) -> dict:
        """「あそぶ」で交流が成立した相手ごとの一覧と統計を返す。

        exchange_sessions は双方向照合（音声）または QR スキャンが成立したときにしか
        作られないため、セッションに載っている相手 = 交流に成功した相手。
        相手ごとに最新セッションを採用し、共通の話題はその交流の分析結果から取る。
        """
        sessions = [
            s for s in self._list("exchange_sessions")
            if user_id in (s.get("user_a_id"), s.get("user_b_id"))
        ]
        sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)

        friends: list[dict] = []
        seen: set[str] = set()
        topic_total = 0
        for session in sessions:
            other_id = (
                session.get("user_b_id")
                if session.get("user_a_id") == user_id
                else session.get("user_a_id")
            )
            if not other_id or other_id in seen:
                continue
            seen.add(other_id)

            analysis = self.get_analysis_by_session(session.get("id", "")) or {}
            topics = [t for t in analysis.get("common_topics", []) if isinstance(t, str) and t.strip()]
            topic_total += len(dict.fromkeys(topics))

            # 交流中メッセージと同じ優先順位: 本人向け → 共通メッセージ。
            by_user = session.get("common_message_by_user") or {}
            comment = by_user.get(user_id) or session.get("common_message") or ""

            pet = self.get_pet_by_user(other_id)
            friends.append({
                "user_id": other_id,
                "pet_name": (pet or {}).get("name") or "なまえのないペット",
                "last_interacted_at": session.get("created_at", ""),
                "common_topics": topics[:3],
                "comment": comment,
            })

        return {
            "friends": friends,
            "friend_count": len(friends),
            "common_topic_count": topic_total,
            "last_interaction_at": sessions[0].get("created_at") if sessions else None,
        }

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
        elif isinstance(value, dict) and isinstance(result.get(key), dict):
            merged = dict(result[key])
            merged.update(value)
            result[key] = merged
        else:
            result[key] = value
    return result
