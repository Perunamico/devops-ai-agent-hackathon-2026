from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Literal

from app.schemas import PlanStep, TaskType


def classify_task_type(message: str) -> TaskType:
    text = message.lower()
    rules: list[tuple[TaskType, list[str]]] = [
        ("development", ["開発", "実装", "hackathon", "ハッカソン", "cloud", "api", "agent"]),
        ("study", ["勉強", "学習", "試験", "授業", "課題"]),
        ("career", ["就活", "es", "面接", "志望理由", "転職"]),
        ("research", ["研究", "発表", "論文", "資料"]),
        ("life", ["片付け", "買い物", "掃除", "家事", "部屋"]),
        ("work", ["仕事", "会議", "提案", "業務"]),
    ]
    for task_type, keywords in rules:
        if any(keyword in text for keyword in keywords):
            return task_type
    return "other"


def estimate_effort(steps: list[PlanStep] | list[dict]) -> dict[str, int | str]:
    total = 0
    for step in steps:
        total += step.estimated_minutes if isinstance(step, PlanStep) else int(step.get("estimated_minutes", 30))
    level = "low" if total <= 120 else "medium" if total <= 480 else "high"
    return {"total_minutes": total, "effort_level": level}


def normalize_deadline(deadline_text: str | None) -> dict[str, str | float | None]:
    if not deadline_text:
        return {"normalized_deadline": None, "confidence": 0.0}
    text = deadline_text.strip()
    today = date.today()
    if "明日" in text:
        return {"normalized_deadline": (today + timedelta(days=1)).isoformat(), "confidence": 0.8}
    if "今日" in text or "本日" in text:
        return {"normalized_deadline": today.isoformat(), "confidence": 0.8}
    match = re.search(r"(\d+)\s*(日|週間|週|ヶ月|か月)", text)
    if match:
        value = int(match.group(1))
        unit = match.group(2)
        days = value if unit == "日" else value * 7 if unit in {"週間", "週"} else value * 30
        return {"normalized_deadline": (today + timedelta(days=days)).isoformat(), "confidence": 0.7}
    return {"normalized_deadline": text, "confidence": 0.4}
