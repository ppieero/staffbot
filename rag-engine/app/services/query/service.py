from functools import lru_cache
from app.services.query_service import RAGQueryService


@lru_cache()
def get_query_service() -> RAGQueryService:
    return RAGQueryService()
