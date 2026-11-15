from datetime import timedelta

from app.core.security import utc_now
from app.database import SessionLocal
from app.models import Attempt
from app.tests.conftest import auth_headers, login


def test_dev_login_me_and_seed_dashboard(client):
    data = login(client)
    assert data["user"]["email"] == "student@examworld.dev"
    assert data["user"]["role"] == "student"
    headers = auth_headers(data["token"])
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["user"]["name"] == "Demo Student"

    dashboard = client.get("/api/dashboard/student", headers=headers)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert body["stats"]["completedExams"] == 3
    assert body["stats"]["totalXp"] > 0
    assert len(body["recentAttempts"]) == 3
    assert len(body["weeklyActivity"]) == 7
    assert sum(day["count"] for day in body["weeklyActivity"]) == 3
    assert body["skillProgress"]

    achievements = client.get("/api/achievements", headers=headers).json()
    assert achievements["xp"] == body["stats"]["totalXp"]
    assert any(item["unlocked"] for item in achievements["items"])


def test_student_cannot_create_exam_or_see_draft(client):
    token = login(client)["token"]
    headers = auth_headers(token)
    payload = {
        "title": "Forbidden",
        "subject": "Science",
        "durationMinutes": 10,
        "questions": [],
    }
    response = client.post("/api/admin/exams", json=payload, headers=headers)
    assert response.status_code == 403
    exams = client.get("/api/exams", headers=headers).json()
    assert exams
    assert all(exam["status"] == "published" for exam in exams)
    assert "World Geography Draft" not in {exam["title"] for exam in exams}
    subjects = client.get("/api/exams/subjects", headers=headers)
    assert subjects.status_code == 200
    assert "Mathematics" in subjects.json()


def test_exam_and_attempt_do_not_leak_answers_before_submit(client):
    token = login(client)["token"]
    headers = auth_headers(token)
    exam = client.get("/api/exams?subject=Mathematics", headers=headers).json()[0]
    detail = client.get(f"/api/exams/{exam['id']}", headers=headers)
    assert detail.status_code == 200
    for question in detail.json()["questions"]:
        assert "correctAnswer" not in question
        assert "explanation" not in question
        assert all(set(option) == {"id", "label", "text"} for option in question["options"])

    start = client.post("/api/attempts/start", json={"examId": exam["id"]}, headers=headers)
    assert start.status_code == 201, start.text
    attempt = start.json()
    assert attempt["status"] == "inProgress"
    assert attempt["startedAt"].endswith("Z")
    assert attempt["expiresAt"].endswith("Z")
    for question in attempt["exam"]["questions"]:
        assert "correctAnswer" not in question
        assert "explanation" not in question


def test_start_autosave_submit_and_result(client):
    token = login(client)["token"]
    headers = auth_headers(token)
    exam = client.get("/api/exams?subject=Mathematics", headers=headers).json()[0]
    start = client.post("/api/attempts/start", json={"examId": exam["id"]}, headers=headers)
    attempt = start.json()
    values = {
        1: {"value": "B", "flagged": True},
        2: {"value": ["A", "C"], "flagged": False},
        3: {"value": "13", "flagged": False},
        4: {"value": "x+x", "flagged": False},
    }
    answers = {
        str(question["id"]): values[question["order"]]
        for question in attempt["exam"]["questions"]
    }
    saved = client.put(
        f"/api/attempts/{attempt['id']}/answers", json={"answers": answers}, headers=headers
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["answers"][str(attempt["exam"]["questions"][0]["id"])]["flagged"] is True

    submitted = client.post(f"/api/attempts/{attempt['id']}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    result = submitted.json()
    assert result["attempt"]["status"] == "submitted"
    assert result["score"] == result["maxScore"]
    assert result["percentage"] == 100
    assert len(result["answers"]) == 4
    assert all(item["isCorrect"] for item in result["answers"])
    assert all("correctAnswer" in item and "explanation" in item for item in result["answers"])

    fetched = client.get(f"/api/results/{attempt['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["score"] == result["score"]
    history = client.get("/api/attempts/history", headers=headers).json()
    assert history[0]["id"] == attempt["id"]


def test_result_is_owner_or_admin_only(client):
    student_token = login(client)["token"]
    exam = client.get(
        "/api/exams?subject=Physics", headers=auth_headers(student_token)
    ).json()[0]
    attempt = client.post(
        "/api/attempts/start", json={"examId": exam["id"]}, headers=auth_headers(student_token)
    ).json()
    client.post(f"/api/attempts/{attempt['id']}/submit", headers=auth_headers(student_token))

    other = client.post(
        "/api/auth/register",
        json={"name": "Other Student", "email": "other@example.com", "password": "Other123!"},
    ).json()
    denied = client.get(f"/api/results/{attempt['id']}", headers=auth_headers(other["token"]))
    assert denied.status_code == 403
    admin = login(client, "admin@examworld.dev", "Admin123!")
    allowed = client.get(f"/api/results/{attempt['id']}", headers=auth_headers(admin["token"]))
    assert allowed.status_code == 200


def test_expired_attempt_is_submitted_automatically(client):
    token = login(client)["token"]
    headers = auth_headers(token)
    exam = client.get("/api/exams?subject=Physics", headers=headers).json()[0]
    attempt = client.post("/api/attempts/start", json={"examId": exam["id"]}, headers=headers).json()
    with SessionLocal() as db:
        stored = db.get(Attempt, attempt["id"])
        stored.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    fetched = client.get(f"/api/attempts/{attempt['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "submitted"
    assert fetched.json()["submittedAt"] is not None
    assert "correctAnswer" in fetched.json()["exam"]["questions"][0]


def test_admin_create_publish_parse_audio_and_archive(client):
    admin = login(client, "admin@examworld.dev", "Admin123!")
    headers = auth_headers(admin["token"])
    payload = {
        "title": "New Biology Exam",
        "description": "Cells",
        "subject": "Biology",
        "grade": "8",
        "durationMinutes": 15,
        "difficulty": "easy",
        "questions": [
            {
                "content": "What is the basic unit of life?",
                "type": "single",
                "options": [
                    {"label": "A", "text": "Cell"},
                    {"label": "B", "text": "Atom"},
                ],
                "correctAnswer": "A",
                "explanation": "The cell is the basic unit of life.",
                "points": 2,
            }
        ],
    }
    created = client.post("/api/admin/exams", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    exam = created.json()
    assert exam["questionCount"] == 1
    assert exam["totalPoints"] == 2
    assert exam["questions"][0]["correctAnswer"] == "A"
    published = client.post(f"/api/admin/exams/{exam['id']}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    text = (
        "Câu 1. Thủ đô của Việt Nam là gì?\n"
        "A. Huế\nB. Hà Nội\nC. Đà Nẵng\nD. Cần Thơ\n"
        "Đáp án: B\nGiải thích: Hà Nội là thủ đô.\n"
        "Câu 2. Những số nào là số chẵn?\n"
        "A. 2\nB. 3\nC. 4\nD. 5\nĐáp án: A,C\n"
    )
    parsed = client.post(
        "/api/admin/parse-exam",
        files={"examFile": ("geography.txt", text.encode("utf-8"), "text/plain")},
        headers=headers,
    )
    assert parsed.status_code == 200, parsed.text
    parsed_body = parsed.json()
    assert parsed_body["title"] == "geography"
    assert len(parsed_body["questions"]) == 2
    assert parsed_body["questions"][0]["correctAnswer"] == "B"
    assert parsed_body["questions"][1]["type"] == "multiple"
    assert parsed_body["questions"][1]["correctAnswer"] == ["A", "C"]

    audio = client.post(
        f"/api/admin/exams/{exam['id']}/audio",
        files={"audioFile": ("lesson.mp3", b"test-audio-content", "audio/mpeg")},
        headers=headers,
    )
    assert audio.status_code == 200, audio.text
    media_url = audio.json()["audioUrl"]
    assert client.get(media_url).status_code == 401
    assert client.get(media_url, headers=headers).content == b"test-audio-content"
    archived = client.delete(f"/api/admin/exams/{exam['id']}", headers=headers)
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


def test_forgot_and_reset_password(client):
    forgot = client.post(
        "/api/auth/forgot-password", json={"email": "student@examworld.dev"}
    )
    assert forgot.status_code == 200
    token = forgot.json()["resetToken"]
    reset = client.post(
        "/api/auth/reset-password", json={"token": token, "password": "NewStudent123!"}
    )
    assert reset.status_code == 200
    old_login = client.post(
        "/api/auth/login",
        json={"email": "student@examworld.dev", "password": "Student123!"},
    )
    assert old_login.status_code == 401
    login(client, password="NewStudent123!")
    reused = client.post(
        "/api/auth/reset-password", json={"token": token, "password": "Another123!"}
    )
    assert reused.status_code == 400


def _docx_bytes(build) -> bytes:
    import io

    from docx import Document

    document = Document()
    build(document)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_import_exam_from_text_and_answer_file_then_student_takes_it(client):
    admin = auth_headers(login(client, "admin@examworld.dev", "Admin123!")["token"])
    exam_text = (
        "Câu 1: Thủ đô của Việt Nam? A. Huế B. Hà Nội C. Đà Nẵng D. Cần Thơ\n"
        "Câu 2. Chọn số chẵn\nA. 2\nB. 3\nC. 4\nD. 5\n"
        "Câu 3. 2 + 2 = ...\n"
    )
    answer_text = "Câu\t1\t2\t3\nĐáp án\tB\tA,C\t4\n"
    response = client.post(
        "/api/admin/import-exam",
        data={"title": "Đề nhập tự động", "subject": "Toán học", "totalScore": "10", "publish": "true", "durationMinutes": "20"},
        files={
            "examFile": ("de.txt", exam_text.encode("utf-8"), "text/plain"),
            "answerFile": ("dap-an.txt", answer_text.encode("utf-8"), "text/plain"),
        },
        headers=admin,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["published"] is True and body["missingAnswers"] == 0
    exam = body["exam"]
    assert exam["status"] == "published" and exam["questionCount"] == 3
    assert exam["totalPoints"] == 10
    assert [q["correctAnswer"] for q in exam["questions"]] == ["B", ["A", "C"], "4"]
    assert [q["type"] for q in exam["questions"]] == ["single", "multiple", "fill"]

    student = auth_headers(login(client)["token"])
    attempt = client.post("/api/attempts/start", json={"examId": exam["id"]}, headers=student)
    assert attempt.status_code == 201, attempt.text
    attempt_id = attempt.json()["id"]
    answers = {str(q["id"]): {"value": q["correctAnswer"]} for q in exam["questions"]}
    saved = client.put(f"/api/attempts/{attempt_id}/answers", json={"answers": answers}, headers=student)
    assert saved.status_code == 200, saved.text
    submitted = client.post(f"/api/attempts/{attempt_id}/submit", headers=student)
    assert submitted.status_code == 200, submitted.text
    result = client.get(f"/api/results/{attempt_id}", headers=student).json()
    assert result["attempt"]["score"] == 10


def test_import_exam_keeps_draft_when_answers_missing(client):
    admin = auth_headers(login(client, "admin@examworld.dev", "Admin123!")["token"])
    response = client.post(
        "/api/admin/import-exam",
        data={"publish": "true"},
        files={"examFile": ("thieu.txt", "Câu 1. Hỏi?\nA. x\nB. y\n".encode("utf-8"), "text/plain")},
        headers=admin,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["published"] is False and body["missingAnswers"] == 1
    assert body["exam"]["status"] == "draft"
    assert any("nháp" in warning for warning in body["warnings"])


def test_import_exam_reads_word_underlined_answers_and_rejects_empty(client):
    admin = auth_headers(login(client, "admin@examworld.dev", "Admin123!")["token"])

    def build(document):
        document.add_paragraph("Câu 1. Hà Nội là gì?")
        for label, text, mark in [("A", "Sông", False), ("B", "Thủ đô", True)]:
            run = document.add_paragraph().add_run(f"{label}. {text}")
            run.underline = mark

    response = client.post(
        "/api/admin/import-exam",
        data={"publish": "true"},
        files={"examFile": ("de.docx", _docx_bytes(build), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=admin,
    )
    assert response.status_code == 201, response.text
    assert response.json()["exam"]["questions"][0]["correctAnswer"] == "B"

    empty = client.post(
        "/api/admin/import-exam",
        files={"examFile": ("rong.txt", b"khong co cau hoi nao", "text/plain")},
        headers=admin,
    )
    assert empty.status_code == 422
    student = auth_headers(login(client)["token"])
    forbidden = client.post(
        "/api/admin/import-exam",
        files={"examFile": ("de.txt", b"Cau 1. a", "text/plain")},
        headers=student,
    )
    assert forbidden.status_code == 403


def test_import_exam_real_world_layout_and_code_mismatch(client):
    admin = auth_headers(login(client, "admin@examworld.dev", "Admin123!")["token"])
    exam_text = (
        "Mã đề thi: 103\n"
        "PART I. LISTENING\nTask 1. Decide whether each statement is True (T) or False (F).\n"
        "No.\tStatement\tTrue (T)\tFalse (F)\n"
        "Question 1\tThe band plays rubbish instruments.\t\t\n"
        "Task 2. Mark the letter A, B, C, or D to answer.\n"
        "Question 2. What do students use?\nA. Rubbish\t\tB. Wood\nC. Metal\t\tD. Glass\n"
        "PART II. ARRANGEMENT\nMark the letter A, B, C, or D to arrange.\n"
        "Question 3.\na. Second sentence is here.\nb. First sentence is here.\n"
        "A. b – a\tB. a – b\tC. a – a\tD. b – b\n"
        "PART IV. CLOZE TEST\nRead the following passage and mark the correct word for each blank from 4 to 4.\n"
        "Plastic pollution is a serious threat (4) ______ our oceans every single year.\n"
        "Question 4.\tA. for\tB. to\tC. at\tD. with\n"
        "––––– THE END –––––\nThí sinh không được sử dụng tài liệu.\n"
    )
    answer_text = "Mã đề 101\nCâu\tĐáp án\tCâu\tĐáp án\n1\tT\t3\tA\n2\tC\t4\tB\n"
    response = client.post(
        "/api/admin/import-exam",
        data={"publish": "true"},
        files={
            "examFile": ("de.txt", exam_text.encode("utf-8"), "text/plain"),
            "answerFile": ("dapan.txt", answer_text.encode("utf-8"), "text/plain"),
        },
        headers=admin,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    questions = body["exam"]["questions"]
    assert len(questions) == 4
    assert [q["type"] for q in questions] == ["truefalse", "single", "single", "single"]
    assert [q["correctAnswer"] for q in questions] == ["A", "C", "A", "B"]
    assert len(questions[1]["options"]) == 4 and questions[1]["options"][3]["text"] == "Glass"
    assert "Plastic pollution" in questions[3]["content"] and "THE END" not in questions[3]["options"][3]["text"]
    assert questions[2]["content"].startswith("a. Second")
    assert body["published"] is False and body["exam"]["status"] == "draft"
    assert any("Mã đề không khớp" in warning for warning in body["warnings"])
