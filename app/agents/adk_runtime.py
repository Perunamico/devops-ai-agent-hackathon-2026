from __future__ import annotations

import logging
from typing import Any

from app.agents.definitions import build_agent_definitions
from app.agents.fallback_runtime import FallbackAgentRuntime
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class ADKAgentRuntime(FallbackAgentRuntime):
    """ADK integration boundary.

    The Google Agent Development Kit APIs have evolved quickly. This class keeps
    all ADK imports and agent construction isolated from FastAPI and the loop
    orchestrator. When google-adk is installed, we build Agent objects to make
    the multi-agent topology explicit, while delegating deterministic execution
    to FallbackAgentRuntime unless a project wires a newer Runner/SessionService
    here. If ADK import/construction fails, factory code falls back safely.
    """

    name = "adk"

    def __init__(self, settings: Settings | None = None) -> None:
        super().__init__()
        self.settings = settings or get_settings()
        self.agent_definitions = build_agent_definitions(self.settings.gemini_model)
        self.adk_agents: dict[str, Any] = {}
        self._build_adk_agents()

    def _build_adk_agents(self) -> None:
        try:
            from google.adk.agents import Agent

            for name, definition in self.agent_definitions.items():
                self.adk_agents[name] = Agent(
                    name=f"loopplan_{name}_agent",
                    model=definition.model,
                    description=definition.role,
                    instruction=definition.role,
                )
            logger.info("ADK agents initialized: %s", ",".join(self.adk_agents.keys()))
        except Exception as exc:
            logger.warning("ADK agent construction failed: %s", exc.__class__.__name__)
            raise


def create_runtime(settings: Settings | None = None) -> FallbackAgentRuntime:
    settings = settings or get_settings()
    if settings.runtime_mode == "fallback":
        return FallbackAgentRuntime()
    if settings.runtime_mode in {"auto", "adk"}:
        try:
            return ADKAgentRuntime(settings)
        except Exception:
            if settings.runtime_mode == "adk":
                logger.warning("RUNTIME_MODE=adk requested, but ADK unavailable; using fallback to keep API healthy")
            return FallbackAgentRuntime()
    return FallbackAgentRuntime()
