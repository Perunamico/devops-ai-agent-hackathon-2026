from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.agents.conversation_agent import (
    REINJECT_EVERY_TURNS,
    SESSION_GAP_MINUTES,
    ConversationAgent,
    _render_memory_summary,
    _should_inject_memory,
)


def make_agent(reply: dict | None = None, raise_error: bool = False):
    ai = MagicMock()
    if raise_error:
        ai.generate_json.side_effect = RuntimeError("LLM error")
    else:
        ai.generate_json.return_value = reply or {
            "reply": "写真いいね。どんなものを撮るのが好き？",
            "intent": "interest_discovery",
            "ui_hint": {"emotion": "curious", "animation": "stretch"},
        }
    db = MagicMock()
    db.get_pet_by_user.return_value = {"name": "ポチ", "personality": "やさしい", "tone": "穏やか"}
    db.get_recent_chat_messages.return_value = []
    db.get_private_memory.return_value = {}
    db.count_chat_messages.return_value = 0
    return ConversationAgent(ai, db), db


def _last_prompt(ai) -> str:
    return ai.generate_json.call_args.args[0]


_SAMPLE_PRIVATE = {
    "profiles": [
        {
            "topic": "写真",
            "category_large": "写真・カメラ",
            "preference": "like",
            "intensity": "high",
            "contents": [{"content": "休日に風景写真を撮りに行くと話した。"}],
        }
    ],
    "conversation_style_notes": "ゆっくり話すのが好き",
}


def test_chat_returns_natural_reply_and_does_not_classify_synchronously():
    agent, db = make_agent()

    result = agent.chat("user1", "最近写真にハマってる")

    assert result.reply == "写真いいね。どんなものを撮るのが好き？"
    assert result.intent == "interest_discovery"
    # 分類は非同期に分離したので、発話エージェントの同期パスでは記憶を作らない。
    assert result.memory is None
    db.save_chat_message.assert_called_once()
    db.upsert_public_memory.assert_not_called()
    db.upsert_private_memory.assert_not_called()
    db.add_review_required.assert_not_called()


def test_chat_falls_back_when_reply_generation_fails():
    agent, db = make_agent(raise_error=True)

    result = agent.chat("user1", "今日は疲れた")

    assert result.reply
    assert result.memory is None
    db.save_chat_message.assert_called_once()


def test_render_memory_summary_formats_profiles():
    text = _render_memory_summary(_SAMPLE_PRIVATE)

    assert "写真" in text
    assert "写真・カメラ" in text
    assert "like・high" in text
    assert "休日に風景写真を撮りに行くと話した。" in text
    assert "会話スタイル: ゆっくり話すのが好き" in text


def test_render_memory_summary_empty_when_no_profiles():
    assert _render_memory_summary({}) == ""
    assert _render_memory_summary({"profiles": []}) == ""


def test_should_inject_memory_at_conversation_start():
    now = datetime.now(timezone.utc)
    # 初回（往復0）は冒頭なので注入する
    assert _should_inject_memory(0, None, now) is True


def test_should_inject_memory_after_time_gap():
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(minutes=SESSION_GAP_MINUTES + 5)).isoformat()
    # 間隔が空いていれば新しい会話の冒頭として注入する
    assert _should_inject_memory(3, stale, now) is True


def test_should_inject_memory_periodically_when_long():
    now = datetime.now(timezone.utc)
    recent = (now - timedelta(minutes=1)).isoformat()
    # 往復数が倍数のとき（長引いた再注入）は注入する
    assert _should_inject_memory(REINJECT_EVERY_TURNS, recent, now) is True


def test_should_not_inject_memory_on_ordinary_turn():
    now = datetime.now(timezone.utc)
    recent = (now - timedelta(minutes=1)).isoformat()
    # 直近発話が近く、往復数も倍数でない通常ターンは注入しない
    assert _should_inject_memory(REINJECT_EVERY_TURNS + 1, recent, now) is False


def test_chat_includes_memory_summary_at_start():
    agent, db = make_agent()
    db.get_private_memory.return_value = _SAMPLE_PRIVATE
    db.get_recent_chat_messages.return_value = []
    db.count_chat_messages.return_value = 0

    agent.chat("user1", "やっほー")

    prompt = _last_prompt(agent._ai)
    assert "休日に風景写真を撮りに行くと話した。" in prompt


def test_chat_omits_memory_summary_on_ordinary_turn():
    agent, db = make_agent()
    db.get_private_memory.return_value = _SAMPLE_PRIVATE
    now = datetime.now(timezone.utc)
    db.get_recent_chat_messages.return_value = [
        {"user_message": "うん", "pet_reply": "そっか", "created_at": (now - timedelta(minutes=1)).isoformat()},
    ]
    db.count_chat_messages.return_value = REINJECT_EVERY_TURNS + 1

    agent.chat("user1", "うん")

    prompt = _last_prompt(agent._ai)
    assert "休日に風景写真を撮りに行くと話した。" not in prompt
