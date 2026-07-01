import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.agents.encounter_agent import EncounterAgent, _match_profiles_to_topics


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
    return EncounterAgent(ai, db, token_svc), ai, db, token_svc


# ---- token exchange ----

def test_issue_token():
    agent, _ai, db, token_svc = make_agent()
    token_svc.generate_payload_raw.return_value = [1, 2, 3, 4]
    token_svc.payload_to_token_key.return_value = "abc123"

    result = agent.issue_token("user1")

    assert result.payload_raw == [1, 2, 3, 4]
    assert result.token_key == "abc123"
    assert result.qr_url.endswith("/?exchangeToken=abc123")
    db.save_exchange_token.assert_called_once()


def test_resolve_token_not_found():
    agent, _ai, db, token_svc = make_agent()
    token_svc.payload_to_token_key.return_value = "bad"
    db.get_exchange_token.return_value = None

    result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "not_found"


def test_resolve_token_expired():
    agent, _ai, db, token_svc = make_agent()
    token_svc.payload_to_token_key.return_value = "abc"
    db.get_exchange_token.return_value = {
        "token_key": "abc",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat(),
    }

    result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "expired"


def test_resolve_token_waits_until_reverse_match_exists():
    agent, _ai, db, token_svc = make_agent()
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
    agent, _ai, db, token_svc = make_agent()
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

    with patch("app.agents.encounter_agent._run_background_coro") as run_bg:
        result = agent.resolve_token("user2", [1, 2, 3])

    assert result.status == "matched"
    assert result.session_id == "session1"
    db.create_exchange_session.assert_called_once()
    db.mark_exchange_token_used.assert_any_call("abc")
    db.mark_exchange_token_used.assert_any_call("reverse")
    run_bg.assert_called_once()
    run_bg.call_args.args[0].close()


def test_scan_qr_token_matches_and_notifies_owner_poll():
    agent, _ai, db, _token_svc = make_agent()
    db.get_exchange_token.return_value = {
        "token_key": "abc",
        "issued_by": "user1",
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "used": False,
    }
    db.create_exchange_session.return_value = "session1"

    with patch("app.agents.encounter_agent._run_background_coro") as run_bg:
        result = agent.scan_qr_token("user2", "abc")

    assert result.status == "matched"
    assert result.session_id == "session1"
    db.mark_exchange_token_used_with_session.assert_called_once_with("abc", "session1")
    run_bg.assert_called_once()
    run_bg.call_args.args[0].close()


# ---- _match_profiles_to_topics ----

def test_match_profiles_normalized_and_excludes_nonmatching():
    profiles = [
        {"topic": "鬼滅の刃"},
        {"topic": "Coffee"},
        {"topic": "野球観戦"},
    ]
    matched = _match_profiles_to_topics(profiles, ["鬼滅の刃", "coffee"])
    topics = {p["topic"] for p in matched}
    assert topics == {"鬼滅の刃", "Coffee"}


def test_match_profiles_empty_topics():
    assert _match_profiles_to_topics([{"topic": "x"}], []) == []


# ---- _generate_personal ----

def test_generate_personal_returns_message_and_only_matched_points():
    agent, ai, db, _token_svc = make_agent()
    db.get_private_memory.return_value = {
        "profiles": [
            {"topic": "鬼滅の刃", "contents": [{"content": "煉獄さんが好き", "shareability": "private"}]},
            {"topic": "登山", "contents": [{"content": "秘密の山"}]},
        ]
    }
    ai.generate_json.return_value = {
        "message": "2人とも『鬼滅の刃』が大好きなんだね！煉獄さんの話をしたら？",
        "points": [{"topic": "鬼滅の刃", "point": "煉獄さんの生き様が刺さる"}],
    }

    message, points = agent._generate_personal(["鬼滅の刃"], "userA")

    assert message == "2人とも『鬼滅の刃』が大好きなんだね！煉獄さんの話をしたら？"
    assert points == [{"topic": "鬼滅の刃", "point": "煉獄さんの生き様が刺さる"}]
    prompt_arg = ai.generate_json.call_args.args[0]
    assert "鬼滅の刃" in prompt_arg
    assert "秘密の山" not in prompt_arg


def test_generate_personal_no_common_topics_skips_llm():
    agent, ai, _db, _token_svc = make_agent()
    assert agent._generate_personal([], "userA") == ("", [])
    ai.generate_json.assert_not_called()


def test_generate_personal_no_match_skips_llm():
    agent, ai, db, _token_svc = make_agent()
    db.get_private_memory.return_value = {"profiles": [{"topic": "登山"}]}
    assert agent._generate_personal(["コーヒー"], "userA") == ("", [])
    ai.generate_json.assert_not_called()


def test_generate_personal_returns_empty_on_error():
    agent, ai, db, _token_svc = make_agent()
    db.get_private_memory.return_value = {"profiles": [{"topic": "鬼滅の刃"}]}
    ai.generate_json.side_effect = RuntimeError("LLM error")
    assert agent._generate_personal(["鬼滅の刃"], "userA") == ("", [])


# ---- _intensity_hints ----

def test_intensity_hints_only_shareable_topics():
    agent, _ai, db, _token_svc = make_agent()
    db.get_private_memory.return_value = {
        "profiles": [
            {"topic": "鬼滅の刃", "intensity": "high", "preference": "like", "category_small": "作品"},
            {"topic": "収入の話", "intensity": "high"},
        ]
    }
    hints = agent._intensity_hints("userA", {"shareable_interests": ["鬼滅の刃"]})
    assert hints == [
        {"topic": "鬼滅の刃", "category_small": "作品", "intensity": "high", "preference": "like"}
    ]


# ---- get_analysis per-user slicing ----

def _session(a="userA", b="userB"):
    return {"user_a_id": a, "user_b_id": b}


def test_get_analysis_returns_only_callers_points():
    agent, _ai, db, _token_svc = make_agent()
    db.get_exchange_session.return_value = _session()
    db.get_analysis_by_session.return_value = {
        "id": "an1",
        "common_topics": ["鬼滅の刃"],
        "personal_points": {
            "userA": [{"topic": "鬼滅の刃", "point": "A視点"}],
            "userB": [{"topic": "鬼滅の刃", "point": "B視点"}],
        },
    }

    resp = agent.get_analysis("s1", "userA")

    assert [p.point for p in resp.personal_points] == ["A視点"]
    assert resp.common_topics == ["鬼滅の刃"]


def test_get_analysis_forbids_non_participant():
    agent, _ai, db, _token_svc = make_agent()
    db.get_exchange_session.return_value = _session()
    with pytest.raises(HTTPException) as exc:
        agent.get_analysis("s1", "intruder")
    assert exc.value.status_code == 403


def test_get_analysis_404_when_analysis_missing():
    agent, _ai, db, _token_svc = make_agent()
    db.get_exchange_session.return_value = _session()
    db.get_analysis_by_session.return_value = None
    with pytest.raises(HTTPException) as exc:
        agent.get_analysis("s1", "userA")
    assert exc.value.status_code == 404


# ---- orchestration in _generate_common_message_async ----

def test_generate_common_message_stores_per_user_message_and_points():
    agent, ai, db, _token_svc = make_agent()
    db.get_public_memory.return_value = {"shareable_interests": ["鬼滅の刃"]}
    db.get_blocked_topics.return_value = []
    db.get_private_memory.return_value = {
        "profiles": [{"topic": "鬼滅の刃", "intensity": "high"}]
    }

    def fake_generate(prompt, temperature=0.3):
        if "お話をしたら" in prompt:
            return {
                "message": "2人とも『鬼滅の刃』が大好きなんだね！話をしたら？",
                "points": [{"topic": "鬼滅の刃", "point": "刺さる"}],
            }
        return {"common_message": "2人とも鬼滅が好きなんだね！", "common_topics": ["鬼滅の刃"]}

    ai.generate_json.side_effect = fake_generate
    db.save_exchange_analysis.return_value = "an1"

    asyncio.run(agent._generate_common_message_async("s1", "userA", "userB"))

    saved = db.save_exchange_analysis.call_args.args[1]
    assert set(saved["personal_points"].keys()) == {"userA", "userB"}
    assert saved["personal_points"]["userA"] == [{"topic": "鬼滅の刃", "point": "刺さる"}]

    session_update = db.update_exchange_session.call_args.args[1]
    assert session_update["common_message"] == "2人とも鬼滅が好きなんだね！"
    assert session_update["analysis_id"] == "an1"
    assert set(session_update["common_message_by_user"].keys()) == {"userA", "userB"}
    assert "話をしたら？" in session_update["common_message_by_user"]["userA"]


# ---- get_session per-user message selection ----

def test_get_session_returns_per_user_message_with_fallback():
    agent, _ai, db, _token_svc = make_agent()
    db.get_exchange_session.return_value = {
        "user_a_id": "userA",
        "user_b_id": "userB",
        "status": "active",
        "speaker_id": "userA",
        "common_message": "2人とも鬼滅が好きなんだね！",
        "common_message_by_user": {"userA": "Aさん専用メッセージ"},
        "analysis_id": "an1",
    }

    resp_a = agent.get_session("s1", "userA")
    resp_b = agent.get_session("s1", "userB")

    assert resp_a.common_message == "Aさん専用メッセージ"
    assert resp_b.common_message == "2人とも鬼滅が好きなんだね！"
