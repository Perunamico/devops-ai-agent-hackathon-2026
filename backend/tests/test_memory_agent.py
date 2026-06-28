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
    db.get_private_memory.return_value = {}
    db.get_review_items.return_value = []
    return MemoryAgent(ai, db), db


def _profile(topic: str, large: str, intensity: str, shareability: str = "ok") -> dict:
    return {
        "topic": topic,
        "category_large": large,
        "category_medium": "",
        "category_small": "",
        "preference": "like",
        "intensity": intensity,
        "contents": [
            {"label": "example", "content": f"{topic}の話", "shareability": shareability, "confidence": "medium"}
        ],
    }


# ---- classify_and_store (単発入力 /inputs) ----

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


# ---- reclassify_recent (毎ターン再構成) ----

def make_reclassify_agent(llm_response: dict, window: list[dict], existing_profiles=None):
    ai = MagicMock()
    ai.generate_json.return_value = llm_response
    db = MagicMock()
    db.get_blocked_topics.return_value = []
    db.get_recent_chat_messages.return_value = window
    db.get_private_memory.return_value = {"profiles": existing_profiles or []}
    db.get_review_items.return_value = []
    return MemoryAgent(ai, db), db


def test_reclassify_no_messages_does_nothing():
    agent, db = make_reclassify_agent({}, window=[])
    result = agent.reclassify_recent("user1")
    assert result is None
    db.set_private_memory_profiles.assert_not_called()


def test_reclassify_persists_profile_with_intensity():
    window = [
        {"user_message": "最近キャンプにハマってて", "pet_reply": "いいね！"},
        {"user_message": "うん！毎週行ってる", "pet_reply": "すごい！"},
    ]
    llm = {
        "category": "public",
        "interests": ["キャンプ"],
        "profiles": [_profile("キャンプ", "自然・アウトドア", "high")],
    }
    agent, db = make_reclassify_agent(llm, window)

    agent.reclassify_recent("user1")

    db.set_private_memory_profiles.assert_called_once()
    saved = db.set_private_memory_profiles.call_args[0][1]
    assert len(saved) == 1
    assert saved[0]["topic"] == "キャンプ"
    assert saved[0]["intensity"] == "high"
    db.add_review_required.assert_not_called()


def test_reclassify_merges_same_topic_and_overwrites_intensity():
    existing = [_profile("キャンプ", "自然・アウトドア", "medium")]
    window = [{"user_message": "やっぱりキャンプ最高", "pet_reply": "ね！"}]
    llm = {"category": "public", "profiles": [_profile("キャンプ", "自然・アウトドア", "high")]}
    agent, db = make_reclassify_agent(llm, window, existing_profiles=existing)

    agent.reclassify_recent("user1")

    saved = db.set_private_memory_profiles.call_args[0][1]
    assert len(saved) == 1  # 同一トピックは増えず上書き
    assert saved[0]["intensity"] == "high"


def test_reclassify_splits_multi_topic():
    window = [{"user_message": "最近キャンプにハマってて、あと料理も好き", "pet_reply": "いいね！"}]
    llm = {
        "category": "public",
        "profiles": [
            _profile("キャンプ", "自然・アウトドア", "high"),
            _profile("料理", "食・グルメ", "medium"),
        ],
    }
    agent, db = make_reclassify_agent(llm, window)

    agent.reclassify_recent("user1")

    saved = db.set_private_memory_profiles.call_args[0][1]
    topics = {p["topic"] for p in saved}
    assert topics == {"キャンプ", "料理"}


def test_reclassify_backchannel_does_not_create_review():
    window = [
        {"user_message": "そうなんだ", "pet_reply": "うん"},
        {"user_message": "まあ", "pet_reply": "そっか"},
    ]
    # 相槌のみ＝新規の嗜好なし。private で profiles 空、確認待ちも作らない。
    llm = {"category": "private", "profiles": []}
    agent, db = make_reclassify_agent(llm, window)

    agent.reclassify_recent("user1")

    db.add_review_required.assert_not_called()
    db.set_private_memory_profiles.assert_not_called()


def test_reclassify_review_required_created_once():
    window = [{"user_message": "最近通院しててさ", "pet_reply": "そっか、無理しないでね"}]
    llm = {
        "category": "review_required",
        "safe_summary": "健康に関する話題",
        "review_reason": "センシティブで共有可否が曖昧",
        "profiles": [],
    }
    agent, db = make_reclassify_agent(llm, window)

    agent.reclassify_recent("user1")

    db.add_review_required.assert_called_once()


def test_reclassify_review_required_dedup_skips_existing():
    window = [{"user_message": "また通院の話だけど", "pet_reply": "うん"}]
    llm = {
        "category": "review_required",
        "safe_summary": "健康に関する話題",
        "review_reason": "センシティブ",
        "profiles": [],
    }
    agent, db = make_reclassify_agent(llm, window)
    db.get_review_items.return_value = [{"candidate_summary": "健康に関する話題"}]

    agent.reclassify_recent("user1")

    db.add_review_required.assert_not_called()


def test_reclassify_pii_in_latest_message_is_blocked_and_excluded():
    window = [{"user_message": "電話番号は090-1234-5678だよ", "pet_reply": "それは覚えないね"}]
    agent, db = make_reclassify_agent({"category": "private", "profiles": []}, window)

    agent.reclassify_recent("user1")

    db.add_blocked_memory.assert_called_once()
    # PII の1件のみなら除外後にメッセージが無くなり、LLM 分類は走らない。
    agent._ai.generate_json.assert_not_called()
