from unittest.mock import MagicMock

from app.agents.conversation_agent import ConversationAgent


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
    return ConversationAgent(ai, db), db


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
