"""
Extract images and video URLs from documents during indexing.
Images are uploaded to MinIO and referenced by URL.
"""
import io
import os
import re
from typing import Any, Dict, List

import boto3
from botocore.config import Config

# ── Video URL patterns ────────────────────────────────────────────────────────

_VIDEO_PATTERNS = [
    r'https?://(?:www\.)?youtube\.com/watch\?v=[\w-]+',
    r'https?://youtu\.be/[\w-]+',
    r'https?://(?:www\.)?vimeo\.com/\d+',
    r'https?://(?:www\.)?loom\.com/share/[\w-]+',
    r'https?://(?:www\.)?drive\.google\.com/file/d/[\w-]+',
]
_VIDEO_RE = re.compile('|'.join(_VIDEO_PATTERNS), re.IGNORECASE)

# ── S3/MinIO helpers ──────────────────────────────────────────────────────────

def _s3():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("AWS_ENDPOINT_URL", "http://localhost:9000"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "staffbot"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "staffbot123"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


def _upload_image(img_bytes: bytes, ext: str, tenant_id: str, document_id: str, index: int) -> str:
    """Upload image to MinIO, return public URL."""
    bucket = os.getenv("AWS_S3_BUCKET", "staffbot-docs")
    key    = f"{tenant_id}/{document_id}/images/img_{index}.{ext}"
    _s3().put_object(Bucket=bucket, Key=key, Body=img_bytes, ContentType=f"image/{ext}")
    # MINIO_PUBLIC_URL points to the nginx proxy which already maps to the bucket root,
    # so the URL is {public_base}/{key} (no bucket name).
    # Without it, fall back to direct MinIO: {endpoint}/{bucket}/{key}.
    public_base = os.getenv("MINIO_PUBLIC_URL", "").rstrip("/")
    if public_base:
        return f"{public_base}/{key}"
    endpoint = os.getenv("AWS_ENDPOINT_URL", "http://localhost:9000")
    return f"{endpoint}/{bucket}/{key}"


# ── Per-format extractors ─────────────────────────────────────────────────────

def _extract_pdf(content: bytes, tenant_id: str, document_id: str) -> Dict[str, Any]:
    import fitz  # pymupdf

    doc        = fitz.open(stream=content, filetype="pdf")
    pages_text = []
    images: List[Dict[str, Any]] = []
    video_urls: List[str] = []

    for page_num, page in enumerate(doc):
        text = page.get_text()
        pages_text.append(text)
        video_urls.extend(_VIDEO_RE.findall(text))

        for img_info in page.get_images(full=True):
            try:
                xref       = img_info[0]
                base_image = doc.extract_image(xref)
                img_bytes  = base_image["image"]
                ext        = base_image.get("ext", "png")
                if len(img_bytes) < 5_000:        # skip tiny icons/bullets
                    continue
                idx = len(images)
                url = _upload_image(img_bytes, ext, tenant_id, document_id, idx)
                images.append({"url": url, "page": page_num + 1, "index": idx, "ext": ext})
            except Exception as e:
                print(f"[media] PDF image error page {page_num}: {e}", flush=True)

    doc.close()
    return {
        "text":       "\n\n".join(p for p in pages_text if p.strip()),
        "images":     images,
        "video_urls": list(set(video_urls)),
    }


def _extract_docx(content: bytes, tenant_id: str, document_id: str) -> Dict[str, Any]:
    import zipfile
    from docx import Document

    doc  = Document(io.BytesIO(content))
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    video_urls = list(set(_VIDEO_RE.findall(text)))

    images: List[Dict[str, Any]] = []
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        for name in z.namelist():
            if not name.startswith("word/media/"):
                continue
            ext = name.rsplit(".", 1)[-1].lower()
            if ext not in ("png", "jpg", "jpeg", "gif", "webp"):
                continue
            try:
                img_bytes = z.read(name)
                if len(img_bytes) < 5_000:
                    continue
                if ext == "jpeg":
                    ext = "jpg"
                idx = len(images)
                url = _upload_image(img_bytes, ext, tenant_id, document_id, idx)
                images.append({"url": url, "index": idx, "ext": ext})
            except Exception as e:
                print(f"[media] DOCX image error {name}: {e}", flush=True)

    return {"text": text, "images": images, "video_urls": video_urls}


# ── Public entry point ────────────────────────────────────────────────────────

def extract_media(content: bytes, file_type: str, tenant_id: str, document_id: str) -> Dict[str, Any]:
    """
    Extract text, images, and video URLs from a document.
    Returns { text, images: [{url, page?, index, ext}], video_urls: [str] }
    Images are uploaded to MinIO; image upload errors are logged but don't abort indexing.
    """
    if file_type == "pdf":
        return _extract_pdf(content, tenant_id, document_id)
    if file_type in ("docx", "doc"):
        return _extract_docx(content, tenant_id, document_id)
    # txt / xlsx / other — text-only with video URL detection
    if file_type == "txt":
        text = content.decode("utf-8", errors="ignore")
    else:
        text = ""
    return {"text": text, "images": [], "video_urls": list(set(_VIDEO_RE.findall(text)))}
