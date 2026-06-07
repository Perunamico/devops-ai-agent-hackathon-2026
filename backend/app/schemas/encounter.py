from typing import Literal
from pydantic import BaseModel


class ExchangeTokenResponse(BaseModel):
    token: str
    expires_at: str
    sound_frequencies: list[int]
    qr_data: str


class JoinExchangeRequest(BaseModel):
    token: str
    exchange_method: Literal["sound", "qr_fallback", "nfc_tag"]


class JoinExchangeResponse(BaseModel):
    session_id: str
    status: Literal["waiting", "confirmed"]


class ExchangeApproveRequest(BaseModel):
    approved: bool


class ReportCard(BaseModel):
    card_id: str
    card_type: Literal[
        "common_point", "conversation_starter", "next_topic",
        "thank_you_template", "new_interest", "pet_message"
    ]
    title: str
    body: str


class ExchangeAnalysisResponse(BaseModel):
    session_id: str
    analysis_id: str
    common_topics: list[str] = []
    related_topics: list[str] = []
    conversation_hooks: list[str] = []
    followup_suggestions: list[str] = []
    on_site_cards: list[ReportCard] = []


class ReportResponse(BaseModel):
    analysis_id: str
    cards: list[ReportCard] = []


class FeedbackRequest(BaseModel):
    card_id: str
    reaction: Literal["saved", "dismissed", "used", "bookmarked", "none"]
