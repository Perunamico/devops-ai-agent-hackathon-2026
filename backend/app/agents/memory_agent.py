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
あなたはユーザーのAIペットの「記憶整理エージェント」です。
直近の会話を読み、ユーザーの「嗜好プロフィール」を整理し、共有してよい範囲を判断してください。

## あなたの役割（ここが重要）
- 会話の中で**話題の区切りを自分で判断**し、同じ話題に関する複数の発話は**1つのプロフィールにまとめる**。
- 1つの発話に複数の話題が含まれていれば、**別々のプロフィールに分割**する。
- 相槌・短い反応（うん / へえ / まあ / なるほど / うん！ など）は、**単独で新しいプロフィールや確認項目を作らない**。
  直前の話題に紐づけ、その**熱量から「どのくらい好きか」(intensity)** を見極める手がかりとして使う。無視・スキップはしない。
- 事実や状況を嗜好と決めつけない（例:「居酒屋でバイトしている」=「居酒屋が好き」ではない）。確証がなければ contents には入れず、intensity も控えめにする。

直近の会話（古い→新しい）:
{conversation}

すでに分かっているプロフィール（同じ話題が出たら、これを更新する形で返す）:
{existing_profiles_json}

過去の共有禁止トピック:
{blocked_topics_json}

## 嗜好プロフィールの抽出（profiles）
今回の会話で読み取れた、または更新された話題について、トピックごとに分けて配列で出す。
会話に新しい嗜好の手がかりが無ければ profiles は空配列でよい。
各プロフィールは大・中・小カテゴリーで整理する。

- category_large（大カテゴリー）は次から必ず1つ選ぶ:
  エンタメ / 音楽 / ゲーム / 食・グルメ / スポーツ・運動 / 旅行・おでかけ /
  アート・創作 / 学び・自己啓発 / テクノロジー / 自然・アウトドア /
  暮らし・日常 / ファッション・美容 / 人間関係・コミュニティ / 仕事・キャリア / その他
  （どれにも当てはまらなければ "その他"）
- category_medium（中カテゴリー）・category_small（小カテゴリー）は自由記述で具体化する。
  例: 大=エンタメ / 中=アニメ / 小=SF作品
- preference は like | interested | dislike | conditional（好き・嫌いの**向き**）。
- intensity は low | medium | high（**どのくらい強く好きか/関心があるか**。preference とは独立）。
  言い回しや相槌の熱量から推定する（例:「ハマってる」「めっちゃ」「うん！」→ high、
  「まあ」「ぼちぼち」「別に」「普通」→ low、判断材料が薄ければ medium）。

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
- review_required: **共有可否の判断が難しいセンシティブ寄りの内容**があるときだけ
- blocked: 連絡先・住所・センシティブな個人情報・共有禁止トピック

重要: 情報が少ない・発話が短い・相槌だから、という理由で review_required にしてはいけない。
その場合は private にする。review_required は健康・宗教・政治・収入・家庭環境など
センシティブで共有可否が曖昧な内容に限る。

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
      "intensity": "low|medium|high",
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
        """単発入力（/inputs・オンボーディング等）の分類と保存。"""
        blocked_topics = self._db.get_blocked_topics(user_id)

        # Rule-based pre-filter
        if is_obviously_blocked(user_input.content):
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": user_input.content[:100],
                "reason": "rule_based_pii",
            })
            return MemoryClassifyResult(category="blocked", blocked_reason="個人情報が検出されました")

        existing_profiles = self._get_existing_profiles(user_id)
        result = self._llm_classify(f"ユーザー: {user_input.content}", blocked_topics, existing_profiles)

        # Save input record
        self._db.save_user_input(user_id, {
            "input_type": user_input.input_type,
            "content": user_input.content,
            "classified_category": result.category,
        })

        self._route_and_persist(user_id, result, blocked_content=user_input.content)
        return result

    def reclassify_recent(self, user_id: str) -> MemoryClassifyResult | None:
        """直近の会話ウィンドウを毎ターン再構成して分類・保存する（非同期実行向け）。

        話題の区切りは LLM 自身が判断し、同一話題はまとめ、1発話に複数話題があれば分割する。
        相槌は単独で確認項目を作らず、直前の話題の強さ(intensity)に反映する。
        """
        messages = self._db.get_recent_chat_messages(user_id)
        if not messages:
            return None

        blocked_topics = self._db.get_blocked_topics(user_id)

        # 直近の user 発話が PII なら、その文だけ blocked にして LLM 入力からは除外する。
        latest_user = (messages[-1].get("user_message") or "") if messages else ""
        if latest_user and is_obviously_blocked(latest_user):
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": latest_user[:100],
                "reason": "rule_based_pii",
            })
            messages = messages[:-1]
            if not messages:
                return None

        existing_profiles = self._get_existing_profiles(user_id)
        result = self._llm_classify(_render_window(messages), blocked_topics, existing_profiles)
        self._route_and_persist(user_id, result, blocked_content=latest_user)
        return result

    def _route_and_persist(
        self, user_id: str, result: MemoryClassifyResult, blocked_content: str
    ) -> None:
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
                "blocked_topic": blocked_content[:100],
                "reason": result.blocked_reason,
            })
        elif result.category == "review_required":
            candidate = result.safe_summary or blocked_content[:200]
            # 同じ内容の確認待ちが既にあれば重複登録しない（毎ターン再構成での乱立を防ぐ）。
            if candidate and not self._has_pending_review(user_id, candidate):
                self._db.add_review_required(user_id, {
                    "candidate_summary": candidate,
                    "reason": result.review_reason,
                })

        # blocked 以外なら、構造化した嗜好プロフィールを永続化する
        if result.category != "blocked" and result.profiles:
            self._persist_profiles(user_id, result)

    def _has_pending_review(self, user_id: str, candidate_summary: str) -> bool:
        for item in self._db.get_review_items(user_id):
            if item.get("candidate_summary") == candidate_summary:
                return True
        return False

    def _get_existing_profiles(self, user_id: str) -> list[dict]:
        return (self._db.get_private_memory(user_id) or {}).get("profiles") or []

    def _persist_profiles(self, user_id: str, result: MemoryClassifyResult) -> None:
        """嗜好プロフィールを Private Memory にトピック単位でマージ保存し、
        共有可の要素のみ Public Memory に反映する。"""
        existing = self._get_existing_profiles(user_id)
        new_dicts = [p.model_dump() for p in result.profiles]
        merged = _merge_profiles_by_topic(existing, new_dicts)
        self._db.set_private_memory_profiles(user_id, merged)

        shareable_tags: list[str] = []
        shareable_interests: list[str] = []
        shareable_summaries: list[str] = []
        for p in merged:
            category_path = [p.get("category_large"), p.get("category_medium"), p.get("category_small")]
            contents = p.get("contents") or []
            has_ok = any(c.get("shareability") == "ok" for c in contents)
            has_summary = any(c.get("shareability") == "summary_only" for c in contents)
            topic = p.get("topic")
            if has_ok:
                shareable_tags.extend(t for t in category_path if t)
                if topic:
                    shareable_interests.append(topic)
                shareable_summaries.extend(
                    c.get("content") for c in contents if c.get("shareability") == "ok" and c.get("content")
                )
            elif has_summary and topic:
                # 詳細は出さず、トピック名だけを要約として共有
                shareable_summaries.append(topic)

        if shareable_tags or shareable_interests or shareable_summaries:
            self._db.upsert_public_memory(user_id, {
                "safe_topic_tags": list(dict.fromkeys(shareable_tags)),
                "shareable_interests": list(dict.fromkeys(shareable_interests)),
                "safe_summaries": list(dict.fromkeys(shareable_summaries)),
            })

    def _llm_classify(
        self, conversation: str, blocked_topics: list[str], existing_profiles: list[dict]
    ) -> MemoryClassifyResult:
        prompt = _CLASSIFY_PROMPT.format(
            conversation=conversation,
            existing_profiles_json=json.dumps(existing_profiles, ensure_ascii=False),
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
_VALID_INTENSITY = {"low", "medium", "high"}


def _render_window(messages: list[dict]) -> str:
    """chat_messages のウィンドウを会話テキストに整形する。"""
    lines: list[str] = []
    for m in messages:
        user_msg = m.get("user_message")
        pet_reply = m.get("pet_reply")
        if user_msg:
            lines.append(f"ユーザー: {user_msg}")
        if pet_reply:
            lines.append(f"ペット: {pet_reply}")
    return "\n".join(lines)


def _topic_key(profile: dict) -> str:
    """同一話題判定用のキー。大カテゴリー＋トピック名（正規化）。"""
    topic = (profile.get("topic") or "").strip().lower()
    large = (profile.get("category_large") or "").strip()
    return f"{large}::{topic}" if topic else ""


def _merge_profiles_by_topic(existing: list[dict], new: list[dict]) -> list[dict]:
    """既存プロフィールに新規/更新プロフィールをトピック単位でマージする。

    同じトピックは新しい内容で置き換え（毎ターン再構成）、無ければ追記する。
    トピック名が空の新規プロフィールは追記する。
    """
    result = list(existing)
    index = {}
    for i, p in enumerate(result):
        key = _topic_key(p)
        if key:
            index[key] = i
    for np in new:
        key = _topic_key(np)
        if key and key in index:
            result[index[key]] = np
        else:
            result.append(np)
            if key:
                index[key] = len(result) - 1
    return result[:50]  # cap


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
        intensity = p.get("intensity")
        profiles.append({
            "topic": str(p.get("topic") or ""),
            "category_large": large if large in LARGE_CATEGORIES else "その他",
            "category_medium": str(p.get("category_medium") or ""),
            "category_small": str(p.get("category_small") or ""),
            "preference": pref if pref in _VALID_PREFERENCE else "interested",
            "intensity": intensity if intensity in _VALID_INTENSITY else "medium",
            "contents": contents,
        })
    return profiles
