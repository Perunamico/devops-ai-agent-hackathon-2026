import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException

from app.agents.encounter_agent import EncounterAgent
from app.agents.conversation_agent import ConversationAgent
from app.agents.memory_agent import MemoryAgent
from app.agents.topic_agent import TopicAgent
from app.config import Settings, get_settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.encounter import (
    ExchangeTokenResponse,
    FriendItem,
    FriendsResponse,
    ResolveExchangeRequest,
    ResolveExchangeResponse,
    MatchStatusResponse,
    SessionResponse,
    ExchangeAnalysisResponse,
    FeedbackRequest,
    ReportResponse,
)
from app.schemas.memory import (
    MemoryApproveRequest,
    MemoryClassifyResult,
    MemoryListItem,
    MemoryListResponse,
    PublicMemoryResponse,
    ReviewItem,
    SelectedLabel,
    SelectedLabelsResponse,
    SetLabelsRequest,
)
from app.schemas.pet import PetCreate, PetResponse, UserInputCreate
from app.services.firestore_service import FirestoreService
from app.services.token_service import EmailNotVerifiedError, TokenService
from app.services.vertex_ai_service import VertexAIService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---- Singletons ----

_firestore: FirestoreService | None = None
_vertex_ai: VertexAIService | None = None
_token_service: TokenService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _firestore, _vertex_ai, _token_service
    settings = get_settings()
    _firestore = FirestoreService(settings)
    _vertex_ai = VertexAIService(settings)
    _token_service = TokenService(settings)
    logger.info("AI Pet API started")
    yield
    logger.info("AI Pet API shutting down")


app = FastAPI(title="AI Pet API", version="2.0.0", lifespan=lifespan)


@app.middleware("http")
async def strip_hosting_api_prefix(request, call_next):
    if request.scope["path"].startswith("/api/"):
        request.scope["path"] = request.scope["path"][4:]
    elif request.scope["path"] == "/api":
        request.scope["path"] = "/"
    return await call_next(request)


# ---- Dependencies ----

def get_firestore() -> FirestoreService:
    assert _firestore is not None
    return _firestore


def get_vertex_ai() -> VertexAIService:
    assert _vertex_ai is not None
    return _vertex_ai


def get_token_service_dep() -> TokenService:
    assert _token_service is not None
    return _token_service


async def require_auth(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
    token_svc: TokenService = Depends(get_token_service_dep),
) -> str:
    if settings.skip_auth:
        return "dev-user-id"
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    id_token = authorization.removeprefix("Bearer ").strip()
    try:
        return token_svc.verify_firebase_token(id_token)
    except EmailNotVerifiedError:
        raise HTTPException(status_code=403, detail="Email not verified")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _encounter(
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
    token_svc: TokenService = Depends(get_token_service_dep),
) -> EncounterAgent:
    return EncounterAgent(ai, db, token_svc)


# ---- Routes ----

@app.get("/health")
def health():
    return {"status": "ok"}


def _extract_initial_profile_bg(
    db: FirestoreService,
    ai: VertexAIService,
    uid: str,
    body: PetCreate,
) -> None:
    """ペット作成時のメモリ初期化。

    ペットの性格・口調は会話のトーン用に private memory に保存するだけにする。
    ユーザーはまだ何も話していないため、興味や公開カードはここでは作らない
    （ペットの性格をユーザーの嗜好として勝手にカード化しない）。
    """
    try:
        db.upsert_private_memory(uid, {
            "pet_personality": body.personality,
            "pet_tone": body.tone,
        })
    except Exception as e:
        logger.error("initial profile background task failed for %s: %s", uid, e)


@app.post("/pets", response_model=PetResponse)
def create_pet(
    body: PetCreate,
    background_tasks: BackgroundTasks,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
):
    pet_id = db.create_pet(uid, {"name": body.name, "personality": body.personality, "tone": body.tone})
    db.upsert_user(uid, {"name": uid})

    # LLM による初期プロフィール抽出はレスポンス後にバックグラウンドで実行し、
    # 名付け直後すぐにホームへ進めるようにする。
    background_tasks.add_task(_extract_initial_profile_bg, db, ai, uid, body)

    pet = db.get_pet_by_user(uid)
    return PetResponse(
        pet_id=pet_id,
        user_id=uid,
        name=body.name,
        personality=body.personality,
        tone=body.tone,
        created_at=pet.get("created_at", "") if pet else "",
    )


@app.get("/pets/me", response_model=PetResponse | None)
def get_current_pet(
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    pet = db.get_pet_by_user(uid)
    if not pet:
        return None
    return PetResponse(
        pet_id=pet.get("id", ""),
        user_id=uid,
        name=pet.get("name", ""),
        personality=pet.get("personality", ""),
        tone=pet.get("tone", ""),
        created_at=pet.get("created_at", ""),
    )


@app.post("/inputs", response_model=MemoryClassifyResult)
def submit_input(
    body: UserInputCreate,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
):
    agent = MemoryAgent(ai, db)
    return agent.classify_and_store(uid, body)


MAX_SELECTED_LABELS = 30


@app.get("/memories/labels", response_model=SelectedLabelsResponse)
def get_selected_labels(
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    labels = db.get_selected_labels(uid)
    return SelectedLabelsResponse(labels=[SelectedLabel(**label) for label in labels])


@app.put("/memories/labels", response_model=SelectedLabelsResponse)
def set_selected_labels(
    body: SetLabelsRequest,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
):
    # 上限のみサーバ側で担保する（最低数はオンボーディング/設定 UI 側で担保）。
    labels = [label.model_dump() for label in body.labels[:MAX_SELECTED_LABELS]]
    agent = MemoryAgent(ai, db)
    saved = agent.apply_selected_labels(uid, labels)
    return SelectedLabelsResponse(labels=[SelectedLabel(**label) for label in saved])


def _reclassify_recent_bg(db: FirestoreService, ai: VertexAIService, uid: str) -> None:
    """直近の会話を毎ターン再構成して分類・保存する（応答をブロックしないバックグラウンド処理）。"""
    try:
        MemoryAgent(ai, db).reclassify_recent(uid)
    except Exception as e:
        logger.error("reclassify_recent background task failed for %s: %s", uid, e)


@app.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
):
    agent = ConversationAgent(ai, db)
    response = agent.chat(uid, body.message)

    # 発話の応答後に、記憶の分類・整理を非同期で実行する（発話と分類を分離）。
    background_tasks.add_task(_reclassify_recent_bg, db, ai, uid)
    return response


@app.get("/memories/public", response_model=PublicMemoryResponse)
def get_public_memory(
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    mem = db.get_public_memory(uid) or {}
    return PublicMemoryResponse(
        user_id=uid,
        safe_topic_tags=mem.get("safe_topic_tags", []),
        safe_summaries=mem.get("safe_summaries", []),
        public_conversation_hooks=mem.get("public_conversation_hooks", []),
        shareable_interests=mem.get("shareable_interests", []),
        updated_at=mem.get("updated_at", ""),
    )


@app.get("/memories", response_model=MemoryListResponse)
def get_memories(
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    memories = db.get_memory_list(uid)
    return MemoryListResponse(
        review=[MemoryListItem(**item) for item in memories["review"]],
        allowed=[MemoryListItem(**item) for item in memories["allowed"]],
        secret=[MemoryListItem(**item) for item in memories["secret"]],
    )


@app.get("/memories/review", response_model=list[ReviewItem])
def get_review_items(
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    items = db.get_review_items(uid)
    return [
        ReviewItem(
            id=item.get("id", ""),
            candidate_summary=item.get("candidate_summary", ""),
            reason=item.get("reason", ""),
            status=item.get("status", "pending"),
            created_at=item.get("created_at", ""),
        )
        for item in items
    ]


@app.put("/memories/{item_id}/approve")
def approve_memory(
    item_id: str,
    body: MemoryApproveRequest,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    db.resolve_review_item(uid, item_id, body.action)
    return {"item_id": item_id, "action": body.action}


# ---- Exchange エンドポイント（新方式）----

@app.post("/exchanges/token", response_model=ExchangeTokenResponse)
def issue_exchange_token(
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.issue_token(uid)


@app.post("/exchanges/resolve", response_model=ResolveExchangeResponse)
def resolve_exchange(
    body: ResolveExchangeRequest,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.resolve_token(uid, body.payload_raw)


@app.get("/exchanges/match/{pending_id}", response_model=MatchStatusResponse)
def get_match_status(
    pending_id: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.get_match_status(pending_id, uid)


@app.get("/exchanges/token/{token_key}/poll", response_model=MatchStatusResponse)
def poll_token_status(
    token_key: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.poll_token(token_key, uid)


@app.post("/exchanges/qr-scan/{token_key}", response_model=ResolveExchangeResponse)
def scan_qr_token(
    token_key: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.scan_qr_token(uid, token_key)


@app.get("/exchanges/session/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.get_session(session_id, uid)


@app.post("/exchanges/session/{session_id}/ready")
def mark_session_ready(
    session_id: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    agent.mark_ready(session_id, uid)
    return {"session_id": session_id, "ready": True}


@app.post("/exchanges/session/{session_id}/end")
def end_session(
    session_id: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    agent.end_session(session_id, uid)
    return {"session_id": session_id, "status": "ended"}


# ---- friends（交流が成立した相手の一覧）----

@app.get("/friends", response_model=FriendsResponse)
def get_friends(
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
):
    data = db.get_friends_overview(uid)
    return FriendsResponse(
        friends=[FriendItem(**f) for f in data["friends"]],
        friend_count=data["friend_count"],
        common_topic_count=data["common_topic_count"],
        last_interaction_at=data["last_interaction_at"],
    )


# ---- analysis / reports（旧 AnalysisScreen 互換）----

@app.get("/exchanges/{session_id}/analysis", response_model=ExchangeAnalysisResponse)
def get_exchange_analysis(
    session_id: str,
    uid: str = Depends(require_auth),
    agent: EncounterAgent = Depends(_encounter),
):
    return agent.get_analysis(session_id, uid)


@app.get("/reports/{analysis_id}", response_model=ReportResponse)
def get_report(
    analysis_id: str,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
):
    analysis = db.get_exchange_analysis(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # personal_points は本人専用。レポート生成 LLM の文脈に相手のぶんを混ぜない。
    analysis = {k: v for k, v in analysis.items() if k != "personal_points"}

    private_mem = db.get_private_memory(uid) or {}
    pet_tone = private_mem.get("pet_tone", "やわらかい短文")
    pet_personality = private_mem.get("pet_personality", "好奇心旺盛")

    agent = TopicAgent(ai, db)
    return agent.generate_post_visit_report(analysis_id, analysis, pet_tone, pet_personality)


@app.post("/reports/{analysis_id}/feedback")
def submit_feedback(
    analysis_id: str,
    body: FeedbackRequest,
    uid: str = Depends(require_auth),
    db: FirestoreService = Depends(get_firestore),
    ai: VertexAIService = Depends(get_vertex_ai),
):
    db.save_card_feedback(analysis_id, body.card_id, body.reaction)

    reactions = [{"card_id": body.card_id, "reaction": body.reaction}]
    mem_agent = MemoryAgent(ai, db)
    mem_agent.update_from_feedback(uid, reactions)

    return {"card_id": body.card_id, "reaction": body.reaction}
