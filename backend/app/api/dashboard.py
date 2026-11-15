from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.security import as_utc, utc_now
from app.database import get_db
from app.models import Attempt, Exam, User
from app.services.attempts import submit_if_expired
from app.services.serializers import (
    LEVEL_XP,
    attempt_summary,
    exam_dict,
    level_for_xp,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/student")
def student_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    attempts = db.scalars(
        select(Attempt).where(Attempt.user_id == user.id).order_by(Attempt.started_at)
    ).unique().all()
    for attempt in attempts:
        submit_if_expired(db, attempt)
    completed = [attempt for attempt in attempts if attempt.submitted_at is not None]
    recent = sorted(completed, key=lambda item: as_utc(item.submitted_at), reverse=True)
    scores = [attempt.percentage for attempt in completed]
    now = utc_now()
    weekly = []
    for offset in range(6, -1, -1):
        date = (now - timedelta(days=offset)).date()
        count = sum(1 for attempt in completed if as_utc(attempt.submitted_at).date() == date)
        weekly.append({"day": date.isoformat(), "label": date.strftime("%a"), "count": count})
    completed_exam_ids = {attempt.exam_id for attempt in completed}
    recommended = db.scalars(
        select(Exam)
        .where(Exam.status == "published", Exam.id.not_in(completed_exam_ids))
        .order_by(Exam.created_at.desc())
        .limit(4)
    ).unique().all()
    subject_scores: dict[str, list[float]] = defaultdict(list)
    for attempt in completed:
        subject_scores[attempt.exam.subject].append(attempt.percentage)
    return {
        "stats": {
            "completedExams": len(completed),
            "averageScore": round(sum(scores) / len(scores), 1) if scores else 0,
            "highestScore": max(scores) if scores else 0,
            "totalXp": user.xp,
            "level": level_for_xp(user.xp),
            "streak": user.streak,
        },
        "recentAttempts": [attempt_summary(attempt) for attempt in recent[:6]],
        "weeklyActivity": weekly,
        "recommendedExams": [exam_dict(exam) for exam in recommended],
        "skillProgress": [
            {"subject": subject, "percentage": round(sum(values) / len(values), 1)}
            for subject, values in sorted(subject_scores.items())
        ],
    }


@router.get("/admin")
def admin_dashboard(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    total_students = db.scalar(select(func.count(User.id)).where(User.role == "student")) or 0
    total_exams = db.scalar(select(func.count(Exam.id))) or 0
    total_attempts = db.scalar(select(func.count(Attempt.id))) or 0
    pending_review = db.scalar(
        select(func.count(Attempt.id)).where(Attempt.status == "needsReview")
    ) or 0
    recent = db.scalars(
        select(Attempt)
        .where(Attempt.submitted_at.is_not(None))
        .order_by(Attempt.submitted_at.desc())
        .limit(8)
    ).unique().all()
    distribution = db.execute(
        select(Exam.subject, func.count(Exam.id)).group_by(Exam.subject).order_by(Exam.subject)
    ).all()
    return {
        "stats": {
            "totalStudents": total_students,
            "totalExams": total_exams,
            "totalAttempts": total_attempts,
            "pendingReview": pending_review,
        },
        "recentAttempts": [attempt_summary(attempt, include_user=True) for attempt in recent],
        "subjectDistribution": [
            {"subject": subject, "count": count} for subject, count in distribution
        ],
    }
