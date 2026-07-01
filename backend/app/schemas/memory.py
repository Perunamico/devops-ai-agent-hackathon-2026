from typing import Literal, get_args
from pydantic import BaseModel

# 大カテゴリーは固定リスト（EncounterAgent の共通点照合のブレを抑える）。
# 中・小カテゴリーは自由記述。プロンプト側の一覧とこの定義を一致させること。
CategoryLarge = Literal[
    "アニメ",
    "マンガ",
    "映画",
    "ドラマ",
    "お笑い・バラエティ",
    "アイドル",
    "声優",
    "動画配信・YouTube",
    "読書・小説",
    "推し活",
    "音楽鑑賞",
    "邦楽",
    "洋楽",
    "ボーカロイド",
    "クラシック音楽",
    "ジャズ",
    "楽器演奏",
    "作曲・DTM",
    "カラオケ",
    "ライブ・フェス",
    "コンソールゲーム",
    "PCゲーム",
    "スマホゲーム",
    "レトロゲーム",
    "eスポーツ",
    "ボードゲーム",
    "TRPG",
    "パズル・脳トレ",
    "グルメ・食べ歩き",
    "料理",
    "お菓子・スイーツ作り",
    "カフェ巡り",
    "コーヒー",
    "お茶・紅茶",
    "お酒・バー",
    "ラーメン",
    "パン・ベーカリー",
    "サッカー",
    "野球",
    "バスケットボール",
    "テニス",
    "ランニング・マラソン",
    "筋トレ・ジム",
    "ヨガ・ピラティス",
    "登山・ハイキング",
    "水泳",
    "ダンス",
    "格闘技・武道",
    "スポーツ観戦",
    "国内旅行",
    "海外旅行",
    "ドライブ",
    "キャンプ",
    "温泉",
    "テーマパーク",
    "鉄道・電車",
    "街歩き・散歩",
    "イラスト・絵を描く",
    "写真・カメラ",
    "動画編集",
    "ハンドメイド・手芸",
    "DIY・ものづくり",
    "陶芸・クラフト",
    "書道・カリグラフィー",
    "デザイン",
    "語学・英語",
    "資格・勉強",
    "自己啓発",
    "歴史",
    "科学",
    "哲学・思想",
    "心理学",
    "投資・資産運用",
    "プログラミング",
    "ガジェット",
    "AI・機械学習",
    "PC自作",
    "Web・アプリ開発",
    "電子工作・ロボット",
    "暗号資産・ブロックチェーン",
    "アウトドア",
    "釣り",
    "ガーデニング・園芸",
    "天体観測",
    "動物・ペット",
    "生き物・昆虫",
    "インテリア",
    "掃除・整理整頓",
    "節約・ミニマリスト",
    "健康・ウェルネス",
    "占い・スピリチュアル",
    "ファッション",
    "美容・スキンケア",
    "メイク・コスメ",
    "ネイル",
    "恋愛・結婚",
    "家族・子育て",
    "仕事・キャリア",
    "ボランティア・社会貢献",
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
    # review_required の要約は profiles を通らないため、カードのカテゴリーを別途持たせる。
    review_category_large: str = ""
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


class MemoryListItem(BaseModel):
    id: str
    summary: str
    detail: str = ""
    source: Literal["review_required", "public", "private", "blocked"]
    created_at: str = ""
    can_approve: bool = False
    # カード上部に出すカテゴリーチップ（嗜好プロフィールの大カテゴリー等）。
    category: str = ""


class MemoryListResponse(BaseModel):
    review: list[MemoryListItem] = []
    allowed: list[MemoryListItem] = []
    secret: list[MemoryListItem] = []


class MemoryApproveRequest(BaseModel):
    action: Literal["approve", "reject"]
