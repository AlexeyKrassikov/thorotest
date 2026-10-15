from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend import models
from backend.routers import oauth


@pytest.fixture
def configured_providers(monkeypatch):
    monkeypatch.setattr(oauth, "GITHUB_CLIENT_ID", "github-client-id")
    monkeypatch.setattr(oauth, "GITHUB_CLIENT_SECRET", "github-client-secret")
    monkeypatch.setattr(oauth, "GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setattr(oauth, "GOOGLE_CLIENT_SECRET", "google-client-secret")
    monkeypatch.setenv("MATTERMOST_URL", "https://mattermost.example")
    monkeypatch.setenv("MATTERMOST_CLIENT_ID", "mattermost-client-id")
    monkeypatch.setenv("MATTERMOST_CLIENT_SECRET", "mattermost-client-secret")


def test_provider_settings_are_admin_only_and_report_configuration(auth_client, configured_providers):
    admin = auth_client("admin")
    response = admin.get("/api/admin/oauth-providers")

    assert response.status_code == 200
    assert response.json() == {
        "github": {"enabled": True, "configured": True},
        "google": {"enabled": True, "configured": True},
        "mattermost": {"enabled": True, "configured": True},
    }
    assert "client-secret" not in response.text
    assert "client-id" not in response.text
    assert auth_client("viewer").get("/api/admin/oauth-providers").status_code == 403


def test_provider_switch_requires_admin_and_strict_boolean_payload(auth_client):
    viewer = auth_client("viewer")
    assert viewer.patch("/api/admin/oauth-providers/github", json={"enabled": False}).status_code == 403

    admin = auth_client("admin")
    assert admin.patch("/api/admin/oauth-providers/github", json={"enabled": False, "other": 1}).status_code == 422
    assert admin.patch("/api/admin/oauth-providers/github", json={"enabled": "false"}).status_code == 422
    assert admin.patch("/api/admin/oauth-providers/github", json={}).status_code == 422
    assert admin.patch("/api/admin/oauth-providers/unknown", json={"enabled": False}).status_code == 404


def test_provider_switch_persists_and_writes_audit_event(client, db):
    response = client.patch("/api/admin/oauth-providers/google", json={"enabled": False})

    assert response.status_code == 200
    assert response.json() == {"enabled": False, "configured": False}
    assert client.get("/api/admin/oauth-providers").json()["google"]["enabled"] is False
    saved = db.query(models.OAuthProviderSetting).filter_by(provider="google").one()
    assert saved.enabled is False
    event = db.query(models.AuditLog).filter_by(event_type="oauth_provider_setting_changed").one()
    assert "google" in event.description
    assert "disabled" in event.description


def test_concurrent_provider_insert_updates_the_winning_row(client, db, monkeypatch):
    db.add(models.OAuthProviderSetting(provider="github", enabled=True))
    db.commit()

    original_query = db.query
    hidden_initial_lookup = True

    def query(*entities, **kwargs):
        nonlocal hidden_initial_lookup
        result = original_query(*entities, **kwargs)
        if entities == (models.OAuthProviderSetting,) and hidden_initial_lookup:
            hidden_initial_lookup = False

            class MissingConcurrentRow:
                def filter_by(self, **filters):
                    self.query = result.filter_by(**filters)
                    return self

                def first(self):
                    return None

            return MissingConcurrentRow()
        return result

    monkeypatch.setattr(db, "query", query)
    from fastapi.testclient import TestClient

    with TestClient(client.app, headers=client.headers, raise_server_exceptions=False) as safe_client:
        response = safe_client.patch(
            "/api/admin/oauth-providers/github", json={"enabled": False}
        )

    assert response.status_code == 200
    assert response.json()["enabled"] is False
    db.expire_all()
    assert db.query(models.OAuthProviderSetting).filter_by(provider="github").one().enabled is False


def test_public_config_reports_effective_availability_without_credentials(client, configured_providers):
    client.patch("/api/admin/oauth-providers/github", json={"enabled": False})

    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json()["oauth_providers"] == {
        "github": False,
        "google": True,
        "mattermost": True,
    }
    assert "client-secret" not in response.text
    assert "client-id" not in response.text


@pytest.mark.parametrize("provider", ["github", "google", "mattermost"])
def test_unconfigured_provider_is_not_advertised(client, monkeypatch, provider):
    monkeypatch.setattr(oauth, f"{provider.upper()}_CLIENT_ID", "") if provider != "mattermost" else None
    if provider != "mattermost":
        monkeypatch.setattr(oauth, f"{provider.upper()}_CLIENT_SECRET", "")
    else:
        monkeypatch.delenv("MATTERMOST_URL", raising=False)
        monkeypatch.delenv("MATTERMOST_CLIENT_ID", raising=False)
        monkeypatch.delenv("MATTERMOST_CLIENT_SECRET", raising=False)

    assert client.get("/api/config").json()["oauth_providers"][provider] is False


@pytest.mark.parametrize("provider", ["github", "google", "mattermost"])
def test_disabled_provider_rejects_redirect_and_callback(client, provider):
    assert client.patch(f"/api/admin/oauth-providers/{provider}", json={"enabled": False}).status_code == 200

    assert client.get(f"/api/auth/oauth/{provider}/redirect", follow_redirects=False).status_code == 403
    assert client.get(f"/api/auth/oauth/{provider}/callback", follow_redirects=False).status_code == 403


def test_disabling_provider_rejects_inflight_upsert_and_pending_link(client, db):
    user = models.User(
        username="existing",
        email="existing@example.com",
        hashed_password="not-a-valid-password-hash",
        role="tester",
    )
    db.add(user)
    db.commit()
    now = datetime.now(timezone.utc)
    pending = models.OAuthPendingLink(
        state_token="pending-token",
        provider="github",
        oauth_id="provider-user",
        email=user.email,
        display_name="Existing",
        user_id=user.id,
        created_at=now.isoformat(),
        expires_at=(now + timedelta(minutes=10)).isoformat(),
    )
    db.add(pending)
    db.commit()

    assert client.patch("/api/admin/oauth-providers/github", json={"enabled": False}).status_code == 200
    with pytest.raises(HTTPException) as exc:
        oauth.upsert_oauth_user(db, "github", "incoming-user", "new@example.com", True, "Incoming", None)
    assert exc.value.status_code == 403
    response = client.post("/api/auth/oauth/confirm-link", json={
        "pending_token": "pending-token",
        "password": "not-a-valid-password-hash",
    })
    assert response.status_code == 403
    assert db.query(models.OAuthIdentity).filter_by(provider="github").count() == 0
