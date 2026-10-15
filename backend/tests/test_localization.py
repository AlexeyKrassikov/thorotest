import asyncio
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend import models
from backend.auth_utils import create_access_token, hash_password
from backend.db import get_db
from backend.main import app


def test_http_errors_follow_accept_language_and_keep_english_default(db):
    user = models.User(
        username="locale", email="locale@test.com",
        hashed_password=hash_password("pass123"), role="admin",
    )
    db.add(user)
    db.commit()

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
        with TestClient(app) as client:
            en = client.patch("/api/folders/missing", headers=headers, json={})
            ru = client.patch("/api/folders/missing", headers={**headers, "Accept-Language": "ru-RU,ru;q=0.9"}, json={})
            unsupported = client.patch("/api/folders/missing", headers={**headers, "Accept-Language": "fr"}, json={})
        assert en.status_code == ru.status_code == unsupported.status_code == 404
        assert en.json()["detail"] == "Folder not found"
        assert ru.json()["detail"] == "Папка не найдена"
        assert unsupported.json()["detail"] == en.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_dynamic_error_template_preserves_interpolated_data():
    from backend.localization import translate

    assert translate("Folder has 2 sub-folders and 5 tests — move or delete them first", "ru") == (
        "В папке 2 вложенных папок и 5 тестов — сначала переместите или удалите их"
    )


def test_oauth_provider_admin_errors_are_localized_in_russian():
    from backend.localization import translate

    assert translate("OAuth provider not found", "ru") == "Провайдер OAuth не найден"
    assert translate("This OAuth provider is disabled", "ru") == "Этот провайдер OAuth отключен"


def test_accept_language_respects_quality_and_zero_quality():
    from backend.localization import language_from_header

    assert language_from_header("en,ru;q=0.1") == "en"
    assert language_from_header("ru;q=0,en;q=0.8") == "en"
    assert language_from_header("fr,ru-RU;q=0.9") == "ru"


def test_request_validation_message_is_localized_without_translating_input(db):
    user = models.User(
        username="locale2", email="locale2@test.com",
        hashed_password=hash_password("pass123"), role="admin",
    )
    db.add(user)
    db.commit()

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        headers = {
            "Authorization": f"Bearer {create_access_token(user.id)}",
            "Accept-Language": "ru",
        }
        with TestClient(app) as client:
            response = client.post("/api/folders", headers=headers, json={"id": "bad", "name": 42})
        assert response.status_code == 422
        assert "строкой" in response.json()["detail"][0]["msg"]
        assert response.json()["detail"][0]["input"] == 42
    finally:
        app.dependency_overrides.clear()


def test_validation_message_suffix_is_translated_and_input_is_preserved():
    from backend.localization import translate_validation_errors

    errors = translate_validation_errors([{
        "type": "int_parsing",
        "loc": ("body", "count"),
        "msg": "Input should be a valid integer, unable to parse string as an integer",
        "input": "not-a-count",
    }], "ru")

    assert errors[0]["msg"] == "Значение должно быть целым числом: не удалось преобразовать строку в целое число"
    assert errors[0]["input"] == "not-a-count"


def test_run_notification_localizes_status_without_mutating_enum(db):
    from backend.notifications import _notify_run_events

    user = models.User(
        username="runru", email="runru@test.com", hashed_password="x",
        role="tester", language="ru",
    )
    run = models.Run(
        id="R-RU", name="Checkout", status="pass", progress=100,
        total=1, passed=1, failed=0, blocked=0,
    )
    db.add_all([user, run])
    db.flush()
    db.add(models.NotificationConfig(user_id=user.id, notify_run_complete=True))
    db.commit()

    mock_db = MagicMock(wraps=db)
    mock_db.close = MagicMock()
    with patch("backend.notifications.SessionLocal", return_value=mock_db), \
            patch("backend.notifications.asyncio.create_task", side_effect=lambda coro: coro.close()):
        asyncio.run(_notify_run_events("R-RU"))

    notification = db.query(models.Notification).filter_by(user_id=user.id).one()
    db.refresh(run)
    assert "пройден" in notification.title
    assert "Checkout" in notification.title
    assert run.status == "pass"


def test_assignment_notification_localizes_entity_label_only(db):
    from backend.notifications import _notify_assignment

    user = models.User(
        username="assignee", email="assignee@test.com", hashed_password="x",
        role="tester", language="ru",
    )
    db.add(user)
    db.commit()
    mock_db = MagicMock(wraps=db)
    mock_db.close = MagicMock()
    with patch("backend.notifications.SessionLocal", return_value=mock_db), \
            patch("backend.notifications.asyncio.create_task", side_effect=lambda coro: coro.close()):
        asyncio.run(_notify_assignment("test", "Login with SSO", "#/tests/TC-1", "assignee", "lead"))

    notification = db.query(models.Notification).filter_by(user_id=user.id).one()
    assert "тест" in notification.title
    assert "Login with SSO" in notification.title
    assert "lead" in notification.title


def test_notification_title_uses_recipient_language_without_translating_user_content(db):
    from backend.notifications import _notify_comment_event, _send_email

    user = models.User(
        username="russian", email="russian@test.com", hashed_password="x",
        role="tester", language="ru",
    )
    test_case = models.Test(
        id="TC-LOCALIZED", title="Checkout stays green", status="pending",
        priority="med", auto=False, tags=[],
    )
    db.add_all([user, test_case])
    db.flush()
    db.add(models.NotificationConfig(user_id=user.id, notify_comment=True))
    db.commit()

    mock_db = MagicMock(wraps=db)
    mock_db.close = MagicMock()
    def close_task(coro):
        coro.close()

    with patch("backend.notifications.SessionLocal", return_value=mock_db), \
            patch("backend.notifications.asyncio.create_task", side_effect=close_task):
        asyncio.run(_notify_comment_event("TC-LOCALIZED", "alice"))

    notification = db.query(models.Notification).filter_by(user_id=user.id).one()
    assert "прокомментировал" in notification.title
    assert "alice" in notification.title
    assert "Checkout stays green" in notification.title
    with patch("backend.emailer.send_email", return_value=True) as send_email:
        asyncio.run(_send_email(user.email, notification))
    assert "alice" in send_email.call_args.args[1]
    assert "Checkout stays green" in send_email.call_args.args[2]


def test_password_reset_email_uses_recipient_language(db, client, monkeypatch):
    user = db.query(models.User).filter_by(email="admin@test.com").one()
    user.language = "ru"
    db.commit()
    captured = {}

    def fake_send(to, subject, body):
        captured.update(to=to, subject=subject, body=body)

    monkeypatch.setattr("backend.routers.auth.send_email", fake_send)
    response = client.post("/api/auth/forgot-password", json={"email": user.email})

    assert response.status_code == 202
    assert captured["to"] == user.email
    assert "Сбросьте пароль" in captured["subject"]
    assert "Запрошен сброс пароля" in captured["body"]
    assert "/#/reset-password/" in captured["body"]
