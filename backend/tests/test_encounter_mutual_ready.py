"""相互確認ゲート＋ペア単位の冪等セッションの統合テスト（実インメモリ FirestoreService）。

「片方だけ交流成功画面に遷移する」バグの回帰を、モックではなく実データストア上で検証する。
"""
from unittest.mock import MagicMock, patch

import pytest

from app.agents.encounter_agent import EncounterAgent
from app.config import Settings
from app.services.firestore_service import FirestoreService
from app.services.token_service import TokenService


@pytest.fixture
def agent():
    settings = Settings(firestore_enabled=False, skip_auth=True)
    db = FirestoreService(settings)
    token_svc = TokenService(settings)
    ai = MagicMock()
    return EncounterAgent(ai, db, token_svc), db


def _active_sessions(db: FirestoreService) -> list[dict]:
    return [s for s in db._list("exchange_sessions") if s.get("status") == "active"]


def test_both_sides_reach_same_session_and_gate_requires_both(agent):
    ag, db = agent
    tok_a = ag.issue_token("A")
    tok_b = ag.issue_token("B")

    with patch("app.agents.encounter_agent._run_background_coro"):
        # A が B のトークンを先に照合 → 待機
        a_res = ag.resolve_token("A", tok_b.payload_raw)
        assert a_res.status == "waiting"
        assert a_res.pending_id

        # B が A のトークンを照合 → 成立
        b_res = ag.resolve_token("B", tok_a.payload_raw)
        assert b_res.status == "matched"
        assert b_res.session_id

    # 待機していた A も、同一セッションで matched になる（配送の信頼化）
    a_status = ag.get_match_status(a_res.pending_id, "A")
    assert a_status.status == "matched"
    assert a_status.session_id == b_res.session_id

    session_id = b_res.session_id
    # ゲート: 片方だけ ready では both_ready=False
    assert ag.get_session(session_id, "B").both_ready is False
    ag.mark_ready(session_id, "B")
    assert ag.get_session(session_id, "A").both_ready is False
    # 双方 ready で初めて True
    ag.mark_ready(session_id, "A")
    assert ag.get_session(session_id, "A").both_ready is True
    assert ag.get_session(session_id, "B").both_ready is True


def test_waiting_side_matches_even_with_duplicate_stale_records(agent):
    ag, db = agent
    tok_a = ag.issue_token("A")
    tok_b = ag.issue_token("B")

    with patch("app.agents.encounter_agent._run_background_coro"):
        a_res = ag.resolve_token("A", tok_b.payload_raw)
        # 古い/重複した A→B レコードを故意に混入（未定義順で取り違えを誘発する状況を再現）
        db.save_match_record({
            "resolver_id": "A", "token_owner_id": "B",
            "payload_raw": tok_b.payload_raw, "pending_id": "stale", "session_id": None,
        })
        b_res = ag.resolve_token("B", tok_a.payload_raw)
        assert b_res.status == "matched"

    # A が実際にポーリングしている pending_id のレコードに session_id が反映されていなくても、
    # ペアのアクティブセッション実在で matched を返せる。
    a_status = ag.get_match_status(a_res.pending_id, "A")
    assert a_status.status == "matched"
    assert a_status.session_id == b_res.session_id


def test_pair_session_is_idempotent_no_double_session(agent):
    ag, db = agent
    tok_a = ag.issue_token("A")
    tok_b = ag.issue_token("B")

    # 同時照合を再現: 両方向の照合レコードが揃った状態で、双方がほぼ同時に
    # _establish_session まで到達するケース。既存アクティブセッションの再利用で
    # 1つに収束し、二重セッションを作らないことを検証する。
    record_a = {"resolver_id": "A", "token_owner_id": "B", "payload_raw": tok_b.payload_raw}
    record_b = {"resolver_id": "B", "token_owner_id": "A", "payload_raw": tok_a.payload_raw}
    db.save_match_record({**record_a, "pending_id": "pa", "session_id": None})
    db.save_match_record({**record_b, "pending_id": "pb", "session_id": None})

    with patch("app.agents.encounter_agent._run_background_coro"):
        s1 = ag._establish_session("B", "A", tok_a.payload_raw, record_a)
        s2 = ag._establish_session("A", "B", tok_b.payload_raw, record_b)

    assert s1 == s2
    assert len(_active_sessions(db)) == 1


def test_mark_ready_rejects_non_participant(agent):
    from fastapi import HTTPException
    ag, db = agent
    tok_a = ag.issue_token("A")
    tok_b = ag.issue_token("B")
    with patch("app.agents.encounter_agent._run_background_coro"):
        ag.resolve_token("A", tok_b.payload_raw)
        b_res = ag.resolve_token("B", tok_a.payload_raw)
    with pytest.raises(HTTPException) as exc:
        ag.mark_ready(b_res.session_id, "intruder")
    assert exc.value.status_code == 403
