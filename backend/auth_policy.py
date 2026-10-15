"""Shared primary-login, one-use challenge and security-management policy."""
import hashlib
import secrets
import time

import jwt
from fastapi import HTTPException

from . import models
from .auth_utils import ALGORITHM, SECRET_KEY, create_access_token
from .login_settings import password_enabled


def now():
    return int(time.time())


def methods(db, user):
    result = ["totp"] if user.totp_enabled else []
    if db.query(models.Passkey).filter_by(user_id=user.id).first():
        result.append("passkey")
    return result


def primary_enabled(db, method):
    if method == "password":
        return password_enabled(db)
    from .routers.oauth import oauth_provider_enabled, oauth_provider_configured
    return oauth_provider_enabled(db, method) and oauth_provider_configured(method)


def new_challenge(db, user, purpose, value="", primary_method="password", auth_time=None):
    if db.query(models.AuthChallenge).filter(
        models.AuthChallenge.user_id == user.id, models.AuthChallenge.purpose == purpose,
        models.AuthChallenge.used == False, models.AuthChallenge.expires_at > now()).count() >= 20:
        raise HTTPException(429, "Too many second-factor attempts")
    raw = secrets.token_urlsafe(32)
    row = models.AuthChallenge(id=hashlib.sha256(raw.encode()).hexdigest(), user_id=user.id,
        purpose=purpose, value=value, expires_at=now() + 300, token_version=user.token_version,
        primary_method=primary_method, auth_time=now() if auth_time is None else auth_time, used=False)
    db.query(models.AuthChallenge).filter(models.AuthChallenge.expires_at < now() - 3600).delete()
    db.add(row)
    db.commit()
    return raw


def challenge(db, raw, purpose, user_id=None, consume=False):
    row = db.get(models.AuthChallenge, hashlib.sha256(raw.encode()).hexdigest())
    user = db.get(models.User, row.user_id) if row else None
    if (not row or row.used or row.purpose != purpose or row.expires_at <= now()
            or not user or user.account_status != "active"
            or row.token_version != user.token_version or (user_id is not None and user.id != user_id)
            or not primary_enabled(db, row.primary_method)):
        raise HTTPException(401, "Invalid or expired authentication challenge")
    if consume:
        count = db.query(models.AuthChallenge).filter_by(id=row.id, used=False).update(
            {"used": True}, synchronize_session=False)
        if count != 1:
            db.rollback()
            raise HTTPException(401, "Invalid or expired authentication challenge")
    return row, user


def session_result(user, *, auth_time=None, mfa_time=0, primary_method="password"):
    token = create_access_token(user.id, user.token_version, auth_time=auth_time,
                                mfa_time=mfa_time, primary_method=primary_method)
    return {"status": "ok", "token": token, "access_token": token, "token_type": "bearer",
            "user": {"id": user.id, "username": user.username, "email": user.email,
                     "display_name": user.display_name, "role": user.role,
                     "appearance": user.appearance,
                     "language": user.language or "en", "account_status": user.account_status}}


def begin_login(db, user, request=None, primary_method="password"):
    if user.account_status == "pending":
        return {"status": "pending_approval"}
    if user.account_status != "active":
        raise HTTPException(403, "Account access is blocked")
    factors = methods(db, user)
    from .trusted_devices import has_valid_trust
    if factors and not has_valid_trust(db, user, request):
        raw = new_challenge(db, user, "login", primary_method=primary_method)
        # Preserve the signed partial-token shape; the jti binds it to DB state.
        token = jwt.encode({"sub": str(user.id), "scope": "2fa_pending", "exp": now() + 300,
                            "jti": raw}, SECRET_KEY, algorithm=ALGORITHM)
        return {"status": "2fa_required", "partial_token": token, "methods": factors}
    return session_result(user, primary_method=primary_method)


def login_challenge(db, token, consume=False):
    try:
        claims = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if claims.get("scope") != "2fa_pending" or not isinstance(claims.get("jti"), str):
            raise ValueError()
        return challenge(db, claims["jti"], "login", int(claims["sub"]), consume)
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise HTTPException(401, "Invalid or expired authentication challenge")


def session_claims(request):
    try:
        raw = request.headers.get("authorization", "").split(" ", 1)[1]
        claims = jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
        if claims.get("scope") != "session":
            raise ValueError()
        return claims
    except (jwt.PyJWTError, IndexError, ValueError):
        raise HTTPException(401, "Sign in again to change security settings")


def require_recent(request, db, user, fresh_factor=True):
    claims = session_claims(request)
    if now() - claims.get("auth_time", 0) > 300:
        raise HTTPException(403, "Sign in again to change security settings")
    if fresh_factor and methods(db, user) and now() - claims.get("mfa_time", 0) > 300:
        raise HTTPException(403, "Confirm a second factor to change security settings")
    return claims
