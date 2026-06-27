from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

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
    return EncounterAgent(ai, db, token_svc), db, token_svc


def test_issue_token():
    agent, db, token_svc = make_agent()
    token_svc.generate_payload_raw.return_value = [1, 2, 3, 4]
    token_svc.payload_to_token_key.return_value = "abc123"

    result = agent.issue_token("user1")

    assert result.payload_raw == [1, 2, 3, 4]
    assert result.token_key == "abc123"
    assert result.qr_url.endswith("/exchange?exchangeToken=abc123")
    db.save_exchange_token.assert_called_once()


def test_resolve_token_not_found():
    agent, db, token_svc = make_agent()
    token_svc.payload_to_token_key.return_value = "bad"
    db.get_exchange_token.return_value = None

    result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "not_found"


def test_resolve_token_expired():
    agent, db, token_svc = make_agent()
    token_svc.payload_to_token_key.return_value = "abc"
    db.get_exchange_token.return_value = {
        "token_key": "abc",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat(),
    }

    result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "expired"


def test_resolve_token_waits_until_reverse_match_exists():
    agent, db, token_svc = make_agent()
    token_svc.payload_to_token_key.return_value = "abc"
    db.get_exchange_token.return_value = {
        "token_key": "abc",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "used": False,
    }
    db.find_reverse_match.return_value = None

    result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "waiting"
    assert result.pending_id
    db.save_match_record.assert_called_once()


def test_resolve_token_matches_when_reverse_match_exists():
    agent, db, token_svc = make_agent()
    token_svc.payload_to_token_key.side_effect = ["abc", "abc", "reverse"]
    db.get_exchange_token.return_value = {
        "token_key": "abc",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "used": False,
    }
    db.find_reverse_match.return_value = {
        "id": "reverse-record",
        "payload_raw": [9, 8, 7],
    }
    db.create_exchange_session.return_value = "session1"
    db._list.return_value = []

    with patch("app.agents.encounter_agent.asyncio.get_event_loop") as get_event_loop:
        result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "matched"
    assert result.session_id == "session1"
    db.create_exchange_session.assert_called_once()
    db.mark_exchange_token_used.assert_any_call("abc")
    db.mark_exchange_token_used.assert_any_call("reverse")
    get_event_loop.return_value.call_soon.assert_called_once()
