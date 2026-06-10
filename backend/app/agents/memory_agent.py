import json
import logging

from app.config import Settings
from app.schemas.memory import MemoryClassifyResult
from app.schemas.pet import UserInputCreate
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService
from app.utils.rule_filter import is_obviously_blocked

logger = logging.getLogger(__name__)

_CLASSIFY_PROMPT = """\
あなたはAIペットです。ユーザーの入力を読み、以下のJSON形式で分類してください。

ユーザーの入力:
{content}

過去の共有禁止トピック:
{blocked_topics_json}

分類ルール:
- private: ユーザー個人の深い理解のためだけに使う情報
- public: 趣味・関心・話しやすい話題で、相手と共有してよい情報
- blocked: 連絡先・住所・センシティブな個人情報・共有禁止情報
- review_required: 共有してよいか判断が難しい情報（ユーザー確認が必要）

出力JSON:
{{
  "category": "private|public|blocked|review_required",
  "interests": ["抽出した興味・関心"],
  "values": ["抽出した価値観"],
  "recent_topics": ["最近の話題"],
  "conversation_style_notes": "会話スタイルの観察（任意）",
  "safe_summary": "相手のペットに伝えてよい要約（publicの場合のみ）",
  "blocked_reason": "blockedの場合のみ理由を記載",
  "review_reason": "review_requiredの場合のみ理由を記載"
}}

注意: safe_summaryは具体的な個人情報を含まない抽象的な表現にしてください。
例: "カフェで作業するのが好き" → OK / "渋谷の〇〇カフェの会員" → NG
"""

_UPDATE_PROMPT = """\
あなたはAIペットです。ユーザーが交流レポートのカードに対して以下の反応を示しました。
これをもとに、ユーザーの興味・好みの提案スタイルを更新するためのJSON分析を行ってください。

反応データ:
{reactions_json}

現在のPublic Memory:
{public_memory_json}

出力JSON:
{{
  "interests_reinforced": ["ユーザーが好反応を示した話題"],
  "interests_weakened": ["ユーザーが否定的だった話題"],
  "preferred_suggestion_style": "detailed|casual|question_form",
  "new_interest_candidates": ["新しい関心候補"]
}}
"""


class MemoryAgent:
    def __init__(self, vertex_ai: VertexAIService, firestore: FirestoreService):
        self._ai = vertex_ai
        self._db = firestore

    def classify_and_store(self, user_id: str, user_input: UserInputCreate) -> MemoryClassifyResult:
        blocked_topics = self._db.get_blocked_topics(user_id)

        # Rule-based pre-filter
        if is_obviously_blocked(user_input.content):
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": user_input.content[:100],
                "reason": "rule_based_pii",
            })
            return MemoryClassifyResult(category="blocked", blocked_reason="個人情報が検出されました")

        # LLM classification
        result = self._llm_classify(user_input.content, blocked_topics)

        # Save input record
        self._db.save_user_input(user_id, {
            "input_type": user_input.input_type,
            "content": user_input.content,
            "classified_category": result.category,
        })

        # Store to appropriate collection
        if result.category == "public":
            self._db.upsert_public_memory(user_id, {
                "safe_summaries": [result.safe_summary] if result.safe_summary else [],
                "safe_topic_tags": result.interests,
                "shareable_interests": result.interests,
                "public_conversation_hooks": result.recent_topics,
            })
            self._db.upsert_private_memory(user_id, {
                "interests": result.interests,
                "values": result.values,
                "recent_topics": result.recent_topics,
                "conversation_style_notes": result.conversation_style_notes,
            })
        elif result.category == "private":
            self._db.upsert_private_memory(user_id, {
                "interests": result.interests,
                "values": result.values,
                "recent_topics": result.recent_topics,
                "conversation_style_notes": result.conversation_style_notes,
            })
        elif result.category == "blocked":
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": user_input.content[:100],
                "reason": result.blocked_reason,
            })
        elif result.category == "review_required":
            self._db.add_review_required(user_id, {
                "candidate_summary": result.safe_summary or user_input.content[:200],
                "reason": result.review_reason,
            })

        return result

    def _llm_classify(self, content: str, blocked_topics: list[str]) -> MemoryClassifyResult:
        prompt = _CLASSIFY_PROMPT.format(
            content=content,
            blocked_topics_json=json.dumps(blocked_topics, ensure_ascii=False),
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.2)
            return MemoryClassifyResult(**_normalize_memory_result(raw))
        except Exception as e:
            logger.error("LLM1 classification failed, falling back to private: %s", e)
            return MemoryClassifyResult(category="private")

    def update_from_feedback(self, user_id: str, card_reactions: list[dict]) -> None:
        public_memory = self._db.get_public_memory(user_id) or {}
        prompt = _UPDATE_PROMPT.format(
            reactions_json=json.dumps(card_reactions, ensure_ascii=False),
            public_memory_json=json.dumps(public_memory, ensure_ascii=False),
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.2)
            reinforced = raw.get("interests_reinforced", [])
            new_candidates = raw.get("new_interest_candidates", [])
            if reinforced or new_candidates:
                self._db.upsert_private_memory(user_id, {
                    "interests": reinforced + new_candidates,
                    "preferred_suggestion_style": raw.get("preferred_suggestion_style", ""),
                })
        except Exception as e:
            logger.error("LLM4 memory update failed: %s", e)


def _normalize_memory_result(raw: dict) -> dict:
    return {
        "category": raw.get("category") or "private",
        "interests": raw.get("interests") or [],
        "values": raw.get("values") or [],
        "recent_topics": raw.get("recent_topics") or [],
        "conversation_style_notes": raw.get("conversation_style_notes") or "",
        "safe_summary": raw.get("safe_summary") or "",
        "blocked_reason": raw.get("blocked_reason") or "",
        "review_reason": raw.get("review_reason") or "",
    }
