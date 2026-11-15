from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import as_utc, utc_now
from app.grading import clean_score, grade_value
from app.models import Achievement, Answer, Attempt, UserAchievement


def award_progress(db: Session, attempt: Attempt, submitted_at: datetime) -> None:
    user = attempt.user
    previous = db.scalar(
        select(Attempt)
        .where(
            Attempt.user_id == user.id,
            Attempt.id != attempt.id,
            Attempt.submitted_at.is_not(None),
        )
        .order_by(Attempt.submitted_at.desc())
    )
    if previous is None or previous.submitted_at is None:
        user.streak = 1
    else:
        days = (submitted_at.date() - as_utc(previous.submitted_at).date()).days
        if days == 1:
            user.streak = max(user.streak, 0) + 1
        elif days > 1:
            user.streak = 1
        elif user.streak < 1:
            user.streak = 1
    user.xp += max(1, int(round(attempt.percentage)))


def unlock_achievements(db: Session, attempt: Attempt, unlocked_at: datetime) -> None:
    unlocked_ids = set(
        db.scalars(
            select(UserAchievement.achievement_id).where(UserAchievement.user_id == attempt.user_id)
        ).all()
    )
    achievements = db.scalars(select(Achievement)).all()
    for achievement in achievements:
        if achievement.id not in unlocked_ids and attempt.user.xp >= achievement.xp_threshold:
            db.add(
                UserAchievement(
                    user_id=attempt.user_id,
                    achievement_id=achievement.id,
                    unlocked_at=unlocked_at,
                )
            )


def submit_attempt(
    db: Session, attempt: Attempt, submitted_at: datetime | None = None, award_xp: bool = True
) -> Attempt:
    if attempt.status != "inProgress":
        return attempt
    submitted_at = as_utc(submitted_at or utc_now())
    answers_by_question = {answer.question_id: answer for answer in attempt.answers}
    score = 0.0
    max_score = 0.0
    needs_review = False
    for question in attempt.exam.questions:
        answer = answers_by_question.get(question.id)
        if answer is None:
            answer = Answer(attempt=attempt, question=question, value=None, flagged=False)
            db.add(answer)
        answer.is_correct = grade_value(question.type, answer.value, question.correct_answer)
        if answer.is_correct is None:
            needs_review = True
            answer.points_awarded = 0
        else:
            answer.points_awarded = question.points if answer.is_correct else 0
            score += answer.points_awarded
        max_score += question.points
    attempt.score = clean_score(score)
    attempt.max_score = clean_score(max_score)
    attempt.percentage = round((score / max_score * 100) if max_score else 0, 1)
    attempt.status = "needsReview" if needs_review else "submitted"
    attempt.submitted_at = submitted_at
    if award_xp:
        award_progress(db, attempt, submitted_at)
        unlock_achievements(db, attempt, submitted_at)
    db.commit()
    db.refresh(attempt)
    return attempt


def submit_if_expired(db: Session, attempt: Attempt) -> Attempt:
    if attempt.status == "inProgress" and utc_now() >= as_utc(attempt.expires_at):
        return submit_attempt(db, attempt)
    return attempt
