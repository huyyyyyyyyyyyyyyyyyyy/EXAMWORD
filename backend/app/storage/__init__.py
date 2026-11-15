"""Private upload storage helpers."""

import secrets
from pathlib import Path

from fastapi import UploadFile

from app.config import settings


DOCUMENT_EXTENSIONS = {".docx", ".pdf", ".txt", ".xlsx", ".png", ".jpg", ".jpeg"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac"}


async def save_upload(file: UploadFile, allowed_extensions: set[str], max_bytes: int) -> tuple[Path, bytes]:
    original = Path(file.filename or "")
    suffix = original.suffix.lower()
    if suffix not in allowed_extensions:
        raise ValueError(f"Unsupported file extension. Allowed: {', '.join(sorted(allowed_extensions))}")
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise OverflowError(f"File exceeds the {max_bytes // (1024 * 1024)} MB limit")
    if not content:
        raise ValueError("Uploaded file is empty")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    destination = settings.upload_dir / f"{secrets.token_hex(16)}{suffix}"
    destination.write_bytes(content)
    return destination, content
