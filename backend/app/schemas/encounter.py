from typing import Literal
from pydantic import BaseModel


class ExchangeTokenResponse(BaseModel):
    payload_raw: list[int]
    token_key: str
    expires_at: str
    qr_url: str


class ResolveExchangeRequest(BaseModel):
    payload_raw: list[int]


class ResolveStatus(str):
    pass


class ResolveExchangeResponse(BaseModel):
    status: Literal["matched", "waiting", "expired", "used", "not_found", "self"]
    session_id: str | None = None
    pending_id: str | None = None


class MatchStatusResponse(BaseModel):
    status: Literal["waiting", "matched"]
    session_id: str | None = None


class SessionResponse(BaseModel):
    session_id: str
    status: Literal["active", "ended"]
    speaker_id: str
    common_message: str | None = None
    analysis_id: str | None = None
    ended_by: str | None = None
    # 双方が成功画面へ到達したときだけ True。フロントはこれが True になるまで遷移しない。
    both_ready: bool = False


class ReportCard(BaseModel):
    card_id: str
    card_type: Literal[
        "common_point", "conversation_starter", "next_topic",
        "thank_you_template", "new_interest", "pet_message"
    ]
    title: str
    body: str


class PersonalPoint(BaseModel):
    topic: str
    point: str


class ExchangeAnalysisResponse(BaseModel):
    session_id: str
    analysis_id: str
    common_topics: list[str] = []
    related_topics: list[str] = []
    conversation_hooks: list[str] = []
    followup_suggestions: list[str] = []
    on_site_cards: list[ReportCard] = []
    # 呼び出し本人だけに見せる「自分の好きなポイント」。相手のぶんは返さない。
    personal_points: list[PersonalPoint] = []


class ReportResponse(BaseModel):
    analysis_id: str
    cards: list[ReportCard] = []


class FeedbackRequest(BaseModel):
    card_id: str
    reaction: Literal["saved", "dismissed", "used", "bookmarked", "none"]


class FriendItem(BaseModel):
    """交流（鳴き声/QR通信）が成立した相手1人ぶんの表示データ。"""
    user_id: str
    pet_name: str
    # 直近の交流分析から出た共通の話題（表示用ベスト3）
    common_topics: list[str] = []
    # 直近の交流で本人向けに生成されたメッセージ（無ければ共通メッセージ）
    comment: str = ""
    # 直近セッションのID（/exchanges/{session_id}/analysis を叩くために必要）
    session_id: str = ""


class FriendsResponse(BaseModel):
    friends: list[FriendItem] = []
    friend_count: int = 0
    # 各ともだちとの直近分析の共通トピック数の合計
    common_topic_count: int = 0
    # 交流（鳴き声/QR通信）が成立したセッションの総数
    interaction_count: int = 0
