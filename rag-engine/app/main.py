from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from app.routers.indexing.router import router as indexing_router
from app.routers.query.router import router as query_router

app = FastAPI(title="StaffBot RAG Engine", version="0.1.0")

app.include_router(indexing_router)
app.include_router(query_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "staffbot-rag-engine"}
