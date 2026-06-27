import json
import logging

from app.config import Settings
from app.schemas.memory import LARGE_CATEGORIES, MemoryClassifyResult
from app.schemas.pet import UserInputCreate
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService
from app.utils.rule_filter import is_obviously_blocked

logger = logging.getLogger(__name__)

_CLASSIFY_PROMPT = """\
あなたはユーザーのAIペットの記憶整理担当です。
ユーザーの入力を、友達との共通点探しに使える「嗜好プロフィール」として整理し、
さらに共有してよい範囲を判断して分類してください。

ユーザーの入力:
{content}

過去の共有禁止トピック:
{blocked_topics_json}

## 嗜好プロフィールの抽出（profiles）
入力に複数の好き/嫌いの手がかりがあれば、トピックごとに分けて配列で出す。
各プロフィールは大・中・小カテゴリーで整理する。

- category_large（大カテゴリー）は次から必ず1つ選ぶ:
  エンタメ / 音楽 / ゲーム / 食・グルメ / スポーツ・運動 / 旅行・おでかけ /
  アート・創作 / 学び・自己啓発 / テクノロジー / 自然・アウトドア /
  暮らし・日常 / ファッション・美容 / 人間関係・コミュニティ / 仕事・キャリア / その他
  （どれにも当てはまらなければ "その他"）
- category_medium（中カテゴリー）・category_small（小カテゴリー）は自由記述で具体化する。
  例: 大=エンタメ / 中=アニメ / 小=SF作品
- preference は like | interested | dislike | conditional から選ぶ。

各プロフィールの contents には、嗜好の手がかりを要素ごとに分けて入れる。
要素ごとに label と shareability（共有してよい範囲）を必ず付ける。

label:
- example: 具体的な作品・場所・行動・体験
- reason: 好き・苦手の理由
- emotion: 紐づく感情
- context: その嗜好が出やすい場面
- social_mode: 友達とどう共有したいか
- boundary: 好きな条件・苦手になる条件
- related_topic: 関連して話題にしやすいもの

shareability:
- ok: 友達との共通点探しに使ってよい
- summary_only: 要約だけ使ってよい
- private: 共通点探しには使わない
- unknown: まだ確認していない（迷ったらこれ）

confidence は low | medium | high。推測が強いほど low にする。

## 全体の分類（category：保存先と共有可否のルーティング）
- public: 趣味・関心など友達と共有してよい話題が中心
- private: ユーザー理解には使うが共有しない情報が中心
- review_required: 共有可否の判断が難しく、ユーザー確認が必要
- blocked: 連絡先・住所・センシティブな個人情報・共有禁止トピック

## ガードレール
健康・宗教・政治・性的嗜好・収入・家庭環境・正確な居場所・他人の個人情報は、
原則 private か review_required にし、共通点探しには使わない（contents の shareability も private にする）。
共有可否が未確認のものは shareability=unknown とする。
ユーザーの人格を断定しない。

出力JSON:
{{
  "category": "private|public|blocked|review_required",
  "interests": ["抽出した興味・関心"],
  "values": ["抽出した価値観"],
  "recent_topics": ["きっかけになりやすい最近の話題"],
  "conversation_style_notes": "会話スタイルの観察（任意・短く）",
  "safe_summary": "友達のペットに伝えてよい要約（publicの場合のみ・個人情報を含めない）",
  "blocked_reason": "blockedの場合のみ理由",
  "review_reason": "review_requiredの場合のみ理由",
  "profiles": [
    {{
      "topic": "好きな対象の名前",
      "category_large": "上のリストから1つ",
      "category_medium": "中カテゴリー（自由記述）",
      "category_small": "小カテゴリー（自由記述）",
      "preference": "like|interested|dislike|conditional",
      "contents": [
        {{
          "label": "reason|emotion|context|social_mode|boundary|example|related_topic",
          "content": "具体的な内容",
          "shareability": "ok|summary_only|private|unknown",
          "confidence": "low|medium|high"
        }}
      ]
    }}
  ]
}}

注意: safe_summary と shareability=ok の内容は、具体的な個人情報を含まない抽象表現にする。
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

        # blocked 以外なら、構造化した嗜好プロフィールを永続化する
        if result.category != "blocked" and result.profiles:
            self._persist_profiles(user_id, result)

        return result

    def _persist_profiles(self, user_id: str, result: MemoryClassifyResult) -> None:
        """嗜好プロフィールを Private Memory に保存し、共有可の要素のみ Public Memory に反映する。"""
        self._db.upsert_private_memory(user_id, {
            "profiles": [p.model_dump() for p in result.profiles],
        })

        shareable_tags: list[str] = []
        shareable_interests: list[str] = []
        shareable_summaries: list[str] = []
        for p in result.profiles:
            category_path = [p.category_large, p.category_medium, p.category_small]
            has_ok = any(c.shareability == "ok" for c in p.contents)
            has_summary = any(c.shareability == "summary_only" for c in p.contents)
            if has_ok:
                shareable_tags.extend(t for t in category_path if t)
                if p.topic:
                    shareable_interests.append(p.topic)
                shareable_summaries.extend(c.content for c in p.contents if c.shareability == "ok")
            elif has_summary and p.topic:
                # 詳細は出さず、トピック名だけを要約として共有
                shareable_summaries.append(p.topic)

        if shareable_tags or shareable_interests or shareable_summaries:
            self._db.upsert_public_memory(user_id, {
                "safe_topic_tags": list(dict.fromkeys(shareable_tags)),
                "shareable_interests": list(dict.fromkeys(shareable_interests)),
                "safe_summaries": list(dict.fromkeys(shareable_summaries)),
            })

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


_VALID_LABELS = {"reason", "emotion", "context", "social_mode", "boundary", "example", "related_topic"}
_VALID_SHAREABILITY = {"ok", "summary_only", "private", "unknown"}
_VALID_CONFIDENCE = {"low", "medium", "high"}
_VALID_PREFERENCE = {"like", "interested", "dislike", "conditional"}


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
        "profiles": _normalize_profiles(raw.get("profiles")),
    }


def _normalize_profiles(raw_profiles) -> list[dict]:
    """LLM出力の profiles をサニタイズ。不正な値は安全側に丸め、欠損要素はスキップする。"""
    if not isinstance(raw_profiles, list):
        return []
    profiles = []
    for p in raw_profiles:
        if not isinstance(p, dict):
            continue
        large = p.get("category_large")
        contents = []
        for c in p.get("contents") or []:
            if not isinstance(c, dict):
                continue
            label = c.get("label")
            content = c.get("content")
            if label not in _VALID_LABELS or not content:
                continue
            share = c.get("shareability")
            conf = c.get("confidence")
            contents.append({
                "label": label,
                "content": str(content),
                "shareability": share if share in _VALID_SHAREABILITY else "unknown",
                "confidence": conf if conf in _VALID_CONFIDENCE else "low",
            })
        pref = p.get("preference")
        profiles.append({
            "topic": str(p.get("topic") or ""),
            "category_large": large if large in LARGE_CATEGORIES else "その他",
            "category_medium": str(p.get("category_medium") or ""),
            "category_small": str(p.get("category_small") or ""),
            "preference": pref if pref in _VALID_PREFERENCE else "interested",
            "contents": contents,
        })
    return profiles
