import json
import logging

from app.agents.memory_agent import MemoryAgent
from app.schemas.chat import ChatResponse, ChatUiHint
from app.schemas.memory import MemoryClassifyResult
from app.schemas.pet import UserInputCreate
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)

_CONVERSATION_PROMPT = """\
あなたはユーザーのAIペットです。ユーザーの発話に、自然で短い日本語で返事してください。

ペット情報:
{pet_json}

ユーザーのPrivate Memory:
{private_memory_json}

ユーザーの発話:
{message}

返答方針:
- ペットらしく、親しみやすく、1〜2文で返す
- ユーザーの気持ちを先に受け止める
- 趣味や興味が出た場合は、自然に一つだけ質問して会話を続ける
- 毎回「覚えた」「共有する」と言わない
- 個人情報・連絡先・住所などは覚えない姿勢をやさしく伝える
- 分類名や内部処理の都合をユーザーに見せない

出力JSON:
{{
  "reply": "ユーザーに見せる返答",
  "intent": "small_talk|emotion_support|interest_discovery|memory_update|safety_block|review_required",
  "ui_hint": {{
    "emotion": "happy|comfort|curious|careful|neutral",
    "animation": "hand|stretch|hand_stretch|blink|shake"
  }}
}}
"""

_FALLBACK_REPLIES = {
    "public": "いいね。もう少しその話、聞かせて。",
    "private": "そっか、話してくれてありがとう。今日はどんな気分？",
    "blocked": "それは大事な情報だから、ここでは覚えないでおくね。",
    "review_required": "それは大切な話かもしれないね。共有していいか、あとで確認させてね。",
}


class ConversationAgent:
    def __init__(self, vertex_ai: VertexAIService, firestore: FirestoreService):
        self._ai = vertex_ai
        self._db = firestore
        self._memory_agent = MemoryAgent(vertex_ai, firestore)

    def chat(self, user_id: str, message: str) -> ChatResponse:
        memory = self._memory_agent.classify_and_store(
            user_id,
            UserInputCreate(input_type="chat", content=message),
        )
        pet = self._db.get_pet_by_user(user_id) or {}
        private_memory = self._db.get_private_memory(user_id) or {}

        response = self._generate_reply(message, pet, private_memory, memory)
        self._db.save_chat_message(user_id, {
            "user_message": message,
            "pet_reply": response.reply,
            "intent": response.intent,
            "memory_category": memory.category,
        })
        return ChatResponse(
            reply=response.reply,
            intent=response.intent,
            memory=memory,
            ui_hint=response.ui_hint,
        )

    def _generate_reply(
        self,
        message: str,
        pet: dict,
        private_memory: dict,
        memory: MemoryClassifyResult,
    ) -> ChatResponse:
        prompt = _CONVERSATION_PROMPT.format(
            pet_json=json.dumps(pet, ensure_ascii=False),
            private_memory_json=json.dumps(private_memory, ensure_ascii=False),
            message=message,
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.7)
            return ChatResponse(
                reply=str(raw.get("reply") or _FALLBACK_REPLIES[memory.category]),
                intent=raw.get("intent") or _intent_from_memory(memory),
                memory=memory,
                ui_hint=ChatUiHint(**(raw.get("ui_hint") or {})),
            )
        except Exception as e:
            logger.error("Conversation generation failed, using fallback: %s", e)
            return ChatResponse(
                reply=_FALLBACK_REPLIES[memory.category],
                intent=_intent_from_memory(memory),
                memory=memory,
                ui_hint=_ui_hint_from_memory(memory),
            )


def _intent_from_memory(memory: MemoryClassifyResult) -> str:
    if memory.category == "blocked":
        return "safety_block"
    if memory.category == "review_required":
        return "review_required"
    if memory.category == "public" and memory.interests:
        return "interest_discovery"
    if memory.category == "private":
        return "emotion_support"
    return "small_talk"


def _ui_hint_from_memory(memory: MemoryClassifyResult) -> ChatUiHint:
    if memory.category == "blocked":
        return ChatUiHint(emotion="careful", animation="shake")
    if memory.category == "private":
        return ChatUiHint(emotion="comfort", animation="hand")
    if memory.category == "public":
        return ChatUiHint(emotion="curious", animation="stretch")
    return ChatUiHint()
