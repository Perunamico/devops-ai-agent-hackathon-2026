import json
from pathlib import Path
from unittest.mock import MagicMock


def load_golden_set(filename: str) -> list[dict]:
    path = Path(__file__).parent / "golden_sets" / filename
    return json.loads(path.read_text(encoding="utf-8"))


class CapturingAI:
    def __init__(self, responses: list[dict] | dict):
        self.prompts: list[str] = []
        self.temperatures: list[float] = []
        self._responses = responses if isinstance(responses, list) else [responses]

    def generate_json(self, prompt: str, temperature: float = 0.2) -> dict:
        self.prompts.append(prompt)
        self.temperatures.append(temperature)
        if not self._responses:
            raise AssertionError("No fake LLM response left")
        return self._responses.pop(0)


def make_memory_response(case: dict) -> dict:
    category = case["expected_category"]
    if category == "public":
        return {
            "category": "public",
            "interests": [case["input"]],
            "values": [],
            "recent_topics": [case["input"]],
            "conversation_style_notes": "",
            "safe_summary": case["input"],
            "blocked_reason": "",
            "review_reason": "",
        }
    if category == "blocked":
        return {
            "category": "blocked",
            "interests": [],
            "values": [],
            "recent_topics": [],
            "conversation_style_notes": "",
            "safe_summary": "",
            "blocked_reason": "個人情報",
            "review_reason": "",
        }
    return {
        "category": category,
        "interests": [],
        "values": [],
        "recent_topics": [case["input"]],
        "conversation_style_notes": "慎重な会話を好む",
        "safe_summary": "",
        "blocked_reason": "",
        "review_reason": "",
    }


def make_db_mock() -> MagicMock:
    db = MagicMock()
    db.get_blocked_topics.return_value = []
    db.get_private_memory.return_value = {}
    db.get_public_memory.return_value = {}
    db.get_report_cards.return_value = []
    return db
