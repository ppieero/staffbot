import time
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
import anthropic

from app.config import get_settings
from app.services.embedder import embed, EmbedProvider

TOP_K       = 5
MAX_HISTORY = 6

def _collection_name(provider: EmbedProvider) -> str:
    return f"staffbot_{provider}"


class RAGQueryService:
    def __init__(self):
        settings = get_settings()
        self.qdrant    = QdrantClient(url=settings.QDRANT_URL)
        self.anthropic = (
            anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            if settings.ANTHROPIC_API_KEY
            else None
        )

    async def query(
        self,
        tenant_id: str,
        profile_id: str,
        question: str,
        conversation_history: Optional[list] = None,
        system_prompt: Optional[str] = None,
        embed_provider: EmbedProvider = "openai",
    ) -> dict:
        if not self.anthropic:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")

        start = time.time()
        col   = _collection_name(embed_provider)

        # 1. Embed the question with the chosen provider
        q_vector = embed([question], embed_provider)[0]

        # 2. Search Qdrant (collection is provider-specific)
        try:
            results = self.qdrant.search(
                collection_name=col,
                query_vector=q_vector,
                query_filter=Filter(
                    must=[
                        FieldCondition(key="tenant_id",  match=MatchValue(value=tenant_id)),
                        FieldCondition(key="profile_id", match=MatchValue(value=profile_id)),
                    ]
                ),
                limit=TOP_K,
                with_payload=True,
            )
        except Exception:
            # Collection may not exist yet if no documents have been indexed
            results = []

        # 3. Build context block
        context_parts = [
            f"[Source {i + 1} — doc:{r.payload['document_id']} chunk:{r.payload['chunk_index']}]\n{r.payload['text']}"
            for i, r in enumerate(results)
        ]
        context = "\n\n---\n\n".join(context_parts) if context_parts else "(No relevant documents found)"

        # 4. Build message list (last N turns + current question)
        history  = (conversation_history or [])[-MAX_HISTORY:]
        messages = list(history)
        messages.append({
            "role":    "user",
            "content": (
                f"## Relevant context from company documents:\n\n{context}"
                f"\n\n---\n\n## Question:\n{question}"
            ),
        })

        # 5. Call Claude
        sys_prompt = (
            system_prompt
            or "You are a knowledgeable assistant. Answer the question using ONLY the provided context. "
               "If the context doesn't contain enough information, say so clearly. Be concise and accurate."
        )

        completion = self.anthropic.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=sys_prompt,
            messages=messages,
        )

        answer         = completion.content[0].text
        tokens_input   = completion.usage.input_tokens
        tokens_output  = completion.usage.output_tokens
        tokens_used    = tokens_input + tokens_output
        latency_ms     = int((time.time() - start) * 1000)

        # 6. Build sources list + collect de-duplicated media
        sources:    list = []
        seen_imgs:  set  = set()
        all_images: list = []
        all_videos: set  = set()

        for r in results:
            for img in r.payload.get("images", []):
                if img.get("url") not in seen_imgs:
                    seen_imgs.add(img["url"])
                    all_images.append(img)
            all_videos.update(r.payload.get("video_urls", []))

            sources.append({
                "document_id":    r.payload["document_id"],
                "chunk_index":    r.payload["chunk_index"],
                "embed_provider": embed_provider,
                "score":          round(r.score, 4),
                "excerpt":        r.payload["text_preview"],
            })

        return {
            "answer":         answer,
            "sources":        sources,
            "tokens_used":    tokens_used,
            "tokens_input":   tokens_input,
            "tokens_output":  tokens_output,
            "latency_ms":     latency_ms,
            "embed_provider": embed_provider,
            "images":         all_images,
            "video_urls":     list(all_videos),
        }
