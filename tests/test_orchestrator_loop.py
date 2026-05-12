from app.agents.orchestrator import PlanOrchestrator
from app.schemas import CriticResult, PlanRequest
from app.services.memory_repo import MemoryPlanRepository


class LowScoreRuntime:
    name = "fallback"

    def __init__(self) -> None:
        from app.agents.fallback_runtime import FallbackAgentRuntime

        self.delegate = FallbackAgentRuntime()

    def run_intake(self, *args, **kwargs):
        return self.delegate.run_intake(*args, **kwargs)

    def run_planner(self, *args, **kwargs):
        return self.delegate.run_planner(*args, **kwargs)

    def run_critic(self, intake, plan, loop_index, threshold):
        return CriticResult(score=50, weaknesses=["low"], revision_requests=["revise"], should_revise=True)

    def run_risk(self, *args, **kwargs):
        return self.delegate.run_risk(*args, **kwargs)

    def run_formatter(self, *args, **kwargs):
        return self.delegate.run_formatter(*args, **kwargs)


class EarlyStopRuntime(LowScoreRuntime):
    def run_critic(self, intake, plan, loop_index, threshold):
        return CriticResult(score=90, weaknesses=[], revision_requests=[], should_revise=False)


def test_loop_stops_at_max_loops() -> None:
    orchestrator = PlanOrchestrator(runtime=LowScoreRuntime(), repository=MemoryPlanRepository())
    response = orchestrator.run(PlanRequest(user_id="u", message="研究発表資料を作る", max_loops=3))
    assert response.loop_count == 3
    assert len(response.agent_trace) == 3


def test_early_stop_when_score_above_threshold() -> None:
    orchestrator = PlanOrchestrator(runtime=EarlyStopRuntime(), repository=MemoryPlanRepository())
    response = orchestrator.run(PlanRequest(user_id="u", message="研究発表資料を作る", max_loops=3, quality_threshold=80))
    assert response.loop_count == 1
    assert response.evaluation_score == 90
