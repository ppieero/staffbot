"""
Dual embedding backend.
  provider="openai"  → text-embedding-3-small  (1536-dim)
  provider="local"   → paraphrase-multilingual-mpnet-base-v2 (768-dim)
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from openai import OpenAI
from sentence_transformers import SentenceTransformer

from app.config import get_settings

OPENAI_MODEL = "text-embedding-3-small"
OPENAI_DIM   = 1536
LOCAL_MODEL  = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
LOCAL_DIM    = 768

EmbedProvider = Literal["openai", "local"]


@lru_cache(maxsize=1)
def _local_model() -> SentenceTransformer:
    print("[embedder] loading local model…", flush=True)
    m = SentenceTransformer(LOCAL_MODEL)
    print("[embedder] local model ready", flush=True)
    return m


@lru_cache(maxsize=1)
def _openai_client() -> OpenAI:
    return OpenAI(api_key=get_settings().OPENAI_API_KEY)


def embed(texts: list[str], provider: EmbedProvider = "openai") -> list[list[float]]:
    if provider == "openai":
        client = _openai_client()
        resp   = client.embeddings.create(model=OPENAI_MODEL, input=texts)
        return [r.embedding for r in resp.data]
    else:
        model = _local_model()
        return model.encode(texts, show_progress_bar=False).tolist()


def vector_dim(provider: EmbedProvider = "openai") -> int:
    return OPENAI_DIM if provider == "openai" else LOCAL_DIM
