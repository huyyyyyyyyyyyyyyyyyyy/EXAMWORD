from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import get_current_user
from app.config import settings
from app.models import User


router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/{filename}")
def get_media(filename: str, _user: User = Depends(get_current_user)):
    if Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    root = settings.upload_dir.resolve()
    path = (root / filename).resolve()
    if path.parent != root or not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path)
