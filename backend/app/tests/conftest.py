import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
os.environ["DATABASE_URL"] = f"sqlite:///{(BACKEND_DIR / 'test_examworld.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(BACKEND_DIR / "test_uploads")
os.environ["ENVIRONMENT"] = "development"
os.environ["JWT_SECRET"] = "test-secret-at-least-32-bytes-long"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient, email: str = "student@examworld.dev", password: str = "Student123!") -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
