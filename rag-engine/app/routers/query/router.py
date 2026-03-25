from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.query.service import get_query_service

router = APIRouter(prefix="/query", tags=["query"])


class ConversationMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class QueryRequest(BaseModel):
    tenant_id: str
    profile_id: str
    question: str
    conversation_history: Optional[list[ConversationMessage]] = None
    system_prompt: Optional[str] = None
    embed_provider: str = "openai"   # "openai" | "local"


@router.post("")
async def query_rag(req: QueryRequest):
    """
    Embed the question, retrieve relevant chunks from Qdrant,
    and generate an answer via Claude claude-sonnet-4-6.
    embed_provider selects which vector space to search.
    """
    svc = get_query_service()
    try:
        history = (
            [{"role": m.role, "content": m.content} for m in req.conversation_history]
            if req.conversation_history
            else None
        )
        result = await svc.query(
            tenant_id=req.tenant_id,
            profile_id=req.profile_id,
            question=req.question,
            conversation_history=history,
            system_prompt=req.system_prompt,
            embed_provider=req.embed_provider,
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
