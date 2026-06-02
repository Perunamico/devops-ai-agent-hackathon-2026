from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.agents.encounter_agent import EncounterAgent
from app.schemas.encounter import JoinExchangeRequest


def make_agent():
    ai = MagicMock()
    ai.generate_json.return_value = {
        "common_topics": ["音楽"],
        "related_topics": ["ライブ"],
        "conversation_hooks": ["最近聴いてる曲ある？"],
        "followup_suggestions": ["おすすめのアーティスト"],
        "new_interest_candidates": ["レコード"],
    }
    db = MagicMock()
    token_svc = MagicMock()
    return EncounterAgent(ai, db, token_svc), db, token_svc


def test_issue_token():
    agent, db, token_svc = make_agent()
    expires = datetime.now(timezone.utc) + timedelta(seconds=30)
    token_svc.generate_exchange_token.return_value = ("abc123", expires)
    token_svc.encode_token_to_frequencies.return_value = [17000, 18000, 19000]

    result = agent.issue_token("user1")

    assert result.token == "abc123"
    assert result.sound_frequencies == [17000, 18000, 19000]
    db.save_exchange_token.assert_called_once()


def test_join_session_token_not_found():
    agent, db, token_svc = make_agent()
    db.get_exchange_token.return_value = None

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        agent.join_session("user2", JoinExchangeRequest(token="bad", exchange_method="qr_fallback"))
    assert exc.value.status_code == 404


def test_join_session_token_expired():
    agent, db, token_svc = make_agent()
    db.get_exchange_token.return_value = {
        "token": "abc",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat(),
    }

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        agent.join_session("user2", JoinExchangeRequest(token="abc", exchange_method="qr_fallback"))
    assert exc.value.status_code == 410


def test_both_approve_triggers_llm2():
    agent, db, token_svc = make_agent()
    db.get_participants.return_value = [
        {"user_id": "user1", "approved": True},
        {"user_id": "user2", "approved": True},
    ]
    db.get_public_memory.return_value = {"safe_topic_tags": ["音楽"]}
    db.get_blocked_topics.return_value = []
    db.save_exchange_analysis.return_value = "analysis-id"

    result = agent.approve_exchange("session1", "user2", True)

    assert result["status"] == "confirmed"
    db.save_exchange_analysis.assert_called_once()
