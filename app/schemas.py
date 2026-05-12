from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TaskType = Literal["study", "work", "career", "life", "development", "research", "other"]
Level = Literal["low", "medium", "high"]
Priority = Literal["high", "medium", "low"]
RuntimeName = Literal["adk", "fallback"]


class PlanRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=5000)
    deadline: str | None = Field(default=None, max_length=256)
    max_loops: int = Field(default=3, ge=1, le=5)
    quality_threshold: int = Field(default=80, ge=0, le=100)

    @field_validator("message", "user_id")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value


class IntakeResult(BaseModel):
    task_type: TaskType = "other"
    goal: str = "ユーザーの依頼を実行可能な計画にする"
    constraints: list[str] = Field(default_factory=list)
    deadline: str | None = None
    missing_information: list[str] = Field(default_factory=list)
    urgency: Level = "medium"
    complexity: Level = "medium"


class PlanStep(BaseModel):
    title: str
    description: str
    estimated_minutes: int = Field(ge=1, le=1440)
    priority: Priority = "medium"


class PlanDraft(BaseModel):
    plan_title: str
    steps: list[PlanStep] = Field(default_factory=list)
    estimated_total_time: int = Field(default=0, ge=0)
    priorities: list[str] = Field(default_factory=list)
    required_resources: list[str] = Field(default_factory=list)
    first_action: str = "最初の5分で、必要な情報を書き出す"


class CriticResult(BaseModel):
    score: int = Field(ge=0, le=100)
    weaknesses: list[str] = Field(default_factory=list)
    revision_requests: list[str] = Field(default_factory=list)
    should_revise: bool = True


class RiskResult(BaseModel):
    risks: list[str] = Field(default_factory=list)
    mitigations: list[str] = Field(default_factory=list)
    warning_level: Level = "medium"


class LoopTrace(BaseModel):
    loop_index: int = Field(ge=1)
    planner_summary: str
    critic_score: int = Field(ge=0, le=100)
    critic_weaknesses: list[str] = Field(default_factory=list)
    revision_requests: list[str] = Field(default_factory=list)
    risk_warning_level: Level = "medium"


class FinalPlan(BaseModel):
    plan_title: str
    steps: list[PlanStep]
    estimated_total_time: int = Field(ge=0)
    first_action: str
    priorities: list[str] = Field(default_factory=list)
    required_resources: list[str] = Field(default_factory=list)


class PlanResponse(BaseModel):
    request_id: str
    user_id: str
    summary: str
    final_plan: FinalPlan
    today_first_action: str
    risks: list[str]
    alternatives: list[str]
    evaluation_score: int = Field(ge=0, le=100)
    loop_count: int = Field(ge=1)
    agent_trace: list[LoopTrace]
    improvement_history: list[str] = Field(default_factory=list)
    confidence: Level = "medium"
    saved: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ErrorResponse(BaseModel):
    detail: str
    request_id: str | None = None


class StoredPlan(BaseModel):
    user_id: str
    request_id: str
    original_message: str
    final_plan: dict[str, Any]
    agent_trace: list[dict[str, Any]]
    evaluation_score: int
    created_at: datetime

    model_config = ConfigDict(arbitrary_types_allowed=True)
