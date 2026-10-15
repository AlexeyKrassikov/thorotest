from backend import models


def test_passkeys_require_authentication(client):
    client.headers.pop("Authorization", None)
    assert client.get("/api/me/passkeys").status_code == 401


def test_registration_requires_configured_origin(client, monkeypatch):
    monkeypatch.delenv("WEBAUTHN_ORIGIN", raising=False)
    monkeypatch.delenv("TESTHUB_BASE_URL", raising=False)
    assert client.post("/api/me/passkeys/register/options", json={}).status_code == 503


def test_registration_options_and_replay(client, db, monkeypatch):
    monkeypatch.setenv("WEBAUTHN_ORIGIN", "https://app.example.test")
    monkeypatch.setenv("WEBAUTHN_RP_ID", "app.example.test")
    result = client.post("/api/me/passkeys/register/options", json={})
    assert result.status_code == 200
    body = result.json()
    assert body["options"]["authenticatorSelection"]["userVerification"] == "required"
    assert body["options"]["rp"]["id"] == "app.example.test"
    payload = {"challenge_id": body["challenge_id"], "credential": {}, "name": "Laptop"}
    assert client.post("/api/me/passkeys/register/verify", json=payload).status_code == 400
    assert client.post("/api/me/passkeys/register/verify", json=payload).status_code == 401
    assert db.query(models.Passkey).count() == 0
