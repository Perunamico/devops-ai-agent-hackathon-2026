import asyncio
import json
import logging
import random
import threading
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
from app.config import get_settings
from app.services.firestore_service import FirestoreService
from app.services.token_service import TokenService
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)


def _run_background_coro(coro) -> None:
    """Run an async background task from FastAPI sync routes.

    Sync endpoints are executed in an AnyIO worker thread where
    asyncio.get_event_loop() can raise. If a loop is already running, schedule
    onto it; otherwise run the coroutine in a short-lived daemon thread.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()
        return
    loop.create_task(coro)

_MATCH_PROMPT = """\
あなたはAIペットの仲介役です。2人のユーザーのAIペットが交流しました。
それぞれのPublic Memoryをもとに、共通点と会話のきっかけを見つけてください。

ユーザーAのPublic Memory:
{user_a_json}

ユーザーBのPublic Memory:
{user_b_json}

ユーザーAの熱量ヒント（共有可能な話題ごとの好きの強さ）:
{user_a_hints_json}

ユーザーBの熱量ヒント:
{user_b_hints_json}

共有禁止トピック（両者の合計）:
{blocked_json}

出力JSON:
{{
  "common_topics": ["明示的な共通点（深い順に並べる）"],
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

## 深さを最優先する
- common_message の選定は「深さ」を最優先してください。深さ =
  (1) 具体性: 大カテゴリの一致より、具体的なタイトル・アーティスト・小カテゴリの
      一致ほど深いとみなす（例: 「アニメ」より「『鬼滅の刃』」が深い）。
  (2) 相互熱量: 熱量ヒントで両者ともに intensity=high の話題ほど深いとみなす。
- 具体的で、かつ両者とも熱量が高い共通点があれば、広いカテゴリの一致より必ず
  それを common_message に選んでください。
- common_topics も深い順（具体的かつ相互に熱量が高い順）に並べてください。
"""


_PERSONAL_PROMPT = """\
あなたはこのユーザー専属のAIペットです。相手との共通トピックについて、
このユーザー「自身」の視点で、交流中に本人にだけ見せる一言メッセージと、
その人だけの「好きなポイント」を作ってください。これは相手には共有されません。

共通トピック（深い順。先頭ほど具体的で相互に熱量が高い）:
{common_topics_json}

このユーザーのPrivate Memory（本人専用・相手には共有されません）:
{private_profiles_json}

出力JSON:
{{
  "message": "交流中に本人だけに出す1文の会話サジェスト",
  "points": [
    {{"topic": "共通トピック名", "point": "このユーザーならではの好きなポイント（1〜2文、60字以内）"}}
  ]
}}

message の作り方（重要）:
- common_topics のうち、このユーザーに「好きなポイント」がある**最も深い（先頭に近い）トピック**を主題にする。
- 「2人とも『(トピック名)』が大好きなんだね！」で始め、続けて**本人の好きなポイントを
  「〜っていうお話をしたら？」という会話のサジェスト**として自然に1文で繋ぐ。
  例: 「2人とも『鬼滅の刃』が大好きなんだね！煉獄さんの生き様に泣いたっていうお話をしたら？」
- 本人に該当する好きなポイントが1つも無ければ、message は空文字 "" にする（無理に作らない）。
- 全体は自然な日本語の1文（80字以内目安）。

points の作り方:
- common_topics に含まれる話題についてのみ point を作る。
- Private Memory の reason/emotion/context など、本人の実際の理由・感情を反映する。
- 該当する情報が Private Memory に無いトピックは省略してよい。
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
        base_url = get_settings().app_base_url.rstrip("/")
        qr_url = f"{base_url}/?exchangeToken={token_key}"
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
        # このペアに既にアクティブなセッションがあれば再利用する（冪等化）。
        # 同時照合による二重セッション生成を防ぎ、両側を同一セッションへ収束させる。
        existing = self._db.find_active_session_by_pair(token_owner_id, resolver_id)
        session_id = existing.get("id") if existing else None
        if not session_id:
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

        # マッチ記録を更新（get_match_status のフォールバックとしても機能）
        self._db.update_match_record(reverse_record.get("id", ""), {"session_id": session_id})

        # 最新の pending_id で自分のレコードを更新（find して update）
        all_my = self._db._list("exchange_match_records")
        for r in all_my:
            if r.get("resolver_id") == resolver_id and r.get("token_owner_id") == token_owner_id and not r.get("session_id"):
                self._db.update_match_record(r.get("id", ""), {"session_id": session_id})
                break

        # LLM で共通メッセージを非同期生成（既存セッション再利用時は二重起動しない）
        if not existing:
            _run_background_coro(
                self._generate_common_message_async(session_id, token_owner_id, resolver_id)
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
                user_a_hints_json=json.dumps(self._intensity_hints(user_a_id, user_a_mem), ensure_ascii=False),
                user_b_hints_json=json.dumps(self._intensity_hints(user_b_id, user_b_mem), ensure_ascii=False),
                blocked_json=json.dumps(blocked_a + blocked_b, ensure_ascii=False),
            )
            raw = self._ai.generate_json(prompt, temperature=0.3)

            common_message = raw.get("common_message") or "うまく共通点を見つけられなかったけど、交流できたよ！"
            common_topics = raw.get("common_topics", [])

            # 各ユーザーの per-user メッセージ＋「好きなポイント」を本人の Private Memory から生成する。
            # generate_json は同期ブロッキングなので to_thread でオフロードして並行実行する。
            (msg_a, points_a), (msg_b, points_b) = await asyncio.gather(
                asyncio.to_thread(self._generate_personal, common_topics, user_a_id),
                asyncio.to_thread(self._generate_personal, common_topics, user_b_id),
            )

            analysis_data = {
                "used_public_summaries": [user_a_mem, user_b_mem],
                "common_topics": common_topics,
                "related_topics": raw.get("related_topics", []),
                "conversation_hooks": raw.get("conversation_hooks", []),
                "followup_suggestions": raw.get("followup_suggestions", []),
                "new_interest_candidates": raw.get("new_interest_candidates", []),
                # 本人だけに見せる。エンドポイント側で呼び出しユーザーのぶんだけ返す。
                "personal_points": {user_a_id: points_a, user_b_id: points_b},
            }
            analysis_id = self._db.save_exchange_analysis(session_id, analysis_data)

            # 交流中メッセージはユーザーごとに出し分ける（本人の好きなポイントを織り込む）。
            # 本人ぶんが空のときは共通の common_message にフォールバックする。
            by_user: dict[str, str] = {}
            if msg_a:
                by_user[user_a_id] = msg_a
            if msg_b:
                by_user[user_b_id] = msg_b
            self._db.update_exchange_session(session_id, {
                "common_message": common_message,
                "common_message_by_user": by_user,
                "analysis_id": analysis_id,
            })
        except Exception as e:
            logger.error("Common message generation failed: %s", e)
            self._db.update_exchange_session(session_id, {
                "common_message": "うまく共通点を見つけられなかったけど、交流できたよ！",
            })

    def _intensity_hints(self, user_id: str, public_mem: dict) -> list[dict]:
        """共有可能な話題に限って、private の熱量(intensity)を補助入力として渡す。

        Public Memory には熱量が無いため、深い一致（相互熱量）の判定材料を補う。
        shareable_interests に載っている（=共有OKな）トピックだけを対象にするので、
        private の生 content を漏らさない。
        """
        shareable = set(public_mem.get("shareable_interests") or [])
        if not shareable:
            return []
        profiles = (self._db.get_private_memory(user_id) or {}).get("profiles") or []
        hints: list[dict] = []
        for p in profiles:
            topic = p.get("topic")
            if topic and topic in shareable:
                hints.append({
                    "topic": topic,
                    "category_small": p.get("category_small", ""),
                    "intensity": p.get("intensity", "medium"),
                    "preference": p.get("preference", "interested"),
                })
        return hints

    def _generate_personal(self, common_topics: list[str], user_id: str) -> tuple[str, list[dict]]:
        """共通トピックについて、本人の Private Memory から
        交流中の per-user メッセージと「自分だけの好きなポイント」を生成する。

        本人専用表示なので private / summary_only 段階の contents も入力してよい。
        common_topics に一致した profile だけを LLM に渡す。
        一致無し・失敗時は ("", []) を返す（=共通フォールバックに委ねる）。
        """
        if not common_topics:
            return "", []
        try:
            profiles = (self._db.get_private_memory(user_id) or {}).get("profiles") or []
            matched = _match_profiles_to_topics(profiles, common_topics)
            if not matched:
                return "", []
            prompt = _PERSONAL_PROMPT.format(
                common_topics_json=json.dumps(common_topics, ensure_ascii=False),
                private_profiles_json=json.dumps(matched, ensure_ascii=False),
            )
            raw = self._ai.generate_json(prompt, temperature=0.4)
            message = raw.get("message") or ""
            points = raw.get("points", [])
            clean_points = [p for p in points if isinstance(p, dict) and p.get("topic") and p.get("point")]
            return (message if isinstance(message, str) else ""), clean_points
        except Exception as e:
            logger.error("Personal generation failed for %s: %s", user_id, e)
            return "", []

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

        # 音声ルートとの併用でも二重セッションを作らないよう、ペア単位で冪等化する。
        existing = self._db.find_active_session_by_pair(token_owner_id, user_id)
        if existing:
            session_id = existing.get("id")
            self._db.mark_exchange_token_used_with_session(token_key, session_id)
            return ResolveExchangeResponse(status="matched", session_id=session_id)

        speaker_id = random.choice([user_id, token_owner_id])
        session_id = self._db.create_exchange_session({
            "user_a_id": token_owner_id,
            "user_b_id": user_id,
            "speaker_id": speaker_id,
        })
        self._db.mark_exchange_token_used_with_session(token_key, session_id)

        _run_background_coro(
            self._generate_common_message_async(session_id, token_owner_id, user_id)
        )
        return ResolveExchangeResponse(status="matched", session_id=session_id)

    def get_match_status(self, pending_id: str, user_id: str) -> MatchStatusResponse:
        record = self._db.find_pending_match_by_pending_id(pending_id)
        if not record:
            return MatchStatusResponse(status="waiting")
        session_id = record.get("session_id")
        if session_id:
            return MatchStatusResponse(status="matched", session_id=session_id)
        # レコードへの session_id 反映は重複レコードで取り違えが起き得るため、
        # このペアにアクティブセッションが実在するかを正本として判定する。
        session = self._db.find_active_session_by_pair(
            record.get("resolver_id", ""), record.get("token_owner_id", "")
        )
        if session:
            return MatchStatusResponse(status="matched", session_id=session.get("id"))
        return MatchStatusResponse(status="waiting")

    def mark_ready(self, session_id: str, user_id: str) -> None:
        """相互確認ゲート: 呼び出し本人が成功画面へ到達したことを記録する。"""
        from fastapi import HTTPException
        session = self._db.get_exchange_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if user_id not in (session.get("user_a_id"), session.get("user_b_id")):
            raise HTTPException(status_code=403, detail="Not a participant")
        self._db.mark_session_ready(session_id, user_id)

    def get_session(self, session_id: str, user_id: str) -> SessionResponse:
        from fastapi import HTTPException
        session = self._db.get_exchange_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if user_id not in (session.get("user_a_id"), session.get("user_b_id")):
            raise HTTPException(status_code=403, detail="Not a participant")
        # 交流中メッセージは本人ぶんを優先し、無ければ共通メッセージにフォールバックする。
        by_user = session.get("common_message_by_user") or {}
        common_message = by_user.get(user_id) or session.get("common_message")
        # 双方が到達を通知したときだけ both_ready=True（片方だけの成功遷移を防ぐ）。
        ready = set(session.get("ready_user_ids") or [])
        both_ready = {session.get("user_a_id"), session.get("user_b_id")}.issubset(ready)
        return SessionResponse(
            session_id=session_id,
            status=session.get("status", "active"),
            speaker_id=session.get("speaker_id", ""),
            common_message=common_message,
            analysis_id=session.get("analysis_id"),
            ended_by=session.get("ended_by"),
            both_ready=both_ready,
        )

    def end_session(self, session_id: str, user_id: str) -> None:
        from fastapi import HTTPException
        session = self._db.get_exchange_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if user_id not in (session.get("user_a_id"), session.get("user_b_id")):
            raise HTTPException(status_code=403, detail="Not a participant")
        self._db.update_exchange_session(session_id, {
            "status": "ended",
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "ended_by": user_id,
        })

    def get_analysis(self, session_id: str, user_id: str) -> ExchangeAnalysisResponse:
        """AnalysisScreen 用。personal_points は呼び出し本人のぶんだけ返す。"""
        from fastapi import HTTPException
        session = self._db.get_exchange_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if user_id not in (session.get("user_a_id"), session.get("user_b_id")):
            raise HTTPException(status_code=403, detail="Not a participant")
        analysis = self._db.get_analysis_by_session(session_id)
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not ready yet")
        my_points = (analysis.get("personal_points") or {}).get(user_id, [])
        return ExchangeAnalysisResponse(
            session_id=session_id,
            analysis_id=analysis["id"],
            common_topics=analysis.get("common_topics", []),
            related_topics=analysis.get("related_topics", []),
            conversation_hooks=analysis.get("conversation_hooks", []),
            followup_suggestions=analysis.get("followup_suggestions", []),
            on_site_cards=[],
            personal_points=my_points,
        )


def _match_profiles_to_topics(profiles: list[dict], common_topics: list[str]) -> list[dict]:
    """common_topics（LLMが返す素の文字列）に一致する private profile を選ぶ。

    common_topics には category_large が無いのでトピック名の正規化（strip+lower）で
    照合する。完全一致→部分一致（どちらかがどちらかを含む）でフォールバックする。
    """
    normalized_topics = [t.strip().lower() for t in common_topics if isinstance(t, str) and t.strip()]
    if not normalized_topics:
        return []
    matched: list[dict] = []
    for p in profiles:
        name = (p.get("topic") or "").strip().lower()
        if not name:
            continue
        if any(name == t or name in t or t in name for t in normalized_topics):
            matched.append(p)
    return matched
