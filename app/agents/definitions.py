from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

AgentName = Literal["intake", "planner", "critic", "risk", "formatter"]


@dataclass(frozen=True)
class AgentDefinition:
    name: AgentName
    role: str
    model: str
    tools: tuple[str, ...] = ()


def build_agent_definitions(model: str) -> dict[AgentName, AgentDefinition]:
    return {
        "intake": AgentDefinition("intake", "Extract task type, goal, constraints, deadline and ambiguity.", model, ("classify_task_type", "normalize_deadline")),
        "planner": AgentDefinition("planner", "Create concrete step-by-step plans and revise them from critic feedback.", model, ("estimate_effort",)),
        "critic": AgentDefinition("critic", "Evaluate plans against feasibility, specificity, constraints and risk readiness.", model),
        "risk": AgentDefinition("risk", "Identify failure modes and mitigations for the plan.", model),
        "formatter": AgentDefinition("formatter", "Format the best plan for end users.", model),
    }
