from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class RegisterRequest(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class LoginRequest(ApiModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(ApiModel):
    email: EmailStr


class ResetPasswordRequest(ApiModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=128)


class OptionPayload(ApiModel):
    id: str | None = None
    label: str
    text: str


class QuestionPayload(ApiModel):
    content: str = Field(min_length=1)
    type: Literal["single", "multiple", "truefalse", "fill", "short", "math", "essay", "matching"] = "single"
    options: list[Any] = Field(default_factory=list)
    points: float = Field(default=1, gt=0)
    topic: str = ""
    order: int | None = None
    audioUrl: str | None = None
    imageUrl: str | None = None
    correctAnswer: Any = None
    explanation: str | None = None


class ExamPayload(ApiModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    subject: str = Field(min_length=1, max_length=100)
    grade: str = ""
    durationMinutes: int = Field(default=30, gt=0, le=1440)
    status: Literal["draft", "published", "archived"] = "draft"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    questions: list[QuestionPayload] = Field(default_factory=list)


class ExamUpdatePayload(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=100)
    grade: str | None = None
    durationMinutes: int | None = Field(default=None, gt=0, le=1440)
    status: Literal["draft", "published", "archived"] | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None
    questions: list[QuestionPayload] | None = None


class AttemptStartRequest(ApiModel):
    examId: int


class AnswerInput(ApiModel):
    value: Any = None
    flagged: bool = False


class AnswersSaveRequest(ApiModel):
    answers: dict[str, AnswerInput]
