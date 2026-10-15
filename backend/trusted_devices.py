"""A trusted-browser cookie can skip a factor, never primary authentication."""
import hashlib
import secrets
import time
import uuid

from . import models

COOKIE_NAME = "thorotest_device"
TRUST_SECONDS = 30 * 24 * 60 * 60


def has_valid_trust(db, user, request):
    raw = request.cookies.get(COOKIE_NAME) if request else None
    if not raw or user.account_status != "active":
        return False
    record = db.query(models.TrustedDevice).filter_by(
        user_id=user.id, secret_hash=hashlib.sha256(raw.encode()).hexdigest(),
        security_version=user.security_version).first()
    return bool(record and record.expires_at > int(time.time()) and
                db.query(models.Passkey).filter_by(id=record.passkey_id, user_id=user.id).first())


def issue_trust(db, user, passkey, response, name="Browser"):
    raw = secrets.token_urlsafe(32)
    now = int(time.time())
    db.add(models.TrustedDevice(id=uuid.uuid4().hex, user_id=user.id, passkey_id=passkey.id,
        secret_hash=hashlib.sha256(raw.encode()).hexdigest(), security_version=user.security_version,
        name=name[:100], created_at=now, expires_at=now + TRUST_SECONDS))
    response.set_cookie(COOKIE_NAME, raw, max_age=TRUST_SECONDS, secure=True, httponly=True,
                        samesite="lax", path="/")


def revoke_trust(db, user):
    user.security_version += 1
    db.query(models.TrustedDevice).filter_by(user_id=user.id).delete()
