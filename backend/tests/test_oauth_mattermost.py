from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

from backend import models
from backend.routers import oauth


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("MATTERMOST_URL", "https://chat.example.test")
    monkeypatch.setenv("MATTERMOST_CLIENT_ID", "client-id")
    monkeypatch.setenv("MATTERMOST_CLIENT_SECRET", "client-secret")
    monkeypatch.delenv("ALLOW_OPEN_REGISTRATION", raising=False)


def start(client):
    response = client.get("/api/auth/oauth/mattermost/redirect", follow_redirects=False)
    assert response.status_code == 307
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def exchange(client, state, profile=None):
    token = MagicMock()
    token.json.return_value = {"access_token": "provider-token"}
    user = MagicMock()
    user.json.return_value = profile or {
        "id": "mm-1", "email": "person@example.test", "email_verified": True,
        "username": "person", "delete_at": 0, "roles": "system_admin",
    }
    remote = AsyncMock()
    remote.__aenter__.return_value = remote
    remote.post.return_value = token
    remote.get.return_value = user
    with patch.object(oauth.httpx, "AsyncClient", return_value=remote):
        response = client.get(
            "/api/auth/oauth/mattermost/callback",
            params={"state": state, "code": "code"}, follow_redirects=False,
        )
    return response, remote


def test_disabled_provider(client, monkeypatch):
    monkeypatch.delenv("MATTERMOST_URL", raising=False)
    assert client.get("/api/auth/oauth/mattermost/redirect").status_code == 503
    assert client.get("/api/config").json()["oauth_providers"]["mattermost"] is False


def test_redirect_and_public_config(client, configured):
    response = client.get("/api/auth/oauth/mattermost/redirect", follow_redirects=False)
    location = urlparse(response.headers["location"])
    assert location.netloc == "chat.example.test"
    assert location.path == "/oauth/authorize"
    query = parse_qs(location.query)
    assert query["response_type"] == ["code"]
    assert query["client_id"] == ["client-id"]
    assert query["redirect_uri"][0].endswith("/api/auth/oauth/mattermost/callback")
    config = client.get("/api/config")
    assert config.json()["oauth_providers"]["mattermost"] is True
    assert "client-secret" not in config.text


def test_first_login_is_viewer_and_state_is_single_use(client, db, configured):
    state = start(client)
    response, remote = exchange(client, state)
    assert "#token=" in response.headers["location"]
    user = db.query(models.User).filter_by(email="person@example.test").one()
    assert user.role == "viewer"
    assert user.hashed_password == "!"
    assert remote.post.call_args.args[0] == "https://chat.example.test/oauth/access_token"
    assert remote.get.call_args.args[0] == "https://chat.example.test/api/v4/users/me"
    response, remote = exchange(client, state)
    assert "oauth-error=failed" in response.headers["location"]
    remote.post.assert_not_called()


@pytest.mark.parametrize("updates", [
    {"delete_at": 1}, {"email": ""}, {"id": ""},
])
def test_invalid_profile_rejected(client, db, configured, updates):
    profile = {"id": "mm-1", "email": "person@example.test", "email_verified": True,
               "delete_at": 0, **updates}
    response, _ = exchange(client, start(client), profile)
    assert "oauth-error=failed" in response.headers["location"]
    assert db.query(models.OAuthIdentity).filter_by(provider="mattermost").count() == 0


def test_same_email_requires_confirmation(client, db, configured):
    profile = {"id": "mm-admin", "email": "admin@test.com", "email_verified": False}
    response, _ = exchange(client, start(client), profile)
    assert "#oauth-confirm=" in response.headers["location"]
    assert db.query(models.OAuthIdentity).filter_by(provider="mattermost").count() == 0


def test_returning_user_keeps_2fa(client, db, configured):
    exchange(client, start(client))
    user = db.query(models.User).filter_by(email="person@example.test").one()
    user.totp_enabled = True
    db.commit()
    response, _ = exchange(client, start(client))
    assert "#oauth-2fa=" in response.headers["location"]


def test_browser_binding_required(client, configured):
    state = start(client)
    client.cookies.clear()
    response, remote = exchange(client, state)
    assert "oauth-error=failed" in response.headers["location"]
    remote.post.assert_not_called()


@pytest.mark.parametrize("url", ["https://[broken", "http://chat.example.test", "https://user:pass@chat.example.test"])
def test_bad_configuration_is_disabled(client, configured, monkeypatch, url):
    monkeypatch.setenv("MATTERMOST_URL", url)
    assert client.get("/api/config").json()["oauth_providers"]["mattermost"] is False


def test_unicode_state_is_rejected(client, configured):
    start(client)
    response, remote = exchange(client, "\u0442\u0435\u0441\u0442")
    assert "oauth-error=failed" in response.headers["location"]
    remote.post.assert_not_called()


@pytest.mark.parametrize(("updates", "reason"), [
    ({"email": ""}, "email_missing"),
    ({"delete_at": 1}, "profile_inactive_or_invalid"),
])
def test_failure_logs_safe_reason(client, configured, caplog, updates, reason):
    profile = {"id": "private-profile-id", "email": "private@example.test",
               "email_verified": True, **updates}
    state = start(client)
    response, _ = exchange(client, state, profile)
    assert "oauth-error=failed" in response.headers["location"]
    assert f"reason={reason}" in caplog.text
    for secret in (state, "private-profile-id", "private@example.test", "provider-token", "client-secret"):
        assert secret not in caplog.text


def test_missing_cookie_logs_safe_reason(client, configured, caplog):
    state = start(client)
    client.cookies.clear()
    exchange(client, state)
    assert "reason=browser_state_mismatch" in caplog.text
    assert state not in caplog.text


@pytest.mark.parametrize("verification", [False, "false", None])
def test_mattermost_does_not_require_email_verification(client, db, configured, verification):
    profile = {"id": "mm-unverified", "email": "person@example.test"}
    if verification is not None:
        profile["email_verified"] = verification
    response, _ = exchange(client, start(client), profile)
    assert "#token=" in response.headers["location"]
    user = db.query(models.User).filter_by(email="person@example.test").one()
    assert user.role == "viewer"
