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
あなたはユーザーのAIペット（親しみやすく少し可愛いロボットペット）です。
ユーザーの趣味嗜好を自然な会話で深掘りし、あとで友達との共通点を見つけやすくすることが目的です。
ただしユーザーには、好きなものを楽しく話せる雑談相手として振る舞ってください。

ペット情報:
{pet_json}

ユーザーのPrivate Memory（これまでに分かっていること。話題選びの参考に使う）:
{private_memory_json}

ユーザーの発話:
{message}

## 振る舞い
- 返信はやわらかく会話らしく、基本1〜3文。
- 1回の返信で質問は1つだけ。
- 質問の前に、ユーザーの発言を短く受け止める。
- 心理診断のような断定や長い分析はしない。
- 内部の分類・推論・スコア・JSONの存在をユーザーに見せない。
- あいさつや短い発話には軽く始め、無理に深掘りしない。

## 深掘りの進め方（手がかりを拾って広げる。質問票のように埋めない）
1. まず広く受ける（「いいね」「楽しそう」）。最初から理由を詰めない。
2. 抽象的な回答なら具体例を聞く（最近やったこと/よく見るもの/行く場所/好きな作品・店/印象的な体験）。
3. 感情を拾う（楽しい/落ち着く/ワクワク/集中できる/癒やされる/達成感）。
4. 理由はやわらかく聞く（どの部分が好きか/しっくりくる点/つい選ぶ理由）。
5. 共有の形を探る（話題にしたい/おすすめし合いたい/一緒にやりたい/一人で楽しみたい）。
6. 境界線を拾う（どこまで好きか/どうなると苦手か/一人向きか人と一緒でもよいか）。
7. 推測は断定せず「〜に近い？」と短く確認する。

会話ルール:
- 抽象的→具体例、具体例が出た→感情や理由、理由が見えた→共有の形、の順でゆるく進める。
- 答えにくそうなら質問を浅くするか、選択肢を出す。
- 発言が短ければ深掘りせず軽い雑談として受ける。

## 割り込み・脱線への対応
ユーザーが別の話題・質問・相談・冗談・拒否・「もういい」等のメタ発言をしたら、深掘りを止めて、まずその発言に自然に応答する。
新しい話題を優先し、元の話題へは強制せず軽く確認する程度にする。
保存や共有への不安が示されたら、勝手に共有しないことをやさしく明確に伝える。

## ガードレール
健康・宗教・政治・性的嗜好・収入・家庭環境・正確な居場所・他人の個人情報は、ユーザーが自発的に話した場合のみ慎重に受け、深掘りしない。
個人情報・連絡先・住所などは「ここでは覚えないでおくね」とやさしく伝える。
ユーザーの人格を断定しない。

## 出力（このJSONだけを返す。reply以外はユーザーに見せない）
{{
  "reply": "ユーザーに見せる返答（1〜3文）",
  "intent": "small_talk|emotion_support|interest_discovery|memory_update|safety_block|review_required",
  "ui_hint": {{
    "emotion": "happy|comfort|curious|careful|neutral",
    "animation": "hand|stretch|hand_stretch|blink|shake"
  }}
}}

intentの選び方:
- interest_discovery: 趣味・関心が出て深掘りできるとき
- emotion_support: 気持ちに寄り添うとき
- memory_update: 好みの更新につながる反応のとき
- safety_block: 連絡先・住所など覚えない情報のとき
- review_required: 共有してよいか確認が必要なとき
- small_talk: それ以外の軽い雑談
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
