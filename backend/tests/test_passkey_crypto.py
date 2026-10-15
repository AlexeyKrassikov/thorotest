"""Real signed WebAuthn ceremonies, not mocked cryptographic verification."""
import hashlib
import json
import os
import struct
import time

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from backend import models
from backend.passkey_utils import base64url_to_bytes as dec, bytes_to_base64url as enc
from backend.auth_policy import begin_login
from backend.trusted_devices import COOKIE_NAME, has_valid_trust
from starlette.requests import Request


@pytest.fixture(autouse=True)
def isolated_rate_limit():
    from backend.totp_utils import _2fa_rate_store
    _2fa_rate_store.reset()
    yield
    _2fa_rate_store.reset()


class Authenticator:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.id = os.urandom(32)

    def client_data(self, options, kind, origin="https://app.example.test"):
        return json.dumps({"type": kind, "challenge": options["challenge"], "origin": origin}).encode()

    def register(self, options, uv=True):
        public = self.key.public_key().public_numbers()
        cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: public.x.to_bytes(32, "big"), -3: public.y.to_bytes(32, "big")})
        auth = hashlib.sha256(options["rp"]["id"].encode()).digest() + bytes([0x45 if uv else 0x41]) + struct.pack(">I", 0)
        auth += b"\x00" * 16 + struct.pack(">H", len(self.id)) + self.id + cose
        return {"id": enc(self.id), "rawId": enc(self.id), "type": "public-key", "response": {
            "clientDataJSON": enc(self.client_data(options, "webauthn.create")),
            "attestationObject": enc(cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth}))}}

    def assert_(self, options, count=1, origin="https://app.example.test", uv=True):
        data = self.client_data(options, "webauthn.get", origin)
        auth = hashlib.sha256(options["rpId"].encode()).digest() + bytes([5 if uv else 1]) + struct.pack(">I", count)
        signature = self.key.sign(auth + hashlib.sha256(data).digest(), ec.ECDSA(hashes.SHA256()))
        return {"id": enc(self.id), "rawId": enc(self.id), "type": "public-key", "response": {
            "clientDataJSON": enc(data), "authenticatorData": enc(auth), "signature": enc(signature)}}


@pytest.fixture
def enrolled(client, db, monkeypatch):
    monkeypatch.setenv("WEBAUTHN_ORIGIN", "https://app.example.test")
    monkeypatch.setenv("WEBAUTHN_RP_ID", "app.example.test")
    authenticator = Authenticator()
    start = client.post("/api/me/passkeys/register/options", json={}).json()
    result = client.post("/api/me/passkeys/register/verify", json={
        "challenge_id": start["challenge_id"], "credential": authenticator.register(start["options"]), "name": "Laptop"})
    assert result.status_code == 200, result.text
    assert len(result.json()["recovery_codes"]) == 10
    client.headers["Authorization"] = "Bearer " + result.json()["access_token"]
    return authenticator, db.query(models.User).filter_by(role="admin").one(), result.json()["recovery_codes"]


def assertion(client, db, enrolled, **kwargs):
    authenticator, user, _ = enrolled
    partial = begin_login(db, user)["partial_token"]
    start = client.post("/api/auth/passkeys/options", json={"partial_token": partial}).json()
    return {"partial_token": partial, "challenge_id": start["challenge_id"],
            "credential": authenticator.assert_(start["options"], **kwargs)}


def test_real_signature_login_trust_and_single_use(client, db, enrolled):
    payload = assertion(client, db, enrolled)
    payload["trust_device"] = True
    result = client.post("/api/auth/passkeys/verify", json=payload)
    assert result.status_code == 200, result.text
    assert "HttpOnly" in result.headers["set-cookie"] and "Secure" in result.headers["set-cookie"]
    record = db.query(models.TrustedDevice).one()
    assert record.expires_at - record.created_at == 30 * 86400
    raw = result.cookies.get(COOKIE_NAME)
    assert record.secret_hash != raw
    user = enrolled[1]
    request = Request({"type": "http", "headers": [(b"cookie", f"{COOKIE_NAME}={raw}".encode())]})
    assert begin_login(db, user, request)["status"] == "ok"
    user.token_version += 1  # Ordinary logout revokes sessions, not device trust.
    db.commit()
    assert has_valid_trust(db, user, request)
    record.expires_at = int(time.time())
    db.commit()
    assert not has_valid_trust(db, user, request)
    assert client.post("/api/auth/passkeys/verify", json=payload).status_code == 401


@pytest.mark.parametrize("kwargs", [{"origin": "https://other.example.test"}, {"uv": False}])
def test_reject_wrong_origin_and_missing_user_verification(client, db, enrolled, kwargs):
    result = client.post("/api/auth/passkeys/verify", json=assertion(client, db, enrolled, **kwargs))
    assert result.status_code == 400


def test_recovery_for_passkey_only_account_is_single_use(client, db, enrolled):
    _, user, codes = enrolled
    partial = begin_login(db, user)["partial_token"]
    payload = {"partial_token": partial, "code": codes[0]}
    assert client.post("/api/auth/login/2fa", json=payload).status_code == 200
    assert client.post("/api/auth/login/2fa", json=payload).status_code == 401
    payload["partial_token"] = begin_login(db, user)["partial_token"]
    assert client.post("/api/auth/login/2fa", json=payload).status_code == 400


def test_blocking_revokes_outstanding_challenge(client, db, enrolled):
    payload = assertion(client, db, enrolled)
    enrolled[1].account_status = "blocked"
    db.commit()
    assert client.post("/api/auth/passkeys/verify", json=payload).status_code == 401


def test_zero_counters_allowed_but_nonzero_replay_rejected(client, db, enrolled):
    assert client.post("/api/auth/passkeys/verify", json=assertion(client, db, enrolled, count=0)).status_code == 200
    assert client.post("/api/auth/passkeys/verify", json=assertion(client, db, enrolled, count=0)).status_code == 200
    assert client.post("/api/auth/passkeys/verify", json=assertion(client, db, enrolled, count=2)).status_code == 200
    assert client.post("/api/auth/passkeys/verify", json=assertion(client, db, enrolled, count=2)).status_code == 400


def test_legacy_recovery_regeneration_requires_recent_login_and_revokes_trust(client, db, enrolled):
    import pyotp
    from backend.auth_utils import create_access_token
    from backend.totp_utils import encrypt_totp_secret
    _, user, _ = enrolled
    secret = pyotp.random_base32()
    user.totp_enabled = True
    user.totp_secret = encrypt_totp_secret(secret)
    db.commit()
    payload = assertion(client, db, enrolled)
    payload["trust_device"] = True
    assert client.post("/api/auth/passkeys/verify", json=payload).status_code == 200
    code = {"totp_code": pyotp.TOTP(secret).now()}
    stale = create_access_token(user.id, auth_time=int(time.time()) - 301)
    assert client.post("/api/me/2fa/recovery-codes/regenerate", json=code,
        headers={"Authorization": "Bearer " + stale}).status_code == 403
    assert db.query(models.TrustedDevice).count() == 1
    assert client.post("/api/me/2fa/recovery-codes/regenerate", json=code).status_code == 200
    assert db.query(models.TrustedDevice).count() == 0
