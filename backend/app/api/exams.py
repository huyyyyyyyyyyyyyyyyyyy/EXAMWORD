from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Exam, User
from app.services.serializers import exam_dict


router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.get("")
def list_exams(
    search: str = Query(default="", max_length=200),
    subject: str = Query(default="", max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Exam)
    if user.role != "admin":
        query = query.where(Exam.status == "published")
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Exam.title.ilike(pattern), Exam.description.ilike(pattern)))
    if subject.strip():
        query = query.where(func.lower(Exam.subject) == subject.strip().lower())
    exams = db.scalars(query.order_by(Exam.created_at.desc())).unique().all()
    return [exam_dict(exam) for exam in exams]


@router.get("/subjects")
def list_subjects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(Exam.subject).distinct()
    if user.role != "admin":
        query = query.where(Exam.status == "published")
    return sorted(value for value in db.scalars(query).all() if value)


@router.get("/{exam_id}")
def get_exam(
    exam_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    exam = db.get(Exam, exam_id)
    if exam is None or (user.role != "admin" and exam.status != "published"):
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam_dict(exam, include_questions=True, include_answers=user.role == "admin")
