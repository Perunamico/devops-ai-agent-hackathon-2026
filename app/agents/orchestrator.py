from __future__ import annotations

import logging
from typing import Any

from app.agents.adk_runtime import create_runtime
from app.schemas import FinalPlan, LoopTrace, PlanRequest, PlanResponse
from app.services.firestore_repo import PlanRepository, create_repository
from app.tools.storage_tools import load_recent_plans, save_plan_to_firestore
from app.utils.ids import new_request_id

logger = logging.getLogger(__name__)


class PlanOrchestrator:
    def __init__(self, runtime: Any | None = None, repository: PlanRepository | None = None) -> None:
        self.runtime = runtime or create_runtime()
        self.repository = repository or create_repository()

    @property
    def runtime_name(self) -> str:
        return getattr(self.runtime, "name", "fallback")

    def run(self, request: PlanRequest) -> PlanResponse:
        request_id = new_request_id()
        intake = self.runtime.run_intake(request.message, request.deadline)
        recent = [item.model_dump(mode="json") for item in load_recent_plans(self.repository, request.user_id)]
        traces: list[LoopTrace] = []
        revision_requests: list[str] = []
        best_plan = None
        best_critic = None
        best_risk = None

        for loop_index in range(1, request.max_loops + 1):
            plan = self.runtime.run_planner(intake, recent, revision_requests)
            critic = self.runtime.run_critic(intake, plan, loop_index, request.quality_threshold)
            risk = self.runtime.run_risk(intake, plan)
            trace = LoopTrace(
                loop_index=loop_index,
                planner_summary=f"{plan.plan_title} / steps={len(plan.steps)} / first={plan.first_action}",
                critic_score=critic.score,
                critic_weaknesses=critic.weaknesses,
                revision_requests=critic.revision_requests,
                risk_warning_level=risk.warning_level,
            )
            traces.append(trace)
            if best_critic is None or critic.score >= best_critic.score:
                best_plan, best_critic, best_risk = plan, critic, risk
            if critic.score >= request.quality_threshold and not critic.should_revise:
                logger.info("Early stop request_id=%s loop=%s score=%s", request_id, loop_index, critic.score)
                break
            revision_requests = critic.revision_requests or ["計画をより具体化し、リスク対策を追加する"]

        assert best_plan is not None and best_critic is not None and best_risk is not None
        formatted = self.runtime.run_formatter(best_plan, best_risk, [trace.model_dump() for trace in traces])
        final_plan = FinalPlan.model_validate(formatted.get("final_plan", best_plan.model_dump()))
        response = PlanResponse(
            request_id=request_id,
            user_id=request.user_id,
            summary=str(formatted.get("summary", best_plan.plan_title)),
            final_plan=final_plan,
            today_first_action=str(formatted.get("today_first_action", final_plan.first_action)),
            risks=list(formatted.get("risks", best_risk.risks)),
            alternatives=list(formatted.get("alternatives", [])),
            evaluation_score=best_critic.score,
            loop_count=len(traces),
            agent_trace=traces,
            improvement_history=list(formatted.get("improvement_history", [])),
            confidence=formatted.get("confidence", "medium"),
            saved=False,
        )
        save_result = save_plan_to_firestore(self.repository, response, request.message)
        response.saved = bool(save_result["saved"])
        return response
