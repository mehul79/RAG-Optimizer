import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.db import DocumentSet
from app.models.schemas import DocumentSetResponse
from app.services.ingestion import index_document_set, parse_document

router = APIRouter(prefix="/documents", tags=["documents"])

_ALLOWED = {".pdf", ".txt", ".md", ".docx"}


def _extract_zip(content: bytes) -> list[tuple[str, bytes]]:
    """Return (filename, file_bytes) for each parseable file inside the zip."""
    try:
        with zipfile.ZipFile(BytesIO(content)) as zf:
            results = []
            for name in zf.namelist():
                # skip directories and mac/hidden metadata
                if name.endswith("/") or "__MACOSX" in name or Path(name).name.startswith("."):
                    continue
                if Path(name).suffix.lower() in _ALLOWED:
                    results.append((Path(name).name, zf.read(name)))
            return results
    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid or corrupt ZIP file")


@router.post("/upload", response_model=DocumentSetResponse, status_code=202)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in _ALLOWED and suffix != ".zip":
        raise HTTPException(400, f"Unsupported file type. Allowed: {sorted(_ALLOWED | {'.zip'})}")

    content = await file.read()
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.max_upload_size_mb} MB limit")

    if suffix == ".zip":
        entries = _extract_zip(content)
        if not entries:
            raise HTTPException(400, "ZIP contains no supported files (.pdf, .txt, .md, .docx)")

        texts: list[str] = []
        for fname, fbytes in entries:
            try:
                texts.append(parse_document(fbytes, fname))
            except Exception:
                pass  # skip files that fail to parse

        if not texts:
            raise HTTPException(400, "ZIP contained no parseable text")

        text = "\n\n---\n\n".join(texts)
        doc_set = DocumentSet(name=file.filename or "upload.zip", file_count=len(texts))
    else:
        text = parse_document(content, file.filename or "upload")
        doc_set = DocumentSet(name=file.filename or "upload", file_count=1)

    db.add(doc_set)
    await db.commit()
    await db.refresh(doc_set)

    background_tasks.add_task(index_document_set, doc_set.id, text)
    return doc_set


@router.get("", response_model=list[DocumentSetResponse])
async def list_documents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentSet).order_by(DocumentSet.created_at.desc()))
    return result.scalars().all()


@router.get("/{doc_set_id}", response_model=DocumentSetResponse)
async def get_document(doc_set_id: str, db: AsyncSession = Depends(get_db)):
    ds = await db.get(DocumentSet, doc_set_id)
    if not ds:
        raise HTTPException(404, "Document set not found")
    return ds
