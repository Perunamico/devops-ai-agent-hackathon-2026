import pytest

from app.agents.pet_persona_agent import PetPersonaAgent
from app.schemas.pet import PetCreate

from .helpers import CapturingAI, load_golden_set


GOLDEN_SETS = load_golden_set("pet_persona_agent_cases.json")


@pytest.mark.parametrize("case", GOLDEN_SETS, ids=lambda c: c["description"])
def test_pet_persona_initial_profile_regression(case):
    ai = CapturingAI({
        "category": case["expected_category"],
        "interests": case["expected_interests"],
        "values": [],
        "recent_topics": list(case["initial_inputs"].values()),
        "conversation_style_notes": "初期入力から抽出",
        "safe_summary": "、".join(case["expected_interests"]) + "が好きな人",
        "blocked_reason": "",
        "review_reason": "",
    })
    agent = PetPersonaAgent(ai)
    pet = PetCreate(**case["pet"])

    result = agent.extract_initial_profile(pet, case["initial_inputs"])

    assert result.category == case["expected_category"]
    for interest in case["expected_interests"]:
        assert interest in result.interests

    prompt = ai.prompts[0]
    assert pet.name in prompt
    assert pet.personality in prompt
    assert pet.tone in prompt
    for value in case["initial_inputs"].values():
        assert value in prompt
    assert "safe_summary" in prompt
