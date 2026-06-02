from unittest.mock import MagicMock

from app.agents.topic_agent import TopicAgent


def make_agent(cards_raw):
    ai = MagicMock()
    ai.generate_json.return_value = {"cards": cards_raw}
    db = MagicMock()
    db.get_report_cards.return_value = []
    db.save_report_cards.side_effect = lambda aid, cards: [str(i) for i in range(len(cards))]
    return TopicAgent(ai, db)


def test_on_site_cards_returns_3():
    cards_raw = [
        {"card_type": "conversation_starter", "title": "T1", "body": "B1"},
        {"card_type": "common_point", "title": "T2", "body": "B2"},
        {"card_type": "conversation_starter", "title": "T3", "body": "B3"},
    ]
    agent = make_agent(cards_raw)
    result = agent.generate_on_site_cards({"common_topics": ["音楽"]})
    assert len(result) == 3


def test_post_visit_report_returns_6_types():
    cards_raw = [
        {"card_type": "common_point", "title": "共通点", "body": "音楽"},
        {"card_type": "conversation_starter", "title": "会話ネタ", "body": "最近の曲"},
        {"card_type": "next_topic", "title": "次回", "body": "ライブ"},
        {"card_type": "thank_you_template", "title": "ありがとう", "body": "LINE案"},
        {"card_type": "new_interest", "title": "新趣味", "body": "レコード"},
        {"card_type": "pet_message", "title": "ペット", "body": "楽しかったね"},
    ]
    agent = make_agent(cards_raw)
    result = agent.generate_post_visit_report("analysis1", {"common_topics": ["音楽"]})
    assert len(result.cards) == 6
    types = {c.card_type for c in result.cards}
    assert "common_point" in types
    assert "pet_message" in types
