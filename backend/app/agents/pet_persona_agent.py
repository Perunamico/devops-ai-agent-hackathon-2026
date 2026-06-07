import json
import logging

from app.schemas.memory import MemoryClassifyResult
from app.schemas.pet import PetCreate
from app.services.vertex_ai_service import VertexAIService

logger = logging.getLogger(__name__)

_INITIAL_PROFILE_PROMPT = """\
あなたはAIペットです。新しい飼い主の最初のプロフィール情報を読み、飼い主を理解するためのJSON分析を行ってください。

ペットの設定:
- 名前: {pet_name}
- 性格: {personality}
- 口調: {tone}

飼い主の初期入力:
{inputs_json}

出力JSON:
{{
  "category": "public",
  "interests": ["抽出した興味・関心"],
  "values": ["抽出した価値観"],
  "recent_topics": ["最近の話題・関心"],
  "conversation_style_notes": "会話スタイルの観察",
  "safe_summary": "共有可能な自己紹介要約（個人情報を含まない）",
  "blocked_reason": "",
  "review_reason": ""
}}

注意: 初期設定なので公開範囲は広めに判断してください。
safe_summaryは「〇〇が好きな人」という形で、抽象的かつポジティブに書いてください。
"""


class PetPersonaAgent:
    def __init__(self, vertex_ai: VertexAIService):
        self._ai = vertex_ai

    def extract_initial_profile(self, pet: PetCreate, initial_inputs: dict) -> MemoryClassifyResult:
        prompt = _INITIAL_PROFILE_PROMPT.format(
            pet_name=pet.name,
            personality=pet.personality,
            tone=pet.tone,
            inputs_json=json.dumps(initial_inputs, ensure_ascii=False),
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.3)
            return MemoryClassifyResult(**raw)
        except Exception as e:
            logger.error("LLM1 initial profile failed: %s", e)
            return MemoryClassifyResult(
                category="private",
                interests=list(initial_inputs.values()) if isinstance(initial_inputs, dict) else [],
            )
