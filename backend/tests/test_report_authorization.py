from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.main import get_report, submit_feedback
from app.schemas.encounter import FeedbackRequest


def _db_with_analysis_and_session(session=None):
    db = MagicMock()
    db.get_exchange_analysis.return_value = {
        "id": "analysis1",
        "session_id": "session1",
        "common_topics": ["音楽"],
        "personal_points": {
            "userA": [{"topic": "音楽", "point": "A視点"}],
            "userB": [{"topic": "音楽", "point": "B視点"}],
        },
    }
    db.get_exchange_session.return_value = session or {
        "user_a_id": "userA",
        "user_b_id": "userB",
    }
    return db


def test_get_report_forbids_non_participant():
    db = _db_with_analysis_and_session()

    with pytest.raises(HTTPException) as exc:
        get_report("analysis1", uid="intruder", db=db, ai=MagicMock())

    assert exc.value.status_code == 403


def test_submit_feedback_forbids_non_participant():
    db = _db_with_analysis_and_session()

    with pytest.raises(HTTPException) as exc:
        submit_feedback(
            "analysis1",
            FeedbackRequest(card_id="card1", reaction="used"),
            uid="intruder",
            db=db,
            ai=MagicMock(),
        )

    assert exc.value.status_code == 403
    db.save_card_feedback.assert_not_called()


def test_submit_feedback_allows_participant():
    db = _db_with_analysis_and_session()

    with patch("app.main.MemoryAgent") as memory_agent_cls:
        response = submit_feedback(
            "analysis1",
            FeedbackRequest(card_id="card1", reaction="used"),
            uid="userA",
            db=db,
            ai=MagicMock(),
        )

    assert response == {"card_id": "card1", "reaction": "used"}
    db.save_card_feedback.assert_called_once_with("analysis1", "card1", "used")
    memory_agent_cls.return_value.update_from_feedback.assert_called_once()
