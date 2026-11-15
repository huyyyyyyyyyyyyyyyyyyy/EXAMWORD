from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import iso_utc
from app.database import get_db
from app.models import Achievement, User, UserAchievement
from app.services.serializers import LEVEL_XP, level_for_xp


router = APIRouter(prefix="/api", tags=["achievements"])


@router.get("/achievements")
def achievements(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    definitions = db.scalars(select(Achievement).order_by(Achievement.xp_threshold)).all()
    unlocked = db.scalars(
        select(UserAchievement).where(UserAchievement.user_id == user.id)
    ).all()
    unlocked_by_id = {item.achievement_id: item for item in unlocked}
    level = level_for_xp(user.xp)
    return {
        "xp": user.xp,
        "level": level,
        "nextLevelXp": level * LEVEL_XP,
        "streak": user.streak,
        "items": [
            {
                "id": achievement.id,
                "title": achievement.title,
                "description": achievement.description,
                "icon": achievement.icon,
                "unlocked": achievement.id in unlocked_by_id,
                "unlockedAt": iso_utc(unlocked_by_id[achievement.id].unlocked_at)
                if achievement.id in unlocked_by_id
                else None,
                "progress": min(100, round(user.xp / achievement.xp_threshold * 100))
                if achievement.xp_threshold > 0
                else 100,
            }
            for achievement in definitions
        ],
    }
