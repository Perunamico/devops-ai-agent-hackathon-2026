import asyncio
import json
import logging
import random
import uuid
from datetime import datetime, timezone

from app.schemas.encounter import (
    ExchangeTokenResponse,
    ResolveExchangeResponse,
    MatchStatusResponse,
    SessionResponse,
    ExchangeAnalysisResponse,
    ReportCard,
)
from app.services.firestore_service import FirestoreService
from app.services.token_service import TokenService
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)

_MATCH_PROMPT = """\
あなたはAIペットの仲介役です。2人のユーザーのAIペットが交流しました。
それぞれのPublic Memoryをもとに、共通点と会話のきっかけを見つけてください。

ユーザーAのPublic Memory:
{user_a_json}

ユーザーBのPublic Memory:
{user_b_json}

共有禁止トピック（両者の合計）:
{blocked_json}

出力JSON:
{{
  "common_topics": ["明示的な共通点"],
  "related_topics": ["直接は同じでないが関連する話題"],
  "conversation_hooks": ["自然に聞ける最初の一言"],
  "followup_suggestions": ["次回に深められる話題"],
  "new_interest_candidates": ["互いに紹介できそうな新しい趣味"],
  "common_message": "2人とも〜が好きなんだね！のような共通メッセージ（1文、50字以内）"
}}

注意:
- blocked_topicsに含まれる話題は絶対に出力しないでください
- 個人情報・センシティブな情報は含めないでください
- 自然な日本語で書いてください
- common_messageは両端末に表示される1文のメッセージです
"""

_BASE_URL = "https://your-app.example.com"


class EncounterAgent:
    def __init__(
        self,
        vertex_ai: VertexAIService,
        firestore: FirestoreService,
        token_service: TokenService,
    ):
        self._ai = vertex_ai
        self._db = firestore
        self._token = token_service

    def issue_token(self, user_id: str) -> ExchangeTokenResponse:
        payload_raw = self._token.generate_payload_raw()
        token_key = self._token.payload_to_token_key(payload_raw)
        from datetime import timedelta
        from app.services.token_service import TOKEN_EXPIRE_SECONDS
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=TOKEN_EXPIRE_SECONDS)

        self._db.save_exchange_token(token_key, {
            "payload_raw": payload_raw,
            "token_key": token_key,
            "issued_by": user_id,
            "expires_at": expires_at.isoformat(),
            "used": False,
        })
        qr_url = f"{_BASE_URL}/exchange?exchangeToken={token_key}"
        return ExchangeTokenResponse(
            payload_raw=payload_raw,
            token_key=token_key,
            expires_at=expires_at.isoformat(),
            qr_url=qr_url,
        )

    def resolve_token(self, user_id: str, payload_raw: list[int]) -> ResolveExchangeResponse:
        token_key = self._token.payload_to_token_key(payload_raw)
        token_doc = self._db.get_exchange_token(token_key)

        if not token_doc:
            return ResolveExchangeResponse(status="not_found")

        # 期限チェック
        expires_at = datetime.fromisoformat(token_doc["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            return ResolveExchangeResponse(status="expired")

        # 使用済みチェック
        if token_doc.get("used"):
            return ResolveExchangeResponse(status="used")

        token_owner_id = token_doc["issued_by"]

        # 自分自身チェック
        if token_owner_id == user_id:
            return ResolveExchangeResponse(status="self")

        # 自分の照合記録を保存
        pending_id = str(uuid.uuid4())
        self._db.save_match_record({
            "resolver_id": user_id,
            "token_owner_id": token_owner_id,
            "payload_raw": payload_raw,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "pending_id": pending_id,
            "session_id": None,
        })

        # 逆方向の照合が既に存在するか確認
        reverse = self._db.find_reverse_match(user_id, token_owner_id)
        if reverse:
            # 双方向成立 → セッション確立
            session_id = self._establish_session(user_id, token_owner_id, payload_raw, reverse)
            return ResolveExchangeResponse(status="matched", session_id=session_id)

        return ResolveExchangeResponse(status="waiting", pending_id=pending_id)

    def _establish_session(
        self,
        resolver_id: str,
        token_owner_id: str,
        resolver_payload: list[int],
        reverse_record: dict,
    ) -> str:
        speaker_id = random.choice([resolver_id, token_owner_id])
        session_id = self._db.create_exchange_session({
            "user_a_id": token_owner_id,
            "user_b_id": resolver_id,
            "speaker_id": speaker_id,
        })

        # 両トークンを使用済みにする
        resolver_token_key = self._token.payload_to_token_key(resolver_payload)
        self._db.mark_exchange_token_used(resolver_token_key)
        reverse_payload = reverse_record.get("payload_raw", [])
        if reverse_payload:
            owner_token_key = self._token.payload_to_token_key(reverse_payload)
            self._db.mark_exchange_token_used(owner_token_key)

        # マッチ記録を更新
        self._db.update_match_record(reverse_record.get("id", ""), {"session_id": session_id})

        # 最新の pending_id で自分のレコードを更新（find して update）
        all_my = self._db._list("exchange_match_records")
        for r in all_my:
            if r.get("resolver_id") == resolver_id and r.get("token_owner_id") == token_owner_id and not r.get("session_id"):
                self._db.update_match_record(r.get("id", ""), {"session_id": session_id})
                break

        # LLM で共通メッセージを非同期生成
        asyncio.get_event_loop().call_soon(
            lambda: asyncio.ensure_future(
                self._generate_common_message_async(session_id, token_owner_id, resolver_id)
            )
        )

        return session_id

    async def _generate_common_message_async(self, session_id: str, user_a_id: str, user_b_id: str) -> None:
        try:
            user_a_mem = self._db.get_public_memory(user_a_id) or {}
            user_b_mem = self._db.get_public_memory(user_b_id) or {}
            blocked_a = self._db.get_blocked_topics(user_a_id)
            blocked_b = self._db.get_blocked_topics(user_b_id)

            prompt = _MATCH_PROMPT.format(
                user_a_json=json.dumps(user_a_mem, ensure_ascii=False),
                user_b_json=json.dumps(user_b_mem, ensure_ascii=False),
                blocked_json=json.dumps(blocked_a + blocked_b, ensure_ascii=False),
            )
            raw = self._ai.generate_json(prompt, temperature=0.3)

            common_message = raw.get("common_message") or "うまく共通点を見つけられなかったけど、交流できたよ！"

            analysis_data = {
                "used_public_summaries": [user_a_mem, user_b_mem],
                "common_topics": raw.get("common_topics", []),
                "related_topics": raw.get("related_topics", []),
                "conversation_hooks": raw.get("conversation_hooks", []),
                "followup_suggestions": raw.get("followup_suggestions", []),
                "new_interest_candidates": raw.get("new_interest_candidates", []),
            }
            analysis_id = self._db.save_exchange_analysis(session_id, analysis_data)
            self._db.update_exchange_session(session_id, {
                "common_message": common_message,
                "analysis_id": analysis_id,
            })
        except Exception as e:
            logger.error("Common message generation failed: %s", e)
            self._db.update_exchange_session(session_id, {
                "common_message": "うまく共通点を見つけられなかったけど、交流できたよ！",
            })

    def poll_token(self, token_key: str, user_id: str) -> MatchStatusResponse:
        """User A (トークン発行者) が QR スキャン待ちポーリングに使う"""
        token_doc = self._db.get_exchange_token(token_key)
        if not token_doc:
            return MatchStatusResponse(status="waiting")
        if token_doc.get("issued_by") != user_id:
            return MatchStatusResponse(status="waiting")
        session_id = token_doc.get("session_id")
        if session_id:
            return MatchStatusResponse(status="matched", session_id=session_id)
        return MatchStatusResponse(status="waiting")

    def scan_qr_token(self, user_id: str, token_key: str) -> ResolveExchangeResponse:
        """User B が QR コードをスキャンしたときに呼ぶ。即座にセッション確立する"""
        token_doc = self._db.get_exchange_token(token_key)
        if not token_doc:
            return ResolveExchangeResponse(status="not_found")
        expires_at = datetime.fromisoformat(token_doc["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            return ResolveExchangeResponse(status="expired")
        if token_doc.get("used"):
            return ResolveExchangeResponse(status="used")
        token_owner_id = token_doc["issued_by"]
        if token_owner_id == user_id:
            return ResolveExchangeResponse(status="self")

        speaker_id = random.choice([user_id, token_owner_id])
        session_id = self._db.create_exchange_session({
            "user_a_id": token_owner_id,
            "user_b_id": user_id,
            "speaker_id": speaker_id,
        })
        self._db.mark_exchange_token_used_with_session(token_key, session_id)

        asyncio.get_event_loop().call_soon(
            lambda: asyncio.ensure_future(
                self._generate_common_message_async(session_id, token_owner_id, user_id)
            )
        )
        return ResolveExchangeResponse(status="matched", session_id=session_id)

    def get_match_status(self, pending_id: str, user_id: str) -> MatchStatusResponse:
        record = self._db.find_pending_match_by_pending_id(pending_id)
        if not record:
            return MatchStatusResponse(status="waiting")
        session_id = record.get("session_id")
        if session_id:
            return MatchStatusResponse(status="matched", session_id=session_id)
        return MatchStatusResponse(status="waiting")

    def get_session(self, session_id: str, user_id: str) -> SessionResponse:
        from fastapi import HTTPException
        session = self._db.get_exchange_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if user_id not in (session.get("user_a_id"), session.get("user_b_id")):
            raise HTTPException(status_code=403, detail="Not a participant")
        return SessionResponse(
            session_id=session_id,
            status=session.get("status", "active"),
            speaker_id=session.get("speaker_id", ""),
            common_message=session.get("common_message"),
            analysis_id=session.get("analysis_id"),
            ended_by=session.get("ended_by"),
        )

    def end_session(self, session_id: str, user_id: str) -> None:
        from fastapi import HTTPException
        session = self._db.get_exchange_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        self._db.update_exchange_session(session_id, {
            "status": "ended",
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "ended_by": user_id,
        })

    def get_analysis(self, session_id: str) -> ExchangeAnalysisResponse:
        """旧 AnalysisScreen 互換用"""
        from fastapi import HTTPException
        analysis = self._db.get_analysis_by_session(session_id)
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not ready yet")
        return ExchangeAnalysisResponse(
            session_id=session_id,
            analysis_id=analysis["id"],
            common_topics=analysis.get("common_topics", []),
            related_topics=analysis.get("related_topics", []),
            conversation_hooks=analysis.get("conversation_hooks", []),
            followup_suggestions=analysis.get("followup_suggestions", []),
            on_site_cards=[],
        )
