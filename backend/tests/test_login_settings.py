from backend import models
from backend.routers import oauth


def test_cannot_disable_password_without_linked_admin(client):
    assert client.patch("/api/admin/login-settings", json={"password_enabled": False}).status_code == 409


def test_disabled_password_and_last_oauth_guard(client, db, monkeypatch):
    monkeypatch.setattr(oauth, "GITHUB_CLIENT_ID", "test-id")
    monkeypatch.setattr(oauth, "GITHUB_CLIENT_SECRET", "test-secret")
    admin = db.query(models.User).filter_by(role="admin").one()
    db.add(models.OAuthIdentity(user_id=admin.id, provider="github", oauth_id="admin", email=admin.email, created_at="now"))
    db.commit()
    assert client.patch("/api/admin/login-settings", json={"password_enabled": False}).status_code == 200
    assert client.get("/api/config").json()["password_enabled"] is False
    assert client.post("/api/auth/login", json={"email": admin.email, "password": "pass123"}).status_code == 403
    assert client.post("/api/auth/forgot-password", json={"email": admin.email}).status_code == 403
    assert client.patch("/api/admin/oauth-providers/github", json={"enabled": False}).status_code == 409
