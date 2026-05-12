from __future__ import annotations

import json
from typing import Any


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


def intake_prompt(message: str, deadline: str | None) -> str:
    return f"""あなたはIntake Agentです。
ユーザーの曖昧な依頼を読み、計画作成に必要な前提情報を抽出してください。
推測できる部分は推測してよいですが、不明点はmissing_informationに入れてください。
必ずJSONのみを返してください。

ユーザー入力: {message}
期限入力: {deadline or "未指定"}

出力JSON:
{{"task_type":"study|work|career|life|development|research|other","goal":"...","constraints":["..."],"deadline":"...","missing_information":["..."],"urgency":"low|medium|high","complexity":"low|medium|high"}}
"""


def planner_prompt(intake: dict[str, Any], recent_plans: list[dict[str, Any]], revision_requests: list[str]) -> str:
    return f"""あなたはPlanner Agentです。
Intake結果、過去の計画、Criticからの修正要求をもとに、実行可能な計画を作ってください。
抽象論ではなく、ユーザーが今日から動ける粒度にしてください。必ずJSONのみを返してください。

Intake結果: {_json(intake)}
過去の計画: {_json(recent_plans)}
修正要求: {_json(revision_requests)}

出力JSON:
{{"plan_title":"...","steps":[{{"title":"...","description":"...","estimated_minutes":30,"priority":"high|medium|low"}}],"estimated_total_time":180,"priorities":["..."],"required_resources":["..."],"first_action":"..."}}
"""


def critic_prompt(intake: dict[str, Any], plan: dict[str, Any]) -> str:
    return f"""あなたはCritic Agentです。
計画を厳しく評価し、改善すべき点を明確にしてください。甘い採点は禁止です。
ただし、実装可能な改善指示にしてください。必ずJSONのみを返してください。
評価観点: 実行可能性、具体性、時間見積もり、制約との整合性、最初の一歩の明確さ、リスク対応。

Intake結果: {_json(intake)}
計画: {_json(plan)}

出力JSON:
{{"score":0,"weaknesses":["..."],"revision_requests":["..."],"should_revise":true}}
"""


def risk_prompt(intake: dict[str, Any], plan: dict[str, Any]) -> str:
    return f"""あなたはRisk Agentです。
計画が失敗する要因を洗い出し、対策を提案してください。必ずJSONのみを返してください。

Intake結果: {_json(intake)}
計画: {_json(plan)}

出力JSON:
{{"risks":["..."],"mitigations":["..."],"warning_level":"low|medium|high"}}
"""


def formatter_prompt(plan: dict[str, Any], risk: dict[str, Any], traces: list[dict[str, Any]]) -> str:
    return f"""あなたはFormatter Agentです。
ユーザーに見せる最終回答を作成してください。専門用語を使いすぎず、実行しやすい形にしてください。
必ずJSONのみを返してください。

計画: {_json(plan)}
リスク: {_json(risk)}
改善履歴: {_json(traces)}

出力JSON:
{{"summary":"...","final_plan":{_json(plan)},"today_first_action":"...","risks":["..."],"alternatives":["..."],"confidence":"low|medium|high","improvement_history":["..."]}}
"""
