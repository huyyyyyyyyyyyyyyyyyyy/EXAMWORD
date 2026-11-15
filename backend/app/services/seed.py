from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, utc_now
from app.models import Achievement, Answer, Attempt, Exam, Question, User
from app.services.attempts import submit_attempt


def option(label: str, text: str) -> dict[str, str]:
    return {"id": label, "label": label, "text": text}


def question(
    content: str,
    kind: str,
    answer,
    options=None,
    explanation: str = "",
    points: float = 1,
    topic: str = "",
) -> Question:
    return Question(
        content=content,
        type=kind,
        options=options or [],
        correct_answer=answer,
        explanation=explanation,
        points=points,
        topic=topic,
    )


def seed_database(db: Session) -> None:
    if (db.scalar(select(func.count(User.id))) or 0) > 0:
        return
    now = utc_now()
    student = User(
        name="Demo Student",
        email="student@examworld.dev",
        password_hash=hash_password("Student123!"),
        role="student",
        created_at=now - timedelta(days=30),
    )
    admin = User(
        name="ExamWorld Admin",
        email="admin@examworld.dev",
        password_hash=hash_password("Admin123!"),
        role="admin",
        created_at=now - timedelta(days=60),
    )
    db.add_all([student, admin])

    math_exam = Exam(
        title="Algebra Foundations",
        description="Practice equations, expressions, and mathematical reasoning.",
        subject="Mathematics",
        grade="8",
        duration_minutes=30,
        status="published",
        difficulty="easy",
        created_at=now - timedelta(days=20),
        questions=[
            question(
                "What is the value of x in 2x + 4 = 12?",
                "single",
                "B",
                [option("A", "2"), option("B", "4"), option("C", "6"), option("D", "8")],
                "Subtract 4, then divide by 2: x = 4.",
                topic="Linear equations",
            ),
            question(
                "Which numbers are prime?",
                "multiple",
                ["A", "C"],
                [option("A", "7"), option("B", "9"), option("C", "11"), option("D", "15")],
                "7 and 11 have exactly two positive divisors.",
                topic="Number theory",
            ),
            question("Simplify 3 + 5 × 2.", "fill", "13", explanation="Multiplication comes first."),
            question("Enter an expression equivalent to x + x.", "math", "2*x", explanation="x + x = 2x."),
        ],
    )
    physics_exam = Exam(
        title="Motion and Forces",
        description="A short introduction to speed, force, and motion.",
        subject="Physics",
        grade="9",
        duration_minutes=20,
        status="published",
        difficulty="medium",
        created_at=now - timedelta(days=15),
        questions=[
            question(
                "Velocity includes both speed and direction.",
                "truefalse",
                "true",
                [option("A", "True"), option("B", "False")],
                "Velocity is a vector quantity.",
                topic="Kinematics",
            ),
            question(
                "Which unit is used for force?",
                "single",
                "C",
                [option("A", "Joule"), option("B", "Watt"), option("C", "Newton"), option("D", "Volt")],
                "The SI unit of force is the newton.",
                topic="Forces",
            ),
        ],
    )
    english_exam = Exam(
        title="English Reading and Writing",
        description="Vocabulary, comprehension, and a brief written response.",
        subject="English",
        grade="7",
        duration_minutes=25,
        status="published",
        difficulty="medium",
        created_at=now - timedelta(days=10),
        questions=[
            question(
                "Choose the synonym of 'rapid'.",
                "single",
                "A",
                [option("A", "Quick"), option("B", "Quiet"), option("C", "Slow"), option("D", "Late")],
                "Rapid and quick both mean fast.",
            ),
            question("Write the past tense of 'go'.", "short", "went", explanation="Go is irregular: go, went, gone."),
            question(
                "In 3-5 sentences, explain why reading is useful.",
                "essay",
                None,
                explanation="Review the response for clarity and supporting ideas.",
                points=2,
            ),
        ],
    )
    chemistry_exam = Exam(
        title="Atoms and Elements",
        description="Explore atomic structure and the periodic table.",
        subject="Chemistry",
        grade="10",
        duration_minutes=35,
        status="published",
        difficulty="hard",
        created_at=now - timedelta(days=5),
        questions=[
            question(
                "Which particle has a negative charge?",
                "single",
                "B",
                [option("A", "Proton"), option("B", "Electron"), option("C", "Neutron"), option("D", "Nucleus")],
                "Electrons carry negative charge.",
            )
        ],
    )
    draft = Exam(
        title="World Geography Draft",
        description="Teacher draft: continents and oceans.",
        subject="Geography",
        grade="6",
        duration_minutes=15,
        status="draft",
        difficulty="easy",
        questions=[question("What is the largest ocean?", "short", "Pacific Ocean")],
    )
    db.add_all([math_exam, physics_exam, english_exam, chemistry_exam, draft])
    db.add_all(
        [
            Achievement(title="First Steps", description="Earn your first 50 XP.", icon="star", xp_threshold=50),
            Achievement(title="Century", description="Earn 100 XP.", icon="trophy", xp_threshold=100),
            Achievement(title="Rising Scholar", description="Earn 200 XP.", icon="medal", xp_threshold=200),
            Achievement(title="Expert", description="Earn 500 XP.", icon="crown", xp_threshold=500),
        ]
    )
    db.flush()
    for index, exam in enumerate([math_exam, physics_exam, english_exam, chemistry_exam, draft]):
        for order, item in enumerate(exam.questions, start=1):
            item.order = order
    db.flush()

    def completed(exam: Exam, values: list, days_ago: int, hour: int = 10) -> None:
        submitted = now - timedelta(days=days_ago)
        submitted = submitted.replace(hour=hour, minute=0, second=0, microsecond=0)
        attempt = Attempt(
            user=student,
            exam=exam,
            started_at=submitted - timedelta(minutes=10),
            expires_at=submitted + timedelta(minutes=exam.duration_minutes),
            answers=[
                Answer(question=item, value=value, flagged=False)
                for item, value in zip(exam.questions, values)
            ],
        )
        db.add(attempt)
        db.flush()
        submit_attempt(db, attempt, submitted_at=submitted)

    completed(math_exam, ["B", ["A", "C"], "13", "2x"], 6)
    completed(physics_exam, ["false", "C"], 2, 14)
    completed(english_exam, ["A", "went", "Reading builds knowledge, vocabulary, empathy, and communication skills."], 1, 16)
    db.commit()
