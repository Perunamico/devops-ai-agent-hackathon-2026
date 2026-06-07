import json
import logging

from app.schemas.encounter import ReportCard, ReportResponse
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)

_ON_SITE_PROMPT = """\
あなたはAIペットです。交流分析の結果をもとに、その場ですぐ使える軽い話題カードを3枚作ってください。

交流分析:
{analysis_json}

ペットの口調: {pet_tone}

出力JSON:
{{
  "cards": [
    {{"card_type": "conversation_starter", "title": "最初に聞く一言", "body": "具体的な一言"}},
    {{"card_type": "common_point", "title": "共通点", "body": "発見した共通点"}},
    {{"card_type": "conversation_starter", "title": "続けて話せる話題", "body": "次の話題へのつなぎ"}}
  ]
}}

注意: カードは短く、初対面でも使えるものにしてください。敬語と丁寧語を使ってください。
"""

_POST_VISIT_PROMPT = """\
あなたはAIペットです。交流後の帰宅後レポートを作ってください。
相手との共通点をもとに、次回の会話につながる内容を6種類のカードで提案してください。

交流分析:
{analysis_json}

ペットの口調: {pet_tone}
ペットの性格: {pet_personality}

出力JSON:
{{
  "cards": [
    {{"card_type": "common_point", "title": "今日の共通点", "body": "発見できた共通点の詳細"}},
    {{"card_type": "conversation_starter", "title": "会話ネタ", "body": "次回使える会話のネタ"}},
    {{"card_type": "next_topic", "title": "次回話したいこと", "body": "深掘りできそうな話題"}},
    {{"card_type": "thank_you_template", "title": "ありがとうLINE案", "body": "送れるメッセージの文例"}},
    {{"card_type": "new_interest", "title": "新しい趣味候補", "body": "相手から紹介されそうな趣味・おすすめ"}},
    {{"card_type": "pet_message", "title": "ペットからの一言", "body": "AIペットの気づきや応援メッセージ"}}
  ]
}}
"""


class TopicAgent:
    def __init__(self, vertex_ai: VertexAIService, firestore: FirestoreService):
        self._ai = vertex_ai
        self._db = firestore

    def generate_on_site_cards(self, analysis: dict, pet_tone: str = "やわらかい短文") -> list[ReportCard]:
        prompt = _ON_SITE_PROMPT.format(
            analysis_json=json.dumps(analysis, ensure_ascii=False),
            pet_tone=pet_tone,
        )
        return self._call_and_parse(prompt, temperature=0.5)

    def generate_post_visit_report(
        self, analysis_id: str, analysis: dict, pet_tone: str = "やわらかい短文", pet_personality: str = "好奇心旺盛"
    ) -> ReportResponse:
        existing = self._db.get_report_cards(analysis_id)
        if existing:
            return ReportResponse(
                analysis_id=analysis_id,
                cards=[_dict_to_card(c) for c in existing],
            )

        prompt = _POST_VISIT_PROMPT.format(
            analysis_json=json.dumps(analysis, ensure_ascii=False),
            pet_tone=pet_tone,
            pet_personality=pet_personality,
        )
        cards = self._call_and_parse(prompt, temperature=0.5)
        card_dicts = [{"card_type": c.card_type, "title": c.title, "body": c.body} for c in cards]
        card_ids = self._db.save_report_cards(analysis_id, card_dicts)

        final_cards = []
        for i, card in enumerate(cards):
            final_cards.append(ReportCard(
                card_id=card_ids[i] if i < len(card_ids) else str(i),
                card_type=card.card_type,
                title=card.title,
                body=card.body,
            ))
        return ReportResponse(analysis_id=analysis_id, cards=final_cards)

    def _call_and_parse(self, prompt: str, temperature: float) -> list[ReportCard]:
        try:
            raw = self._ai.generate_json(prompt, temperature=temperature)
            cards_raw = raw.get("cards", [])
            result = []
            for i, c in enumerate(cards_raw):
                result.append(ReportCard(
                    card_id=str(i),
                    card_type=c.get("card_type", "conversation_starter"),
                    title=c.get("title", ""),
                    body=c.get("body", ""),
                ))
            return result
        except Exception as e:
            logger.error("LLM3 topic generation failed: %s", e)
            return []


def _dict_to_card(d: dict) -> ReportCard:
    return ReportCard(
        card_id=d.get("id", ""),
        card_type=d.get("card_type", "common_point"),
        title=d.get("title", ""),
        body=d.get("body", ""),
    )
