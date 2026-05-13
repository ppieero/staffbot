from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form
from app.routers.indexing.router import router as indexing_router
from app.routers.query.router import router as query_router

app = FastAPI(title="StaffBot RAG Engine", version="0.1.0")

app.include_router(indexing_router)
app.include_router(query_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "staffbot-rag-engine"}


@app.post("/extract-text")
async def extract_text(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    document_id: str = Form(...),
):
    """Extract text from PDF/DOCX without indexing — for manual generation."""
    content   = await file.read()
    file_type = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "pdf"

    try:
        from app.services.media_extractor import extract_media
        result = extract_media(content, file_type, tenant_id, document_id)
        return {"text": result["text"], "images": result["images"], "video_urls": result["video_urls"]}
    except Exception as e:
        return {"text": "", "error": str(e)}


@app.post("/extract-pages")
async def extract_pages(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    document_id: str = Form(...),
):
    """Extract one entry per page/slide from PDF/PPTX — for faithful manual mode."""
    from fastapi import HTTPException
    content   = await file.read()
    fname     = file.filename or ""
    file_type = fname.rsplit(".", 1)[-1].lower() if "." in fname else "pdf"
    # normalise ppt → pptx so extract_slides_faithful handles it
    if file_type == "ppt":
        file_type = "pptx"

    try:
        from app.services.media_extractor import extract_slides_faithful
        slides = extract_slides_faithful(content, file_type, tenant_id, document_id)
        return {"slides": slides}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
