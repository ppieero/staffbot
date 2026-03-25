from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.indexing.service import get_indexer
from app.config import get_settings

router = APIRouter(prefix="/index", tags=["indexing"])


class IndexRequest(BaseModel):
    document_id: str
    tenant_id: str
    profile_id: str
    file_url: str
    file_type: str
    embed_provider: str = "openai"   # "openai" | "local"


class DeleteRequest(BaseModel):
    document_id: str
    tenant_id: str
    embed_provider: str = "openai"


@router.post("")
async def index_document(req: IndexRequest):
    """Download, parse, chunk, embed, and upsert a document into Qdrant."""
    indexer = get_indexer()
    try:
        chunk_count = await indexer.process_document(
            document_id=req.document_id,
            tenant_id=req.tenant_id,
            profile_id=req.profile_id,
            file_url=req.file_url,
            file_type=req.file_type,
            embed_provider=req.embed_provider,
        )
        return {
            "status":         "indexed",
            "document_id":    req.document_id,
            "chunk_count":    chunk_count,
            "embed_provider": req.embed_provider,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/delete")
async def delete_document(req: DeleteRequest):
    """Remove all Qdrant vectors for a document."""
    indexer = get_indexer()
    try:
        await indexer.delete_document_vectors(
            req.document_id, req.tenant_id, req.embed_provider
        )
        return {"status": "deleted", "document_id": req.document_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/health")
async def health():
    settings = get_settings()
    qdrant_ok = False
    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(url=settings.QDRANT_URL, timeout=2)
        client.get_collections()
        qdrant_ok = True
    except Exception:
        pass

    return {
        "status":               "ok",
        "qdrant_connected":     qdrant_ok,
        "model":                "claude-sonnet-4-6",
        "embed_providers":      ["openai", "local"],
        "default_provider":     "openai",
        "openai_configured":    bool(settings.OPENAI_API_KEY),
        "anthropic_configured": bool(settings.ANTHROPIC_API_KEY),
    }
