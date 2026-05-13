from typing import List, Optional

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
    index_images: bool = True


class IndexTextRequest(BaseModel):
    """Index pre-extracted plain text (e.g. from Notion)."""
    tenant_id: str
    profile_ids: List[str]
    source: str                      # "notion" | "custom"
    source_id: str                   # notion_resource_id or similar
    notion_resource_id: Optional[str] = None
    resource_category: Optional[str] = None
    title: str
    text: str
    embed_provider: str = "openai"


class DeleteRequest(BaseModel):
    document_id: str
    tenant_id: str
    embed_provider: str = "openai"


class DeleteNotionRequest(BaseModel):
    notion_resource_id: str
    tenant_id: str
    embed_provider: str = "openai"


@router.post("/text")
async def index_text(req: IndexTextRequest):
    """Chunk, embed, and upsert pre-extracted text into Qdrant (used by Notion sync)."""
    indexer = get_indexer()
    try:
        chunk_count = await indexer.process_text(
            tenant_id=req.tenant_id,
            profile_ids=req.profile_ids,
            source=req.source,
            source_id=req.source_id,
            notion_resource_id=req.notion_resource_id,
            resource_category=req.resource_category,
            title=req.title,
            text=req.text,
            embed_provider=req.embed_provider,
        )
        return {"status": "indexed", "source_id": req.source_id, "chunk_count": chunk_count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/delete-notion")
async def delete_notion_resource(req: DeleteNotionRequest):
    """Remove all Qdrant vectors for a Notion resource."""
    indexer = get_indexer()
    try:
        await indexer.delete_notion_vectors(req.notion_resource_id, req.tenant_id, req.embed_provider)
        return {"status": "deleted", "notion_resource_id": req.notion_resource_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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
            index_images=req.index_images,
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
