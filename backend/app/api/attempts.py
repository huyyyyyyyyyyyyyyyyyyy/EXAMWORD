from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import utc_now
from app.database import get_db
from app.models import Answer, Attempt, Exam, Question, User
from app.schemas import AnswersSaveRequest, AttemptStartRequest
from app.services.attempts import submit_attempt, submit_if_expired
from app.services.serializers import (
    attempt_dict,
    attempt_summary,
    result_dict,
)


router = APIRouter(prefix="/api", tags=["attempts"])


def get_owned_attempt(db: Session, attempt_id: int, user: User) -> Attempt:
    attempt = db.get(Attempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if user.role != "admin" and attempt.user_id != user.id:
        raise HTTPException(status_code=403, detail="You cannot access this attempt")
    return attempt


@router.post("/attempts/start", status_code=201)
def start_attempt(
    payload: AttemptStartRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exam = db.get(Exam, payload.examId)
    if exam is None or (user.role != "admin" and exam.status != "published"):
        raise HTTPException(status_code=404, detail="Exam not found")
    if not exam.questions:
        raise HTTPException(status_code=400, detail="Exam has no questions")
    existing = db.scalar(
        select(Attempt)
        .where(
            Attempt.user_id == user.id,
            Attempt.exam_id == exam.id,
            Attempt.status == "inProgress",
        )
        .order_by(Attempt.started_at.desc())
    )
    if existing:
        submit_if_expired(db, existing)
        return attempt_dict(existing, reveal_answers=existing.status != "inProgress")
    now = utc_now()
    attempt = Attempt(
        user_id=user.id,
        exam_id=exam.id,
        started_at=now,
        expires_at=now + timedelta(minutes=exam.duration_minutes),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt_dict(attempt)


@router.get("/attempts/history")
def attempt_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    active = db.scalars(
        select(Attempt).where(Attempt.user_id == user.id, Attempt.status == "inProgress")
    ).unique().all()
    for attempt in active:
        submit_if_expired(db, attempt)
    attempts = db.scalars(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.submitted_at.is_not(None))
        .order_by(Attempt.submitted_at.desc())
    ).unique().all()
    return [attempt_summary(attempt) for attempt in attempts]


@router.get("/attempts/{attempt_id}")
def get_attempt(
    attempt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    attempt = get_owned_attempt(db, attempt_id, user)
    submit_if_expired(db, attempt)
    return attempt_dict(attempt, reveal_answers=attempt.status != "inProgress")


@router.put("/attempts/{attempt_id}/answers")
def autosave_attempt(
    attempt_id: int,
    payload: AnswersSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    attempt = get_owned_attempt(db, attempt_id, user)
    submit_if_expired(db, attempt)
    if attempt.status != "inProgress":
        raise HTTPException(status_code=409, detail="Attempt has already been submitted")
    question_ids = {question.id for question in attempt.exam.questions}
    answers_by_question = {answer.question_id: answer for answer in attempt.answers}
    for raw_question_id, answer_input in payload.answers.items():
        try:
            question_id = int(raw_question_id)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid question id: {raw_question_id}")
        if question_id not in question_ids:
            raise HTTPException(status_code=400, detail=f"Question {question_id} is not in this exam")
        answer = answers_by_question.get(question_id)
        if answer is None:
            answer = Answer(
                attempt=attempt,
                question_id=question_id,
                value=answer_input.value,
                flagged=answer_input.flagged,
            )
            db.add(answer)
            answers_by_question[question_id] = answer
        else:
            answer.value = answer_input.value
            answer.flagged = answer_input.flagged
    db.commit()
    return attempt_dict(attempt)


@router.post("/attempts/{attempt_id}/submit")
def submit(
    attempt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    attempt = get_owned_attempt(db, attempt_id, user)
    submit_attempt(db, attempt)
    return result_dict(attempt)


@router.get("/results/{attempt_id}")
def get_result(
    attempt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    attempt = get_owned_attempt(db, attempt_id, user)
    submit_if_expired(db, attempt)
    if attempt.status == "inProgress":
        raise HTTPException(status_code=409, detail="Attempt has not been submitted")
    return result_dict(attempt)
