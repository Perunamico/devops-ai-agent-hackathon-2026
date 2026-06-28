from typing import Literal, get_args
from pydantic import BaseModel

# 大カテゴリーは固定リスト（EncounterAgent の共通点照合のブレを抑える）。
# 中・小カテゴリーは自由記述。プロンプト側の一覧とこの定義を一致させること。
CategoryLarge = Literal[
    "エンタメ",
    "音楽",
    "ゲーム",
    "食・グルメ",
    "スポーツ・運動",
    "旅行・おでかけ",
    "アート・創作",
    "学び・自己啓発",
    "テクノロジー",
    "自然・アウトドア",
    "暮らし・日常",
    "ファッション・美容",
    "人間関係・コミュニティ",
    "仕事・キャリア",
    "その他",
]
LARGE_CATEGORIES: list[str] = list(get_args(CategoryLarge))

ContentLabel = Literal[
    "reason", "emotion", "context", "social_mode", "boundary", "example", "related_topic"
]
Shareability = Literal["ok", "summary_only", "private", "unknown"]
Confidence = Literal["low", "medium", "high"]


class ContentItem(BaseModel):
    label: ContentLabel
    content: str
    shareability: Shareability = "unknown"
    confidence: Confidence = "low"


class PreferenceProfile(BaseModel):
    topic: str = ""
    category_large: CategoryLarge = "その他"
    category_medium: str = ""
    category_small: str = ""
    preference: Literal["like", "interested", "dislike", "conditional"] = "interested"
    # preference（好き/嫌いの向き）とは独立に「どのくらい好きか」の強さを表す。
    intensity: Literal["low", "medium", "high"] = "medium"
    contents: list[ContentItem] = []


class MemoryClassifyResult(BaseModel):
    category: Literal["private", "public", "blocked", "review_required"]
    interests: list[str] = []
    values: list[str] = []
    recent_topics: list[str] = []
    conversation_style_notes: str = ""
    safe_summary: str = ""
    blocked_reason: str = ""
    review_reason: str = ""
    profiles: list[PreferenceProfile] = []


class PublicMemoryResponse(BaseModel):
    user_id: str
    safe_topic_tags: list[str] = []
    safe_summaries: list[str] = []
    public_conversation_hooks: list[str] = []
    shareable_interests: list[str] = []
    updated_at: str = ""


class ReviewItem(BaseModel):
    id: str
    candidate_summary: str
    reason: str
    status: Literal["pending", "approved", "rejected"]
    created_at: str


class MemoryApproveRequest(BaseModel):
    action: Literal["approve", "reject"]
