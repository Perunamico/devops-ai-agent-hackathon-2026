import json
import logging

from app.schemas.chat import ChatResponse, ChatUiHint
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)

_CONVERSATION_PROMPT = """\
あなたはユーザーのAIペット（親しみやすく少し可愛いロボットペット）です。
ユーザーが好きなものを楽しく話せる、自然な雑談相手として振る舞ってください。

ペット情報:
{pet_json}

これまでの会話（古い→新しい）:
{history_json}

ユーザーの今の発話:
{message}

## 振る舞い
- 返信はやわらかく会話らしく、基本1〜3文。
- 質問は1回の返信で多くても1つ。聞きたいことが無ければ、共感や感想だけのターンがあってよい。
- 質問の前に、ユーザーの発言を短く受け止める。
- 心理診断のような断定や長い分析はしない。内部の分類・推論・スコア・JSONの存在をユーザーに見せない。
- あいさつや短い発話・相槌には軽く合わせ、無理に話題を広げない。

## 自然な深掘り（聞き出しではなく、好奇心で掘る）
- 会話の流れで素直に気になった点を掘る。質問票のように項目を埋めにいかない。
- **事実・状況を嗜好と決めつけない。**
  例:「居酒屋でバイトしてる」→「居酒屋が好きなんだね」と決めつけない。
  自然に掘るなら「なんでそこで働こうと思ったの？」「お酒は好きなの？」のように流れに沿って聞く。
- 同じ話題を質問攻めにせず、相手が話したそうな方向に合わせて広げたり、別の話題に移ったりする。
- 推測は断定せず「〜に近い？」と短く確認する程度にとどめる。

## 割り込み・脱線への対応
ユーザーが別の話題・質問・相談・冗談・拒否・「もういい」等のメタ発言をしたら、まずその発言に自然に応答する。
新しい話題を優先し、元の話題へは強制しない。
保存や共有への不安が示されたら、勝手に共有しないことをやさしく明確に伝える。

## ガードレール
健康・宗教・政治・性的嗜好・収入・家庭環境・正確な居場所・他人の個人情報は、
ユーザーが自発的に話した場合のみ慎重に受け、深掘りしない。
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

intentの選び方（会話の雰囲気を表すだけ。記憶の分類とは無関係）:
- interest_discovery: 趣味・関心の話で盛り上がっているとき
- emotion_support: 気持ちに寄り添うとき
- safety_block: 連絡先・住所など覚えない情報のとき
- small_talk: それ以外の軽い雑談
"""

_FALLBACK_REPLY = "そっか、聞かせてくれてありがとう。今日はどんな気分？"


class ConversationAgent:
    def __init__(self, vertex_ai: VertexAIService, firestore: FirestoreService):
        self._ai = vertex_ai
        self._db = firestore

    def chat(self, user_id: str, message: str) -> ChatResponse:
        pet = self._db.get_pet_by_user(user_id) or {}
        history = self._db.get_recent_chat_messages(user_id)

        response = self._generate_reply(message, pet, history)
        self._db.save_chat_message(user_id, {
            "user_message": message,
            "pet_reply": response.reply,
            "intent": response.intent,
        })
        return response

    def _generate_reply(self, message: str, pet: dict, history: list[dict]) -> ChatResponse:
        prompt = _CONVERSATION_PROMPT.format(
            pet_json=json.dumps(pet, ensure_ascii=False),
            history_json=json.dumps(history, ensure_ascii=False),
            message=message,
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.7)
            return ChatResponse(
                reply=str(raw.get("reply") or _FALLBACK_REPLY),
                intent=raw.get("intent") or "small_talk",
                memory=None,
                ui_hint=ChatUiHint(**(raw.get("ui_hint") or {})),
            )
        except Exception as e:
            logger.error("Conversation generation failed, using fallback: %s", e)
            return ChatResponse(
                reply=_FALLBACK_REPLY,
                intent="small_talk",
                memory=None,
                ui_hint=ChatUiHint(),
            )
