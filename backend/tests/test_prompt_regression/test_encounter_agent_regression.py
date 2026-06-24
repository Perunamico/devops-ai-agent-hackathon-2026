import asyncio

import pytest

from app.agents.encounter_agent import EncounterAgent

from .helpers import CapturingAI, load_golden_set, make_db_mock


GOLDEN_SETS = load_golden_set("encounter_agent_cases.json")


@pytest.mark.parametrize("case", GOLDEN_SETS, ids=lambda c: c["description"])
def test_encounter_common_message_regression(case):
    ai = CapturingAI({
        "common_topics": case["expected_common_topics"],
        "related_topics": [],
        "conversation_hooks": ["自然に聞ける一言"],
        "followup_suggestions": ["次に深める話題"],
        "new_interest_candidates": [],
        "common_message": f"{case['expected_message_contains']}の話で交流できそうだよ！",
    })
    db = make_db_mock()
    db.get_public_memory.side_effect = [
        case["user_a_memory"],
        case["user_b_memory"],
    ]
    db.get_blocked_topics.side_effect = [
        case["blocked_topics"],
        [],
    ]
    db.save_exchange_analysis.return_value = "analysis1"
    agent = EncounterAgent(ai, db, token_service=None)

    asyncio.run(agent._generate_common_message_async("session1", "userA", "userB"))

    prompt = ai.prompts[0]
    for topic in case["user_a_memory"]["safe_topic_tags"]:
        assert topic in prompt
    for topic in case["user_b_memory"]["safe_topic_tags"]:
        assert topic in prompt
    for blocked_topic in case["blocked_topics"]:
        assert blocked_topic in prompt

    saved_analysis = db.save_exchange_analysis.call_args.args[1]
    assert saved_analysis["common_topics"] == case["expected_common_topics"]
    assert case["expected_message_contains"] in db.update_exchange_session.call_args.args[1]["common_message"]
