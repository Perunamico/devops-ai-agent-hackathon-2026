import pytest
from pydantic import ValidationError

from app.schemas import PlanRequest


def test_plan_request_limits() -> None:
    with pytest.raises(ValidationError):
        PlanRequest(user_id="", message="ok")
    with pytest.raises(ValidationError):
        PlanRequest(user_id="u", message="x", max_loops=6)
    with pytest.raises(ValidationError):
        PlanRequest(user_id="u", message="x", quality_threshold=101)
