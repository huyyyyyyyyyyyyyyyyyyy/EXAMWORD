from typing import Any

from app.core.security import iso_utc
from app.models import Answer, Attempt, Exam, Question, User


LEVEL_XP = 500


def level_for_xp(xp: int) -> int:
    return xp // LEVEL_XP + 1


def user_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "xp": user.xp,
        "level": level_for_xp(user.xp),
        "streak": user.streak,
        "createdAt": iso_utc(user.created_at),
    }


def question_dict(question: Question, include_answers: bool = False) -> dict[str, Any]:
    options = []
    for index, option in enumerate(question.options or []):
        if isinstance(option, dict):
            label = str(option.get("label", chr(65 + index)))
            options.append(
                {
                    "id": str(option.get("id") or label),
                    "label": label,
                    "text": str(option.get("text", "")),
                }
            )
        else:
            label = chr(65 + index)
            options.append({"id": label, "label": label, "text": str(option)})
    result = {
        "id": question.id,
        "content": question.content,
        "type": question.type,
        "options": options,
        "points": question.points,
        "topic": question.topic,
        "order": question.order,
        "audioUrl": question.audio_url,
        "imageUrl": question.image_url,
    }
    if include_answers:
        result["correctAnswer"] = question.correct_answer
        result["explanation"] = question.explanation
    return result


def exam_dict(
    exam: Exam, include_questions: bool = False, include_answers: bool = False
) -> dict[str, Any]:
    result = {
        "id": exam.id,
        "title": exam.title,
        "description": exam.description,
        "subject": exam.subject,
        "grade": exam.grade,
        "durationMinutes": exam.duration_minutes,
        "status": exam.status,
        "difficulty": exam.difficulty,
        "questionCount": len(exam.questions),
        "totalPoints": sum(question.points for question in exam.questions),
        "audioUrl": exam.audio_url,
        "createdAt": iso_utc(exam.created_at),
        "updatedAt": iso_utc(exam.updated_at),
    }
    if include_questions:
        result["questions"] = [
            question_dict(question, include_answers=include_answers) for question in exam.questions
        ]
    return result


def answer_map(attempt: Attempt) -> dict[str, Any]:
    return {
        str(answer.question_id): {"value": answer.value, "flagged": answer.flagged}
        for answer in attempt.answers
    }


def attempt_dict(attempt: Attempt, reveal_answers: bool = False) -> dict[str, Any]:
    return {
        "id": attempt.id,
        "examId": attempt.exam_id,
        "status": attempt.status,
        "startedAt": iso_utc(attempt.started_at),
        "expiresAt": iso_utc(attempt.expires_at),
        "submittedAt": iso_utc(attempt.submitted_at),
        "score": attempt.score,
        "maxScore": attempt.max_score,
        "percentage": attempt.percentage,
        "answers": answer_map(attempt),
        "exam": exam_dict(
            attempt.exam, include_questions=True, include_answers=reveal_answers
        ),
    }


def attempt_summary(attempt: Attempt, include_user: bool = False) -> dict[str, Any]:
    result = {
        "id": attempt.id,
        "examId": attempt.exam_id,
        "examTitle": attempt.exam.title,
        "subject": attempt.exam.subject,
        "score": attempt.score,
        "maxScore": attempt.max_score,
        "percentage": attempt.percentage,
        "submittedAt": iso_utc(attempt.submitted_at),
        "status": attempt.status,
    }
    if include_user:
        result["userName"] = attempt.user.name
    return result


def result_dict(attempt: Attempt) -> dict[str, Any]:
    answers_by_question: dict[int, Answer] = {
        answer.question_id: answer for answer in attempt.answers
    }
    answers = []
    for question in attempt.exam.questions:
        answer = answers_by_question.get(question.id)
        answers.append(
            {
                "questionId": question.id,
                "value": answer.value if answer else None,
                "correctAnswer": question.correct_answer,
                "explanation": question.explanation,
                "isCorrect": answer.is_correct if answer else False,
                "pointsAwarded": answer.points_awarded if answer else 0,
                "question": question_dict(question, include_answers=False),
            }
        )
    return {
        "attempt": attempt_dict(attempt, reveal_answers=True),
        "exam": exam_dict(attempt.exam, include_questions=True, include_answers=True),
        "answers": answers,
        "score": attempt.score,
        "maxScore": attempt.max_score,
        "percentage": attempt.percentage,
        "needsReview": attempt.status == "needsReview",
    }
