from unittest.mock import MagicMock

from app.agents.conversation_agent import ConversationAgent


def make_agent(reply: dict | None = None, raise_error: bool = False):
    ai = MagicMock()
    if raise_error:
        ai.generate_json.side_effect = RuntimeError("LLM error")
    else:
        ai.generate_json.side_effect = [
            {
                "category": "public",
                "interests": ["写真"],
                "values": [],
                "recent_topics": ["写真の話"],
                "conversation_style_notes": "",
                "safe_summary": "写真に興味がある",
                "blocked_reason": "",
                "review_reason": "",
            },
            reply or {
                "reply": "写真いいね。どんなものを撮るのが好き？",
                "intent": "interest_discovery",
                "ui_hint": {"emotion": "curious", "animation": "stretch"},
            },
        ]
    db = MagicMock()
    db.get_blocked_topics.return_value = []
    db.get_pet_by_user.return_value = {"name": "ポチ", "personality": "やさしい", "tone": "穏やか"}
    db.get_private_memory.return_value = {}
    return ConversationAgent(ai, db), db


def test_chat_returns_natural_reply_and_stores_memory():
    agent, db = make_agent()

    result = agent.chat("user1", "最近写真にハマってる")

    assert result.reply == "写真いいね。どんなものを撮るのが好き？"
    assert result.intent == "interest_discovery"
    assert result.memory is not None
    assert result.memory.category == "public"
    db.upsert_public_memory.assert_called_once()
    db.save_chat_message.assert_called_once()


def test_chat_falls_back_when_reply_generation_fails():
    agent, db = make_agent(raise_error=True)

    result = agent.chat("user1", "今日は疲れた")

    assert result.reply
    assert result.memory is not None
    assert result.memory.category == "private"
    db.save_chat_message.assert_called_once()
