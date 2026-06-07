import json
import logging
from datetime import datetime, timezone

from app.schemas.encounter import (
    ExchangeTokenResponse,
    JoinExchangeRequest,
    JoinExchangeResponse,
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
  "new_interest_candidates": ["互いに紹介できそうな新しい趣味"]
}}

注意:
- blocked_topicsに含まれる話題は絶対に出力しないでください
- 個人情報・センシティブな情報は含めないでください
- 自然な日本語で書いてください
"""


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
        token_str, expires_at = self._token.generate_exchange_token()
        frequencies = self._token.encode_token_to_frequencies(token_str)
        self._db.save_exchange_token(token_str, {
            "token": token_str,
            "issued_by": user_id,
            "expires_at": expires_at.isoformat(),
        })
        qr_data = f"https://your-app.example.com/exchange?token={token_str}"
        return ExchangeTokenResponse(
            token=token_str,
            expires_at=expires_at.isoformat(),
            sound_frequencies=frequencies,
            qr_data=qr_data,
        )

    def join_session(self, user_id: str, req: JoinExchangeRequest) -> JoinExchangeResponse:
        token_doc = self._db.get_exchange_token(req.token)
        if not token_doc:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Token not found")

        expires_at = datetime.fromisoformat(token_doc["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            from fastapi import HTTPException
            raise HTTPException(status_code=410, detail="Token expired")

        issuer_id = token_doc["issued_by"]

        # Find or create session
        session_id = self._db.create_exchange_session({
            "exchange_method": req.exchange_method,
            "issuer_id": issuer_id,
            "joiner_id": user_id,
        })
        self._db.add_participant(session_id, issuer_id)
        self._db.add_participant(session_id, user_id)
        self._db.delete_exchange_token(req.token)

        return JoinExchangeResponse(session_id=session_id, status="waiting")

    def approve_exchange(self, session_id: str, user_id: str, approved: bool) -> dict:
        if not approved:
            return {"status": "cancelled"}

        self._db.approve_participant(session_id, user_id)
        participants = self._db.get_participants(session_id)
        all_approved = all(p.get("approved") for p in participants)

        if all_approved and len(participants) >= 2:
            self._db.update_exchange_session(session_id, {"status": "confirmed"})
            analysis = self._run_analysis(session_id, participants)
            return {"status": "confirmed", "analysis_id": analysis.analysis_id}

        return {"status": "waiting"}

    def _run_analysis(self, session_id: str, participants: list[dict]) -> ExchangeAnalysisResponse:
        user_ids = [p["user_id"] for p in participants]
        if len(user_ids) < 2:
            return self._empty_analysis(session_id)

        user_a_mem = self._db.get_public_memory(user_ids[0]) or {}
        user_b_mem = self._db.get_public_memory(user_ids[1]) or {}
        blocked_a = self._db.get_blocked_topics(user_ids[0])
        blocked_b = self._db.get_blocked_topics(user_ids[1])

        prompt = _MATCH_PROMPT.format(
            user_a_json=json.dumps(user_a_mem, ensure_ascii=False),
            user_b_json=json.dumps(user_b_mem, ensure_ascii=False),
            blocked_json=json.dumps(blocked_a + blocked_b, ensure_ascii=False),
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.3)
        except Exception as e:
            logger.error("LLM2 encounter analysis failed: %s", e)
            raw = {}

        analysis_data = {
            "used_public_summaries": [user_a_mem, user_b_mem],
            "common_topics": raw.get("common_topics", []),
            "related_topics": raw.get("related_topics", []),
            "conversation_hooks": raw.get("conversation_hooks", []),
            "followup_suggestions": raw.get("followup_suggestions", []),
            "new_interest_candidates": raw.get("new_interest_candidates", []),
        }
        analysis_id = self._db.save_exchange_analysis(session_id, analysis_data)
        return ExchangeAnalysisResponse(
            session_id=session_id,
            analysis_id=analysis_id,
            **{k: v for k, v in analysis_data.items() if k in ExchangeAnalysisResponse.model_fields},
        )

    def get_analysis(self, session_id: str) -> ExchangeAnalysisResponse:
        analysis = self._db.get_analysis_by_session(session_id)
        if not analysis:
            from fastapi import HTTPException
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

    def _empty_analysis(self, session_id: str) -> ExchangeAnalysisResponse:
        analysis_id = self._db.save_exchange_analysis(session_id, {
            "common_topics": [], "related_topics": [],
            "conversation_hooks": [], "followup_suggestions": [],
        })
        return ExchangeAnalysisResponse(session_id=session_id, analysis_id=analysis_id)
