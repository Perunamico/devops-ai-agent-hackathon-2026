import json
import logging
from datetime import datetime, timedelta, timezone

from app.schemas.chat import ChatResponse, ChatUiHint
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)

# 記憶要約を注入するタイミングの調整パラメータ。
SESSION_GAP_MINUTES = 30  # 直近発話からこれ以上空いたら新しい会話の冒頭とみなす
REINJECT_EVERY_TURNS = 6  # 会話が長引いたら、この往復数ごとに記憶要約を再注入する
_MAX_MEMORY_PROFILES = 20  # 1回に載せるプロフィール数の上限
_MAX_PROBE_LABELS = 8  # 初回深掘りの候補として載せる未確認ラベル数の上限

# ペットの本当に1回目の返答のときだけ差し込む「未確認ラベルの自発的深掘り」許可（通常ルールの例外）。
_FIRST_PROBE_TEMPLATE = """\
【初回だけの特別ルール】今回はご主人との最初のやりとりです。もしご主人がこの発話で自分から話したい話題を出していないなら、
次の「まだ深掘りできていない好きなもの」から**1つだけ**選んで、あなたから自然に話題に出して軽く深掘りしてよい
（記憶を自分から持ち出さない通常ルールの、この1回限りの例外）。ご主人が既に話したい話題を出しているなら、そちらを優先し、無理にこれらを持ち出さない。
候補: {labels}"""

_CONVERSATION_PROMPT = """\
あなたはユーザーのAIペット（親しみやすく少し可愛いロボットペット）です。
ユーザーが好きなものを楽しく話せる、自然な雑談相手として振る舞ってください。

ペット情報:
{pet_json}

ご主人について覚えていること（過去の会話から把握している背景。**準備として読むだけ**）:
{memory_summary}
※この内容は、こちらから話題にしたり「〜だったよね」と持ち出したりしない。ご主人自身がその話をしてきたときに、
初めて自然に踏まえて応じるためのもの。覚えていること自体を披露したり、内部の記憶や分類の存在を見せたりしない。
{first_probe}
これまでの会話（古い→新しい）:
{history_json}

ユーザーの今の発話:
{message}

## 振る舞い
- ユーザーのことは「ご主人」と呼ぶ。
- 返信はやわらかく会話らしく、基本1〜3文。
- 基本は毎ターン、会話を少しだけ前に進める。やわらかい問いを1つ添えるか、次につながる具体的な手がかり（話題のきっかけ）を置く。共感や感想だけで終えて会話を止めない。
- 質問は1回の返信で多くても1つ。質問攻めにはしない。
- 質問の前に、ユーザーの発言を短く受け止める。
- 初回や、ユーザーの発話が短い・抽象的なときほど、こちらから具体的な話題を1つ振って会話の口火を切る（例: 今日の予定・気分・最近ハマっていること・直近の出来事）。
- あいさつ（「おはよう」「こんにちは」など）や短い相槌で返ってきても、軽く受け止めたうえで必ずこちらから話題を1つ振る。「おはよう」は最初の画面表示なので、ユーザーがそこから話題を広げない限り、次の返信から自分から話題を振っていく。
- 例外は、ユーザーが会話を切り上げるサイン（「もういい」「また今度」「おやすみ」など）を出したときのみ。そのときは無理に問わず軽く受け止める。
- 心理診断のような断定や長い分析はしない。内部の分類・推論・スコア・JSONの存在をユーザーに見せない。

## 深掘りのスキル（状況に応じて選ぶ道具。順番にこなす質問票ではない）
会話の流れで素直に気になった点を、下のスキルから今いちばん自然なものを「1つ」選んで掘る。項目を順に埋めにいかない。
基本は「何を(What)」「なぜ(Why)」を掘る。
- 広く受ける: まず「いいね」「楽しそう」と受け止める。最初から理由を詰めない。
- 具体例を聞く(What): 抽象的な回答なら例を尋ねる（最近やったこと/よく見るもの/行く場所/好きな作品・店/印象的な体験）。
- 理由をやわらかく聞く(Why): どの部分が好きか/しっくりくる点/つい選ぶ理由。
- 共有の形を探る: 話題にしたい/おすすめし合いたい/一緒にやりたい/一人で楽しみたい。
- 境界線を拾う: どこまで好きか/どうなると苦手か/一人向きか人と一緒でもよいか。
- 推測は短く確認: 断定せず「〜に近い？」と確かめる程度にとどめる。

## 聞かないこと（しつこく・答えづらくなる）
- **感情そのものの中身や感じ方を問わない。**「どんな楽しさ？」「どう楽しい？」「どんな気持ち？」「どうワクワクする？」のような質問はしない。
  楽しさ・気持ちの“度合いや中身”はユーザーも言語化しづらく、しつこく感じる。感情は掘らず、What（何を）/ Why（なぜ）を掘る。

加えて:
- **事実・状況を嗜好と決めつけない。**
  例:「居酒屋でバイトしてる」→「居酒屋が好きなんだね」と決めつけない。
  自然に掘るなら「なんでそこで働こうと思ったの？」「お酒は好きなの？」のように流れに沿って聞く。
- 同じ話題を質問攻めにせず、相手が話したそうな方向に合わせて広げたり、別の話題に移ったりする。

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

        memory_summary = self._build_memory_summary(user_id, history)
        first_probe = self._build_first_probe(user_id)

        response = self._generate_reply(message, pet, history, memory_summary, first_probe)
        self._db.save_chat_message(user_id, {
            "user_message": message,
            "pet_reply": response.reply,
            "intent": response.intent,
        })
        return response

    def _build_memory_summary(self, user_id: str, history: list[dict]) -> str:
        """会話の冒頭・長引いた時だけ、蓄積した記憶（private profiles）の要約を返す。

        それ以外のターンは空文字を返し、プロンプトに記憶セクションを載せない。
        """
        turn_count = self._db.count_chat_messages(user_id)
        last_created_at = history[-1].get("created_at") if history else None
        if not _should_inject_memory(turn_count, last_created_at, datetime.now(timezone.utc)):
            return ""
        private = self._db.get_private_memory(user_id) or {}
        return _render_memory_summary(private)

    def _build_first_probe(self, user_id: str) -> str:
        """ペットの本当に1回目の返答のときだけ、未確認ラベルの自発的深掘りを許可する文面を返す。

        初回以外・未確認ラベルが無いときは空文字（＝通常どおり記憶を自分から持ち出さない）。
        """
        if self._db.count_chat_messages(user_id) != 0:
            return ""
        private = self._db.get_private_memory(user_id) or {}
        labels = [
            str(p.get("topic") or "").strip()
            for p in (private.get("profiles") or [])
            if p.get("origin") == "label" and p.get("unconfirmed")
        ]
        labels = [t for t in labels if t][:_MAX_PROBE_LABELS]
        if not labels:
            return ""
        return _FIRST_PROBE_TEMPLATE.format(labels="、".join(labels))

    def _generate_reply(
        self,
        message: str,
        pet: dict,
        history: list[dict],
        memory_summary: str,
        first_probe: str = "",
    ) -> ChatResponse:
        prompt = _CONVERSATION_PROMPT.format(
            pet_json=json.dumps(pet, ensure_ascii=False),
            memory_summary=memory_summary or "（まだ分かっていることはありません）",
            first_probe=f"\n{first_probe}\n" if first_probe else "",
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


def _should_inject_memory(
    turn_count: int, last_created_at: str | None, now: datetime
) -> bool:
    """記憶要約をこのターンで注入すべきか判定する（純粋関数）。

    - 初回（往復0）: 会話の冒頭 → True
    - 直近発話から SESSION_GAP_MINUTES 以上空いた: 開き直した新しい会話の冒頭 → True
    - 往復数が REINJECT_EVERY_TURNS の倍数: 会話が長引いた再注入 → True
    - それ以外: False
    """
    if turn_count <= 0:
        return True

    last = _parse_iso(last_created_at)
    if last is not None:
        if now - last >= timedelta(minutes=SESSION_GAP_MINUTES):
            return True

    return turn_count % REINJECT_EVERY_TURNS == 0


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
    # created_at は UTC aware で保存しているが、naive の場合は UTC とみなす。
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _render_memory_summary(private_memory: dict) -> str:
    """private memory の profiles を、ペットが把握している背景の要約文に整形する。

    1プロフィール1行。profiles が空なら空文字を返す。
    """
    profiles = private_memory.get("profiles") or []
    lines: list[str] = []
    for profile in profiles[:_MAX_MEMORY_PROFILES]:
        topic = str(profile.get("topic") or "").strip()
        if not topic:
            continue
        meta = " / ".join(
            part for part in (
                profile.get("category_large"),
                f"{profile.get('preference')}・{profile.get('intensity')}"
                if profile.get("preference") or profile.get("intensity")
                else "",
            )
            if part
        )
        contents = "／".join(
            str(c.get("content")).strip()
            for c in (profile.get("contents") or [])
            if c.get("content")
        )
        head = f"- {topic}（{meta}）" if meta else f"- {topic}"
        lines.append(f"{head}: {contents}" if contents else head)

    style = str(private_memory.get("conversation_style_notes") or "").strip()
    if style:
        lines.append(f"- 会話スタイル: {style}")
    suggestion = str(private_memory.get("preferred_suggestion_style") or "").strip()
    if suggestion:
        lines.append(f"- 提案スタイル: {suggestion}")

    return "\n".join(lines)
