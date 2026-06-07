from typing import Literal
from pydantic import BaseModel


class MemoryClassifyResult(BaseModel):
    category: Literal["private", "public", "blocked", "review_required"]
    interests: list[str] = []
    values: list[str] = []
    recent_topics: list[str] = []
    conversation_style_notes: str = ""
    safe_summary: str = ""
    blocked_reason: str = ""
    review_reason: str = ""


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
