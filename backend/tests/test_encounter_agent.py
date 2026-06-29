from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.agents.encounter_agent import EncounterAgent


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
    token_svc.generate_payload_raw.return_value = [17000, 18000, 19000]
    token_svc.payload_to_token_key.return_value = "abc123"
    return EncounterAgent(ai, db, token_svc), db, token_svc


def test_issue_token():
    agent, db, token_svc = make_agent()

    result = agent.issue_token("user1")

    assert result.token_key == "abc123"
    assert result.payload_raw == [17000, 18000, 19000]
    db.save_exchange_token.assert_called_once()


def test_resolve_token_not_found():
    agent, db, token_svc = make_agent()
    db.get_exchange_token.return_value = None

    result = agent.resolve_token("user2", [17000, 18000, 19000])

    assert result.status == "not_found"


def test_resolve_token_expired():
    agent, db, token_svc = make_agent()
    db.get_exchange_token.return_value = {
        "token_key": "abc123",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat(),
        "used": False,
    }

    result = agent.resolve_token("user2", [17000, 18000, 19000])

    assert result.status == "expired"


def test_resolve_token_reverse_match_creates_session():
    agent, db, token_svc = make_agent()
    db.get_exchange_token.return_value = {
        "token_key": "abc123",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "used": False,
    }
    db.find_reverse_match.return_value = {
        "id": "reverse-record",
        "resolver_id": "user1",
        "token_owner_id": "user2",
        "payload_raw": [19000, 18000, 17000],
    }
    db.create_exchange_session.return_value = "session1"
    db._list.return_value = []

    result = agent.resolve_token("user2", [17000, 18000, 19000])

    assert result.status == "matched"
    assert result.session_id == "session1"
    db.create_exchange_session.assert_called_once()
    db.update_match_record.assert_called_once_with("reverse-record", {"session_id": "session1"})
