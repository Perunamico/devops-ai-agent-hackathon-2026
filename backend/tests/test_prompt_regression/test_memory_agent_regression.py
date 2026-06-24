import pytest

from app.agents.memory_agent import MemoryAgent
from app.schemas.pet import UserInputCreate

from .helpers import CapturingAI, load_golden_set, make_db_mock, make_memory_response


GOLDEN_SETS = load_golden_set("memory_agent_cases.json")


@pytest.mark.parametrize("case", GOLDEN_SETS, ids=lambda c: c["description"])
def test_memory_classification_regression(case):
    ai = CapturingAI(make_memory_response(case))
    db = make_db_mock()
    agent = MemoryAgent(ai, db)

    result = agent.classify_and_store(
        "user1",
        UserInputCreate(input_type="chat", content=case["input"]),
    )

    assert result.category == case["expected_category"], (
        f"[{case['description']}] "
        f"Expected: {case['expected_category']}, Got: {result.category}"
    )

    if case["expected_storage"] == "blocked":
        db.add_blocked_memory.assert_called_once()
        db.upsert_public_memory.assert_not_called()
    elif case["expected_storage"] == "public":
        db.upsert_public_memory.assert_called_once()
        db.upsert_private_memory.assert_called_once()
    elif case["expected_storage"] == "private":
        db.upsert_private_memory.assert_called_once()
        db.upsert_public_memory.assert_not_called()

    if ai.prompts:
        prompt = ai.prompts[0]
        assert case["input"] in prompt
        assert "private" in prompt
        assert "public" in prompt
        assert "blocked" in prompt
        assert "review_required" in prompt
        assert "safe_summary" in prompt
