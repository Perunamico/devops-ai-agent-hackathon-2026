import asyncio
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.agents.encounter_agent import EncounterAgent, _match_profiles_to_topics


def make_agent():
    ai = MagicMock()
    db = MagicMock()
    token = MagicMock()
    return EncounterAgent(ai, db, token), ai, db


# ---- _match_profiles_to_topics ----

def test_match_profiles_normalized_and_excludes_nonmatching():
    profiles = [
        {"topic": "鬼滅の刃"},
        {"topic": "Coffee"},        # 大文字小文字を無視して "coffee" と一致
        {"topic": "野球観戦"},        # common_topics に無い → 除外
    ]
    matched = _match_profiles_to_topics(profiles, ["鬼滅の刃", "coffee"])
    topics = {p["topic"] for p in matched}
    assert topics == {"鬼滅の刃", "Coffee"}


def test_match_profiles_empty_topics():
    assert _match_profiles_to_topics([{"topic": "x"}], []) == []


# ---- _generate_personal ----

def test_generate_personal_returns_message_and_only_matched_points():
    agent, ai, db = make_agent()
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
    # マッチしたトピックだけが LLM に渡っていること
    prompt_arg = ai.generate_json.call_args.args[0]
    assert "鬼滅の刃" in prompt_arg
    assert "秘密の山" not in prompt_arg


def test_generate_personal_no_common_topics_skips_llm():
    agent, ai, db = make_agent()
    assert agent._generate_personal([], "userA") == ("", [])
    ai.generate_json.assert_not_called()


def test_generate_personal_no_match_skips_llm():
    agent, ai, db = make_agent()
    db.get_private_memory.return_value = {"profiles": [{"topic": "登山"}]}
    assert agent._generate_personal(["コーヒー"], "userA") == ("", [])
    ai.generate_json.assert_not_called()


def test_generate_personal_returns_empty_on_error():
    agent, ai, db = make_agent()
    db.get_private_memory.return_value = {"profiles": [{"topic": "鬼滅の刃"}]}
    ai.generate_json.side_effect = RuntimeError("LLM error")
    assert agent._generate_personal(["鬼滅の刃"], "userA") == ("", [])


# ---- _intensity_hints ----

def test_intensity_hints_only_shareable_topics():
    agent, ai, db = make_agent()
    db.get_private_memory.return_value = {
        "profiles": [
            {"topic": "鬼滅の刃", "intensity": "high", "preference": "like", "category_small": "作品"},
            {"topic": "収入の話", "intensity": "high"},  # 共有可能でない → 除外
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
    agent, ai, db = make_agent()
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
    agent, ai, db = make_agent()
    db.get_exchange_session.return_value = _session()
    with pytest.raises(HTTPException) as exc:
        agent.get_analysis("s1", "intruder")
    assert exc.value.status_code == 403


def test_get_analysis_404_when_analysis_missing():
    agent, ai, db = make_agent()
    db.get_exchange_session.return_value = _session()
    db.get_analysis_by_session.return_value = None
    with pytest.raises(HTTPException) as exc:
        agent.get_analysis("s1", "userA")
    assert exc.value.status_code == 404


# ---- orchestration in _generate_common_message_async ----

def test_generate_common_message_stores_per_user_message_and_points():
    agent, ai, db = make_agent()
    db.get_public_memory.return_value = {"shareable_interests": ["鬼滅の刃"]}
    db.get_blocked_topics.return_value = []
    db.get_private_memory.return_value = {
        "profiles": [{"topic": "鬼滅の刃", "intensity": "high"}]
    }

    def fake_generate(prompt, temperature=0.3):
        if "お話をしたら" in prompt:  # per-user プロンプト（例文に含まれる）
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
    assert session_update["common_message"] == "2人とも鬼滅が好きなんだね！"  # shared fallback
    assert session_update["analysis_id"] == "an1"
    # per-user メッセージが両者ぶん保存される
    assert set(session_update["common_message_by_user"].keys()) == {"userA", "userB"}
    assert "話をしたら？" in session_update["common_message_by_user"]["userA"]


# ---- get_session per-user メッセージ選択 ----

def test_get_session_returns_per_user_message_with_fallback():
    agent, ai, db = make_agent()
    db.get_exchange_session.return_value = {
        "user_a_id": "userA",
        "user_b_id": "userB",
        "status": "active",
        "speaker_id": "userA",
        "common_message": "2人とも鬼滅が好きなんだね！",  # shared fallback
        "common_message_by_user": {"userA": "Aさん専用メッセージ"},
        "analysis_id": "an1",
    }

    resp_a = agent.get_session("s1", "userA")
    resp_b = agent.get_session("s1", "userB")

    assert resp_a.common_message == "Aさん専用メッセージ"          # 本人ぶん
    assert resp_b.common_message == "2人とも鬼滅が好きなんだね！"  # 無いので共通にフォールバック
