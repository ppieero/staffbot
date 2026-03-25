from functools import lru_cache
from app.services.indexing_service import DocumentIndexer


@lru_cache()
def get_indexer() -> DocumentIndexer:
    return DocumentIndexer()
