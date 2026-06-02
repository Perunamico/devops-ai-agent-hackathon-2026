import pytest
from unittest.mock import MagicMock

from app.agents.memory_agent import MemoryAgent
from app.schemas.memory import MemoryClassifyResult
from app.schemas.pet import UserInputCreate


def make_agent(llm_response: dict | None = None, raise_error: bool = False):
    ai = MagicMock()
    if raise_error:
        ai.generate_json.side_effect = RuntimeError("LLM error")
    else:
        ai.generate_json.return_value = llm_response or {
            "category": "public",
            "interests": ["カフェ作業"],
            "values": [],
            "recent_topics": ["朝の静かな時間"],
            "conversation_style_notes": "",
            "safe_summary": "カフェで作業するのが好き",
            "blocked_reason": "",
            "review_reason": "",
        }
    db = MagicMock()
    db.get_blocked_topics.return_value = []
    return MemoryAgent(ai, db), db


def test_classify_obviously_blocked():
    agent, db = make_agent()
    result = agent.classify_and_store(
        "user1",
        UserInputCreate(input_type="chat", content="電話番号は090-1234-5678です"),
    )
    assert result.category == "blocked"
    db.add_blocked_memory.assert_called_once()
    db.upsert_public_memory.assert_not_called()


def test_classify_public():
    agent, db = make_agent()
    result = agent.classify_and_store(
        "user1",
        UserInputCreate(input_type="chat", content="カフェで作業するのが好きです"),
    )
    assert result.category == "public"
    assert "カフェ作業" in result.interests
    db.upsert_public_memory.assert_called_once()
    db.upsert_private_memory.assert_called_once()


def test_classify_falls_back_to_private_on_llm_error():
    agent, db = make_agent(raise_error=True)
    result = agent.classify_and_store(
        "user1",
        UserInputCreate(input_type="chat", content="最近読書にはまっています"),
    )
    assert result.category == "private"
    db.upsert_public_memory.assert_not_called()
