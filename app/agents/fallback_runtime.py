from __future__ import annotations

import logging
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.agents import prompts
from app.schemas import CriticResult, FinalPlan, IntakeResult, PlanDraft, PlanStep, RiskResult
from app.services.gemini_client import GeminiClient
from app.tools.task_tools import classify_task_type, estimate_effort, normalize_deadline

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class FallbackAgentRuntime:
    name = "fallback"

    def __init__(self, gemini_client: GeminiClient | None = None) -> None:
        self.gemini = gemini_client or GeminiClient()

    def _generate_model(self, prompt: str, model_cls: type[T], fallback: T) -> T:
        if self.gemini.configured:
            try:
                payload = self.gemini.generate_json(prompt, model_cls.model_json_schema())
                return model_cls.model_validate(payload)
            except (RuntimeError, ValidationError, ValueError) as exc:
                logger.warning("%s failed; using deterministic fallback: %s", model_cls.__name__, exc.__class__.__name__)
        return fallback

    def run_intake(self, message: str, deadline: str | None) -> IntakeResult:
        normalized = normalize_deadline(deadline)
        fallback = IntakeResult(
            task_type=classify_task_type(message),
            goal=f"{message[:120]} を実行可能な計画に落とし込む",
            constraints=[f"期限: {deadline}"] if deadline else [],
            deadline=str(normalized["normalized_deadline"] or deadline or "未指定"),
            missing_information=["利用可能な時間", "成果物の完成基準"],
            urgency="high" if deadline and ("明日" in deadline or "今日" in deadline) else "medium",
            complexity="high" if len(message) > 80 else "medium",
        )
        return self._generate_model(prompts.intake_prompt(message, deadline), IntakeResult, fallback)

    def run_planner(self, intake: IntakeResult, recent_plans: list[dict[str, Any]], revision_requests: list[str]) -> PlanDraft:
        base_minutes = 45 if intake.urgency == "high" else 60
        revisions = " / ".join(revision_requests[:2])
        steps = [
            PlanStep(title="ゴールと完了条件を1枚に書く", description=f"目的・期限・制約を確認し、完了の定義を決める。{revisions}", estimated_minutes=20, priority="high"),
            PlanStep(title="作業を3〜5個の成果物に分割する", description="重要度順に並べ、最短で価値が出る順番にする。", estimated_minutes=base_minutes, priority="high"),
            PlanStep(title="最初の成果物を作る", description="粗くてもよいので、レビュー可能な形にする。", estimated_minutes=90, priority="high"),
            PlanStep(title="リスク確認と調整", description="詰まりそうな箇所を先に潰し、代替案を用意する。", estimated_minutes=30, priority="medium"),
        ]
        effort = estimate_effort(steps)
        fallback = PlanDraft(
            plan_title=f"{intake.goal[:40]}ための実行計画",
            steps=steps,
            estimated_total_time=int(effort["total_minutes"]),
            priorities=["今日着手できる最小成果物", "期限から逆算した時間配分", "詰まりやすい依存関係の先出し"],
            required_resources=["タイマー", "メモツール", "参考資料", "レビュー相手またはチェックリスト"],
            first_action="5分だけ使って、完了条件と今日の作業枠をメモに書く",
        )
        return self._generate_model(prompts.planner_prompt(intake.model_dump(), recent_plans, revision_requests), PlanDraft, fallback)

    def run_critic(self, intake: IntakeResult, plan: PlanDraft, loop_index: int, threshold: int) -> CriticResult:
        has_risk_step = any("リスク" in step.title or "調整" in step.title for step in plan.steps)
        score = min(92, 68 + loop_index * 10 + (8 if has_risk_step else 0) + (4 if plan.first_action else 0))
        should_revise = score < threshold
        fallback = CriticResult(
            score=score,
            weaknesses=[] if not should_revise else ["優先順位と時間配分をさらに具体化できる", "失敗時の代替案が不足している"],
            revision_requests=[] if not should_revise else ["各ステップの成果物を明確にする", "時間超過時に削る作業を明記する"],
            should_revise=should_revise,
        )
        return self._generate_model(prompts.critic_prompt(intake.model_dump(), plan.model_dump()), CriticResult, fallback)

    def run_risk(self, intake: IntakeResult, plan: PlanDraft) -> RiskResult:
        fallback = RiskResult(
            risks=["見積もりより作業量が増える", "必要情報が不足して着手が止まる", "完璧を狙って初動が遅れる"],
            mitigations=["25分単位で進捗を確認する", "不明点は仮置きして先にドラフトを作る", "最小成果物を先に完成させる"],
            warning_level="medium" if intake.complexity != "high" else "high",
        )
        return self._generate_model(prompts.risk_prompt(intake.model_dump(), plan.model_dump()), RiskResult, fallback)

    def run_formatter(self, plan: PlanDraft, risk: RiskResult, traces: list[dict[str, Any]]) -> dict[str, Any]:
        fallback = {
            "summary": f"{plan.plan_title}。最初の行動まで具体化しました。",
            "final_plan": FinalPlan(**plan.model_dump()).model_dump(),
            "today_first_action": plan.first_action,
            "risks": risk.risks,
            "alternatives": ["時間が足りない場合は高優先度ステップだけ実施する", "不明点が多い場合は30分で調査スプリントを挟む"],
            "confidence": "high" if traces and traces[-1]["critic_score"] >= 80 else "medium",
            "improvement_history": [f"Loop {t['loop_index']}: score {t['critic_score']} / requests: {', '.join(t['revision_requests']) or 'なし'}" for t in traces],
        }
        if self.gemini.configured:
            try:
                payload = self.gemini.generate_json(prompts.formatter_prompt(plan.model_dump(), risk.model_dump(), traces))
                return payload
            except Exception as exc:
                logger.warning("Formatter failed; using fallback: %s", exc.__class__.__name__)
        return fallback
