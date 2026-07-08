import logging
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.db import DocumentSet
from app.models.schemas import DocumentSetResponse
from app.services import vector_store as vs
from app.services.ingestion import _PIPELINES, index_document_set, parse_document

logger = logging.getLogger(__name__)

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
                    info = zf.getinfo(name)
                    if info.file_size > settings.max_upload_size_mb * 1024 * 1024:
                        logger.warning(
                            "Skipping %s — uncompressed size %d bytes exceeds limit",
                            name,
                            info.file_size,
                        )
                        continue
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
            except Exception as e:
                logger.warning("Skipping %s in ZIP — parse failed: %s", fname, e)

        if not texts:
            raise HTTPException(400, "ZIP contained no parseable text")

        text = "\n\n---\n\n".join(texts)
        doc_set = DocumentSet(name=file.filename or "upload.zip", file_count=len(texts))
    else:
        try:
            text = parse_document(content, file.filename or "upload")
        except Exception as e:
            raise HTTPException(422, f"Could not parse file: {e}") from e
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


@router.delete("/{doc_set_id}", status_code=204)
async def delete_document(doc_set_id: str, db: AsyncSession = Depends(get_db)):
    ds = await db.get(DocumentSet, doc_set_id)
    if not ds:
        raise HTTPException(404, "Document set not found")

    for pipeline in _PIPELINES:
        await vs.delete_collection(f"{doc_set_id}_{pipeline.pipeline_id}")

    await db.delete(ds)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Document set has experiments and cannot be deleted")
