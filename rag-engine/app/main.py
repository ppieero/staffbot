from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="StaffBot RAG Engine", version="0.1.0")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "staffbot-rag-engine"}
