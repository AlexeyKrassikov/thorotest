import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, StrictBool
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from webauthn import (generate_registration_options, generate_authentication_options,
                      verify_registration_response, verify_authentication_response)
from webauthn.helpers.structs import (AuthenticatorSelectionCriteria, UserVerificationRequirement,
                                     ResidentKeyRequirement, PublicKeyCredentialDescriptor)
from webauthn.helpers.exceptions import WebAuthnException

from .. import models
from ..db import get_db
from ..auth_utils import get_current_user
from ..auth_policy import (new_challenge, challenge, login_challenge, methods, now,
                           require_recent, session_result)
from ..passkey_utils import configuration, options_json, bytes_to_base64url, base64url_to_bytes
from ..trusted_devices import issue_trust, revoke_trust
from ..totp_utils import generate_recovery_codes, check_2fa_rate, record_2fa_failure, verify_totp_code
from ..audit_utils import log_event

router = APIRouter(tags=["passkeys"])


class VerifyCredential(BaseModel):
    challenge_id: str = Field(max_length=100)
    credential: dict
    name: str = Field(default="Passkey", min_length=1, max_length=100)
    partial_token: str | None = Field(default=None, max_length=4096)
    trust_device: StrictBool = False


class LoginOptions(BaseModel):
    partial_token: str = Field(max_length=4096)


def audit(user, event):
    log_event(event, actor_email=user.email, actor_id=user.id, description=event)


def check_rate(user):
    allowed, retry = check_2fa_rate(user.id)
    if not allowed:
        raise HTTPException(429, "Too many second-factor attempts", headers={"Retry-After": str(retry)})


def recovery_codes(db, user):
    db.query(models.TotpRecoveryCode).filter_by(user_id=user.id).delete()
    pairs = generate_recovery_codes()
    for _, hashed in pairs:
        db.add(models.TotpRecoveryCode(user_id=user.id, code_hash=hashed, used=False, created_at=str(now())))
    return [plain for plain, _ in pairs]


@router.get("/me/passkeys")
def list_passkeys(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return [{"id": key.id, "name": key.name, "created_at": key.created_at}
            for key in db.query(models.Passkey).filter_by(user_id=user.id).order_by(models.Passkey.created_at).all()]


@router.post("/me/passkeys/register/options")
def registration_options(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    claims = require_recent(request, db, user)
    rp_id, _, name = configuration()
    keys = db.query(models.Passkey).filter_by(user_id=user.id).all()
    if len(keys) >= 10:
        raise HTTPException(400, "Maximum number of passkeys reached")
    opts = generate_registration_options(rp_id=rp_id, rp_name=name, user_name=user.email,
        user_id=str(user.id).encode(),
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED, user_verification=UserVerificationRequirement.REQUIRED),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(k.credential_id)) for k in keys])
    raw = new_challenge(db, user, "register", bytes_to_base64url(opts.challenge),
                        claims.get("primary_method", "password"), claims["auth_time"])
    return {"challenge_id": raw, "options": options_json(opts)}


@router.post("/me/passkeys/register/verify")
def registration_verify(payload: VerifyCredential, request: Request, db: Session = Depends(get_db),
                        user: models.User = Depends(get_current_user)):
    claims = require_recent(request, db, user)
    rp_id, origin, _ = configuration()
    row, _ = challenge(db, payload.challenge_id, "register", user.id, consume=True)
    value = row.value
    db.commit()  # A malformed response cannot replay this ceremony.
    try:
        result = verify_registration_response(credential=payload.credential,
            expected_challenge=base64url_to_bytes(value), expected_rp_id=rp_id,
            expected_origin=origin, require_user_verification=True)
    except (WebAuthnException, ValueError, TypeError, KeyError):
        raise HTTPException(400, "Passkey verification failed") from None
    first_factor = not methods(db, user)
    if db.query(models.Passkey).filter_by(user_id=user.id).count() >= 10:
        raise HTTPException(400, "Maximum number of passkeys reached")
    db.add(models.Passkey(id=uuid.uuid4().hex, user_id=user.id,
        credential_id=bytes_to_base64url(result.credential_id), public_key=bytes_to_base64url(result.credential_public_key),
        sign_count=result.sign_count, name=payload.name.strip() or "Passkey", created_at=now()))
    codes = recovery_codes(db, user) if first_factor else []
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Passkey is already registered") from None
    audit(user, "passkey.created")
    return {**session_result(user, auth_time=claims["auth_time"], mfa_time=now(),
                            primary_method=claims.get("primary_method", "password")), "recovery_codes": codes}


def assertion_options(db, user, purpose, primary_method, auth_time):
    check_rate(user)
    rp_id, _, _ = configuration()
    keys = db.query(models.Passkey).filter_by(user_id=user.id).all()
    if not keys:
        raise HTTPException(400, "No passkeys registered")
    opts = generate_authentication_options(rp_id=rp_id,
        allow_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(k.credential_id)) for k in keys],
        user_verification=UserVerificationRequirement.REQUIRED)
    raw = new_challenge(db, user, purpose, bytes_to_base64url(opts.challenge), primary_method, auth_time)
    return {"challenge_id": raw, "options": options_json(opts)}


@router.post("/auth/passkeys/options")
def login_options(payload: LoginOptions, db: Session = Depends(get_db)):
    row, user = login_challenge(db, payload.partial_token)
    return assertion_options(db, user, "assert-login", row.primary_method, row.auth_time)


@router.post("/auth/second-factor/methods")
def login_methods(payload: LoginOptions, db: Session = Depends(get_db)):
    _, user = login_challenge(db, payload.partial_token)
    return {"methods": methods(db, user)}


@router.post("/me/security/passkey/options")
def security_options(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    claims = require_recent(request, db, user, fresh_factor=False)
    return assertion_options(db, user, "assert-security", claims.get("primary_method", "password"), claims["auth_time"])


def verify_assertion(db, payload, user, purpose):
    check_rate(user)
    rp_id, origin, _ = configuration()
    row, _ = challenge(db, payload.challenge_id, purpose, user.id, consume=True)
    value = row.value
    db.commit()
    key = db.query(models.Passkey).filter_by(user_id=user.id,
        credential_id=payload.credential.get("id", "")).with_for_update().first()
    try:
        if not key:
            raise ValueError()
        handle = payload.credential.get("response", {}).get("userHandle")
        if handle is not None and base64url_to_bytes(handle) != str(user.id).encode():
            raise ValueError()
        result = verify_authentication_response(credential=payload.credential,
            expected_challenge=base64url_to_bytes(value), expected_rp_id=rp_id,
            expected_origin=origin, credential_public_key=base64url_to_bytes(key.public_key),
            credential_current_sign_count=key.sign_count, require_user_verification=True)
    except (WebAuthnException, ValueError, TypeError, KeyError):
        db.rollback()
        record_2fa_failure(user.id)
        raise HTTPException(400, "Passkey verification failed") from None
    key.sign_count = result.new_sign_count
    return row, key


@router.post("/auth/passkeys/verify")
def login_verify(payload: VerifyCredential, response: Response, db: Session = Depends(get_db)):
    if not payload.partial_token:
        raise HTTPException(401, "Primary login required")
    _, user = login_challenge(db, payload.partial_token)
    _, key = verify_assertion(db, payload, user, "assert-login")
    login, user = login_challenge(db, payload.partial_token, consume=True)
    if payload.trust_device:
        issue_trust(db, user, key, response, payload.name)
    db.commit()
    audit(user, "passkey.login")
    return session_result(user, auth_time=login.auth_time, mfa_time=now(), primary_method=login.primary_method)


@router.post("/me/security/passkey/verify")
def security_verify(payload: VerifyCredential, request: Request, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_user)):
    require_recent(request, db, user, fresh_factor=False)
    row, _ = verify_assertion(db, payload, user, "assert-security")
    db.commit()
    return session_result(user, auth_time=row.auth_time, mfa_time=now(), primary_method=row.primary_method)


class ConfirmTotp(BaseModel):
    code: str = Field(max_length=20)


@router.post("/me/security/totp")
def confirm_totp(payload: ConfirmTotp, request: Request, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    claims = require_recent(request, db, user, fresh_factor=False)
    check_rate(user)
    if not user.totp_enabled or not verify_totp_code(user.totp_secret, payload.code):
        record_2fa_failure(user.id)
        raise HTTPException(400, "Invalid code")
    return session_result(user, auth_time=claims["auth_time"], mfa_time=now(),
                          primary_method=claims.get("primary_method", "password"))


@router.delete("/me/passkeys/{key_id}")
def delete_passkey(key_id: str, request: Request, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    require_recent(request, db, user)
    key = db.query(models.Passkey).filter_by(id=key_id, user_id=user.id).first()
    if not key:
        raise HTTPException(404, "Passkey not found")
    db.delete(key)
    db.query(models.TrustedDevice).filter_by(user_id=user.id, passkey_id=key_id).delete()
    db.flush()
    if not methods(db, user):
        db.query(models.TotpRecoveryCode).filter_by(user_id=user.id).delete()
    db.commit()
    audit(user, "passkey.deleted")
    return {"ok": True}


@router.post("/me/security/recovery-codes")
def regenerate_codes(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    require_recent(request, db, user)
    if not methods(db, user):
        raise HTTPException(400, "2FA not enabled")
    codes = recovery_codes(db, user)
    revoke_trust(db, user)
    db.commit()
    audit(user, "security.recovery_codes_regenerated")
    return {"recovery_codes": codes}


@router.get("/me/trusted-devices")
def list_devices(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return [{"id": d.id, "name": d.name, "created_at": d.created_at, "expires_at": d.expires_at}
            for d in db.query(models.TrustedDevice).filter(models.TrustedDevice.user_id == user.id,
                models.TrustedDevice.expires_at > now(), models.TrustedDevice.security_version == user.security_version).all()]


@router.delete("/me/trusted-devices/{device_id}")
def revoke_device(device_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    count = db.query(models.TrustedDevice).filter_by(user_id=user.id, id=device_id).delete()
    db.commit()
    if not count:
        raise HTTPException(404, "Device not found")
    audit(user, "security.device_revoked")
    return {"ok": True}


@router.delete("/me/trusted-devices")
def revoke_devices(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    revoke_trust(db, user)
    db.commit()
    audit(user, "security.devices_revoked")
    return {"ok": True}
