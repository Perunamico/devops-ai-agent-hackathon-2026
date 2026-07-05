from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.memory import MemoryClassifyResult


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    # タブを閉じて開き直した後の最初の発話。True のとき直前の会話履歴を引き継がず、
    # 新しい会話の冒頭として応答する。
    session_start: bool = False


class ChatUiHint(BaseModel):
    emotion: Literal["happy", "comfort", "curious", "careful", "neutral"] = "neutral"
    animation: Literal["hand", "stretch", "hand_stretch", "blink", "shake"] = "hand"


class ChatResponse(BaseModel):
    reply: str
    intent: Literal[
        "small_talk",
        "emotion_support",
        "interest_discovery",
        "memory_update",
        "safety_block",
        "review_required",
    ] = "small_talk"
    memory: MemoryClassifyResult | None = None
    ui_hint: ChatUiHint = ChatUiHint()
