import pytest

from app.agents.topic_agent import TopicAgent

from .helpers import CapturingAI, load_golden_set, make_db_mock


GOLDEN_SETS = load_golden_set("topic_agent_cases.json")


def _cards_for(case: dict) -> list[dict]:
    return [
        {
            "card_type": card_type,
            "title": f"{index + 1}枚目",
            "body": " / ".join(case["analysis"].get("common_topics", [])) or "会話のきっかけ",
        }
        for index, card_type in enumerate(case["expected_types"])
    ]


@pytest.mark.parametrize("case", GOLDEN_SETS, ids=lambda c: c["description"])
def test_topic_card_generation_regression(case):
    ai = CapturingAI({"cards": _cards_for(case)})
    db = make_db_mock()
    db.save_report_cards.side_effect = lambda analysis_id, cards: [f"card-{i}" for i in range(len(cards))]
    agent = TopicAgent(ai, db)

    if case["mode"] == "on_site":
        cards = agent.generate_on_site_cards(case["analysis"])
    else:
        cards = agent.generate_post_visit_report("analysis1", case["analysis"]).cards

    assert len(cards) == case["expected_count"]
    assert [card.card_type for card in cards] == case["expected_types"]

    prompt = ai.prompts[0]
    for topic in case["analysis"].get("common_topics", []):
        assert topic in prompt
    assert "cards" in prompt
