from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.config import settings
from app.database import get_db
from app.models import Attempt, Exam, Question, User
from app.parsers.exam_parser import extract_text, parse_exam_text
from app.schemas import ExamPayload, ExamUpdatePayload, QuestionPayload
from app.services.serializers import exam_dict
from app.storage import AUDIO_EXTENSIONS, DOCUMENT_EXTENSIONS, save_upload


router = APIRouter(prefix="/api/admin", tags=["admin"])


def normalize_options(options: list[Any]) -> list[dict[str, str]]:
    normalized = []
    for index, item in enumerate(options):
        label = chr(65 + index)
        if isinstance(item, dict):
            label = str(item.get("label") or label)
            normalized.append(
                {"id": str(item.get("id") or label), "label": label, "text": str(item.get("text", ""))}
            )
        else:
            normalized.append({"id": label, "label": label, "text": str(item)})
    return normalized


def add_questions(exam: Exam, payloads: list[QuestionPayload]) -> None:
    for index, payload in enumerate(payloads, start=1):
        exam.questions.append(
            Question(
                content=payload.content,
                type=payload.type,
                options=normalize_options(payload.options),
                correct_answer=payload.correctAnswer,
                explanation=payload.explanation,
                points=payload.points,
                topic=payload.topic,
                order=payload.order if payload.order is not None else index,
                audio_url=payload.audioUrl,
                image_url=payload.imageUrl,
            )
        )


def build_exam(payload: ExamPayload) -> Exam:
    exam = Exam(
        title=payload.title.strip(),
        description=payload.description,
        subject=payload.subject.strip(),
        grade=payload.grade,
        duration_minutes=payload.durationMinutes,
        status=payload.status,
        difficulty=payload.difficulty,
    )
    add_questions(exam, payload.questions)
    return exam


@router.get("/exams")
def admin_exams(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    exams = db.scalars(select(Exam).order_by(Exam.created_at.desc())).unique().all()
    return [exam_dict(exam, include_questions=True, include_answers=True) for exam in exams]


@router.post("/exams", status_code=201)
def create_exam(
    payload: ExamPayload, db: Session = Depends(get_db), _admin: User = Depends(require_admin)
):
    exam = build_exam(payload)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam_dict(exam, include_questions=True, include_answers=True)


@router.put("/exams/{exam_id}")
def update_exam(
    exam_id: int,
    payload: ExamUpdatePayload,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    fields = {
        "title": "title",
        "description": "description",
        "subject": "subject",
        "grade": "grade",
        "durationMinutes": "duration_minutes",
        "status": "status",
        "difficulty": "difficulty",
    }
    for input_name, model_name in fields.items():
        if input_name in payload.model_fields_set:
            setattr(exam, model_name, getattr(payload, input_name))
    if payload.questions is not None:
        has_attempts = db.scalar(select(func.count(Attempt.id)).where(Attempt.exam_id == exam.id)) or 0
        if has_attempts:
            raise HTTPException(status_code=409, detail="Questions cannot be replaced after attempts exist")
        exam.questions.clear()
        db.flush()
        add_questions(exam, payload.questions)
    db.commit()
    db.refresh(exam)
    return exam_dict(exam, include_questions=True, include_answers=True)


@router.post("/exams/{exam_id}/publish")
def publish_exam(
    exam_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)
):
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if not exam.questions:
        raise HTTPException(status_code=400, detail="Add at least one question before publishing")
    exam.status = "published"
    db.commit()
    return exam_dict(exam, include_questions=True, include_answers=True)


@router.delete("/exams/{exam_id}")
def archive_exam(
    exam_id: int, db: Session = Depends(get_db), _admin: User = Depends(require_admin)
):
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam.status = "archived"
    db.commit()
    return exam_dict(exam, include_questions=True, include_answers=True)


async def load_documents(
    examFile: UploadFile, answerFile: UploadFile | None
) -> tuple[str, list[dict[str, Any]], list[str]]:
    """Lưu tạm file tải lên, đọc nội dung, nhận diện câu hỏi + đáp án rồi xóa file tạm."""
    saved: list[Path] = []
    try:
        try:
            exam_path, _ = await save_upload(examFile, DOCUMENT_EXTENSIONS, settings.max_upload_bytes)
            saved.append(exam_path)
            answer_path = None
            if answerFile is not None and answerFile.filename:
                answer_path, _ = await save_upload(answerFile, DOCUMENT_EXTENSIONS, settings.max_upload_bytes)
                saved.append(answer_path)
        except OverflowError as exc:
            raise HTTPException(status_code=413, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        try:
            raw_text, warnings = extract_text(exam_path)
            answer_text = ""
            if answer_path is not None:
                answer_text, answer_warnings = extract_text(answer_path)
                warnings.extend(answer_warnings)
            questions, parse_warnings = parse_exam_text(raw_text, answer_text)
            warnings.extend(parse_warnings)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not parse document: {exc}")
        return raw_text, questions, warnings
    finally:
        for path in saved:
            path.unlink(missing_ok=True)


def has_answer(question: dict[str, Any]) -> bool:
    return question.get("correctAnswer") not in (None, "", [])


@router.post("/parse-exam")
async def parse_exam(
    examFile: UploadFile = File(...),
    answerFile: UploadFile | None = File(None),
    _admin: User = Depends(require_admin),
):
    raw_text, questions, warnings = await load_documents(examFile, answerFile)
    title = Path(examFile.filename or "Imported exam").stem
    return {
        "title": title,
        "rawText": raw_text,
        "questions": questions,
        "warnings": warnings,
        "missingAnswers": sum(1 for question in questions if not has_answer(question)),
    }


@router.post("/import-exam", status_code=201)
async def import_exam(
    examFile: UploadFile = File(...),
    answerFile: UploadFile | None = File(None),
    title: str = Form(""),
    description: str = Form(""),
    subject: str = Form("Tổng hợp"),
    grade: str = Form(""),
    durationMinutes: int = Form(30),
    difficulty: str = Form("medium"),
    totalScore: float = Form(0),
    publish: bool = Form(False),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Một bước: file đề (+ file đáp án) -> câu hỏi -> đề thi (nháp hoặc đã xuất bản)."""
    if difficulty not in {"easy", "medium", "hard"}:
        raise HTTPException(status_code=400, detail="Độ khó không hợp lệ")
    if not 1 <= durationMinutes <= 1440:
        raise HTTPException(status_code=400, detail="Thời gian làm bài phải từ 1 đến 1440 phút")
    if not 0 <= totalScore <= 1000:
        raise HTTPException(status_code=400, detail="Tổng điểm không hợp lệ")
    _raw, questions, warnings = await load_documents(examFile, answerFile)
    if not questions:
        raise HTTPException(status_code=422, detail=" ".join(warnings) or "Không nhận diện được câu hỏi nào")

    if totalScore > 0:  # chia đều tổng điểm, câu cuối nhận phần dư để cộng đúng bằng totalScore
        per_question = round(totalScore / len(questions), 2)
        for question in questions:
            question["points"] = per_question
        questions[-1]["points"] = round(totalScore - per_question * (len(questions) - 1), 2)

    missing = sum(1 for question in questions if not has_answer(question))
    code_mismatch = any(warning.startswith("Mã đề không khớp") for warning in warnings)
    status = "draft"
    if publish and missing == 0 and not code_mismatch:
        status = "published"
    elif publish and code_mismatch:
        warnings.append("Đề được lưu ở dạng nháp vì file đáp án có vẻ không thuộc đề này (lệch mã đề).")
    elif publish:
        warnings.append(f"Đề được lưu ở dạng nháp vì còn {missing} câu chưa có đáp án.")
    try:
        payload = ExamPayload(
            title=(title.strip() or Path(examFile.filename or "Đề thi").stem)[:255],
            description=description,
            subject=subject.strip() or "Tổng hợp",
            grade=grade,
            durationMinutes=durationMinutes,
            status=status,
            difficulty=difficulty,
            questions=[QuestionPayload(**question) for question in questions],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Dữ liệu đề thi không hợp lệ: {exc}")
    exam = build_exam(payload)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return {
        "exam": exam_dict(exam, include_questions=True, include_answers=True),
        "warnings": warnings,
        "missingAnswers": missing,
        "published": status == "published",
    }


@router.post("/exams/{exam_id}/audio")
async def upload_audio(
    exam_id: int,
    audioFile: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    try:
        path, _ = await save_upload(audioFile, AUDIO_EXTENSIONS, settings.max_audio_bytes)
    except OverflowError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    exam.audio_url = f"/api/media/{path.name}"
    db.commit()
    return exam_dict(exam, include_questions=True, include_answers=True)
