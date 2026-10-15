"""
oauth.py — GitHub (and shared) OAuth Authorization Code flow.

Endpoints:
  GET  /auth/oauth/github/redirect       — initiate GitHub OAuth
  GET  /auth/oauth/github/callback       — handle GitHub OAuth callback
  POST /auth/oauth/confirm-link          — confirm same-email account link with password

Shared logic:
  upsert_oauth_user()  — new-user provisioning / link-required gate / returning-user login
"""

import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..auth_utils import create_access_token, verify_password
from .auth import (
    _check_login_rate,
    _clear_login_failures,
    _login_key,
    _record_login_failure,
    _registration_open,
)
from ..audit_utils import (
    log_event,
    EVT_LOGIN_SUCCESS,
    EVT_USER_CREATED,
    EVT_OAUTH_LINK,
)

router = APIRouter(tags=["oauth"])

logger = logging.getLogger("thorotest.oauth")

# Stored in User.hashed_password for accounts that only ever sign in through a
# provider. It is deliberately not a valid hash of anything, so local login can
# never succeed against it — but it must be checked explicitly before being
# handed to passlib, which raises on an unrecognised hash format.
OAUTH_ONLY_SENTINEL = "!"


def _oauth_error_kind(exc: HTTPException) -> str:
    """Map an upsert rejection to the code the login screen renders."""
    return "no_account" if exc.status_code == 403 else "failed"

# ---------------------------------------------------------------------------
# Config from environment
# ---------------------------------------------------------------------------

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
BASE_URL = os.getenv("TESTHUB_BASE_URL", "http://localhost:8000")
OAUTH_PROVIDERS = ("github", "google", "mattermost")


def oauth_provider_enabled(db: Session, provider: str) -> bool:
    if provider not in OAUTH_PROVIDERS:
        return False
    setting = db.query(models.OAuthProviderSetting).filter_by(provider=provider).first()
    return setting.enabled if setting else True


def oauth_provider_configured(provider: str) -> bool:
    if provider == "github":
        return bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)
    if provider == "google":
        return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
    if provider == "mattermost":
        return mattermost_config() is not None
    return False


def oauth_provider_status(db: Session) -> dict:
    return {
        provider: {
            "enabled": oauth_provider_enabled(db, provider),
            "configured": oauth_provider_configured(provider),
        }
        for provider in OAUTH_PROVIDERS
    }


def mattermost_config():
    url = os.getenv("MATTERMOST_URL", "").strip().rstrip("/")
    client_id = os.getenv("MATTERMOST_CLIENT_ID", "").strip()
    secret = os.getenv("MATTERMOST_CLIENT_SECRET", "")
    try:
        parsed = urlsplit(url)
        parsed.port  # Validate malformed ports before enabling the provider.
    except ValueError:
        return None
    if not (url and client_id and secret and parsed.hostname):
        return None
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return None
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")
        and os.getenv("ENVIRONMENT") != "production"
    ):
        return None
    return url, client_id, secret


# ---------------------------------------------------------------------------
# State nonce helpers (CSRF protection)
# ---------------------------------------------------------------------------

def _new_state(db: Session, provider: str) -> str:
    """Generate a single-use OAuth state nonce, valid for 10 minutes."""
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    db.add(models.OAuthState(
        state_token=token,
        provider=provider,
        created_at=now.isoformat(),
        expires_at=(now + timedelta(minutes=10)).isoformat(),
    ))
    db.commit()
    return token


def _consume_state(db: Session, state: str, provider: str) -> None:
    """Validate and delete a state nonce. Raises HTTP 400 if invalid or expired."""
    now = datetime.now(timezone.utc).isoformat()
    row = db.query(models.OAuthState).filter(
        models.OAuthState.state_token == state,
        models.OAuthState.provider == provider,
        models.OAuthState.expires_at > now,
    ).first()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Username derivation
# ---------------------------------------------------------------------------

def _derive_username(base: str, db: Session) -> str:
    """Slugify base and find a unique username, appending _N or random hex on collision."""
    slug = re.sub(r"\W+", "_", base).strip("_").lower()[:28] or "user"
    candidate = slug
    for i in range(2, 20):
        if not db.query(models.User).filter(models.User.username == candidate).first():
            return candidate
        candidate = f"{slug}_{i}"
    return f"{slug}_{secrets.token_hex(4)}"


# ---------------------------------------------------------------------------
# User dict helper (mirrors auth.py login response shape)
# ---------------------------------------------------------------------------

def _user_dict(user: models.User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "language": user.language or "en",
        "totp_enabled": user.totp_enabled,
    }


# ---------------------------------------------------------------------------
# Core shared logic
# ---------------------------------------------------------------------------

def issue_session_or_2fa(user: models.User, ip: str | None, request=None, primary_method="password") -> dict:
    """
    Uniform 2FA chokepoint for OAuth session issuance.
    If the user has TOTP enabled, return a 2fa_required partial-token response
    (same shape/semantics as auth.py:57-60). Otherwise issue a full session.
    Returns the {"status": "ok", "token": ...} shape used by upsert_oauth_user.
    """
    from sqlalchemy.orm import object_session
    from ..auth_policy import begin_login
    return begin_login(object_session(user), user, request, primary_method)


def upsert_oauth_user(
    db: Session,
    provider: str,
    oauth_id: str | int,
    email: str | None,
    verified: bool,
    display_name: str | None,
    ip: str | None,
    *,
    allow_provisioning: bool = False,
    request: Request | None = None,
) -> dict:
    """
    Shared OAuth user resolution logic for all providers.

    Returns one of:
      {"status": "ok",            "token": <jwt>, "user": <dict>}
      {"status": "link_required", "pending_token": <str>}

    Raises HTTP 400 for missing/unverified email.
    """
    if not oauth_provider_enabled(db, provider):
        raise HTTPException(status_code=403, detail="This OAuth provider is disabled")

    # 1. Email required
    if not email:
        raise HTTPException(
            status_code=400,
            detail="We need a verified email from the provider to continue.",
        )
    # The configured Mattermost server is trusted for identity, without requiring
    # its email-verification flag. Existing-account linking still needs confirmation.
    if not verified and provider != "mattermost":
        raise HTTPException(
            status_code=400,
            detail="Your provider email must be verified to continue.",
        )

    oauth_id_str = str(oauth_id)

    # 3. Returning OAuth user — identity already linked
    identity = db.query(models.OAuthIdentity).filter(
        models.OAuthIdentity.provider == provider,
        models.OAuthIdentity.oauth_id == oauth_id_str,
    ).first()
    if identity:
        user = db.query(models.User).filter(models.User.id == identity.user_id).first()
        log_event(
            EVT_LOGIN_SUCCESS,
            actor_id=user.id,
            actor_email=user.email,
            description=f"{user.email} logged in via {provider} OAuth",
            ip_address=ip,
        )
        return issue_session_or_2fa(user, ip, request, provider)

    # 4. Same-email match — require explicit confirmation
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        now = datetime.now(timezone.utc)
        pending_token = secrets.token_urlsafe(32)
        pending = models.OAuthPendingLink(
            state_token=pending_token,
            provider=provider,
            oauth_id=oauth_id_str,
            email=email,
            display_name=display_name,
            user_id=existing.id,
            created_at=now.isoformat(),
            expires_at=(now + timedelta(minutes=20)).isoformat(),
        )
        db.add(pending)
        db.commit()
        return {"status": "link_required", "pending_token": pending_token}

    # 5. New user — provision with viewer role.
    # Honours the same ALLOW_OPEN_REGISTRATION gate as local registration: on a
    # closed instance, OAuth signs existing users in but never creates accounts,
    # so a public deployment can't be populated by anyone with a GitHub account.
    if not _registration_open() and not (provider == "mattermost" and allow_provisioning):
        raise HTTPException(
            status_code=403,
            detail="No ThoroTest account is linked to this identity, and self-registration is disabled.",
        )

    now = datetime.now(timezone.utc)
    username = _derive_username(display_name or email.split("@")[0], db)
    user = models.User(
        username=username,
        email=email,
        hashed_password=OAUTH_ONLY_SENTINEL,   # OAuth-only accounts cannot use local login
        display_name=display_name,
        role="viewer",
        account_status="pending" if provider == "mattermost" else "active",
    )
    db.add(user)
    db.flush()   # get user.id before creating identity

    identity = models.OAuthIdentity(
        user_id=user.id,
        provider=provider,
        oauth_id=oauth_id_str,
        email=email,
        created_at=now.isoformat(),
    )
    db.add(identity)
    db.commit()
    db.refresh(user)

    log_event(
        EVT_USER_CREATED,
        actor_id=user.id,
        actor_email=user.email,
        description=f"OAuth new user created via {provider}: {user.email}",
    )
    log_event(
        EVT_LOGIN_SUCCESS,
        actor_id=user.id,
        actor_email=user.email,
        description=f"{user.email} logged in via {provider} OAuth",
        ip_address=ip,
    )
    return issue_session_or_2fa(user, ip, request, provider)


# ---------------------------------------------------------------------------
# Mattermost uses the configured trusted server, never a request-supplied URL.
# Bind state to the initiating browser as well as the single-use DB nonce.
# ---------------------------------------------------------------------------

_MM_COOKIE = "thorotest_mm_state"
_MM_PATH = "/api/auth/oauth/mattermost"


@router.get("/auth/oauth/mattermost/redirect")
async def mattermost_redirect(db: Session = Depends(get_db)):
    if not oauth_provider_enabled(db, "mattermost"):
        raise HTTPException(403, "This OAuth provider is disabled")
    config = mattermost_config()
    if not config:
        raise HTTPException(503, "Mattermost login is not configured")
    url, client_id, _ = config
    state = _new_state(db, "mattermost")
    params = urlencode({
        "client_id": client_id, "response_type": "code", "state": state,
        "redirect_uri": f"{BASE_URL.rstrip('/')}{_MM_PATH}/callback",
    })
    response = RedirectResponse(f"{url}/oauth/authorize?{params}")
    response.set_cookie(_MM_COOKIE, state, max_age=600, httponly=True,
                        secure=BASE_URL.startswith("https://"), samesite="lax", path=_MM_PATH)
    return response


@router.get("/auth/oauth/mattermost/callback")
async def mattermost_callback(request: Request, db: Session = Depends(get_db),
                              code: str | None = None, state: str | None = None,
                              error: str | None = None):
    if not oauth_provider_enabled(db, "mattermost"):
        raise HTTPException(403, "This OAuth provider is disabled")

    def finish(fragment):
        response = RedirectResponse(f"{BASE_URL.rstrip('/')}/#{fragment}")
        response.delete_cookie(_MM_COOKIE, path=_MM_PATH)
        return response

    failed = "oauth-error=failed&provider=mattermost"
    def reject(reason):
        logger.warning("Mattermost OAuth failed reason=%s", reason)
        return finish(failed)

    cookie = request.cookies.get(_MM_COOKIE, "")
    if not state or not cookie or not secrets.compare_digest(state.encode(), cookie.encode()):
        return reject("browser_state_mismatch")
    try:
        _consume_state(db, state, "mattermost")
    except HTTPException:
        return reject("state_invalid_or_expired")
    if error:
        return finish("oauth-error=cancelled&provider=mattermost")
    config = mattermost_config()
    if not config or not code:
        return reject("configuration_or_code_missing")
    url, client_id, secret = config
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            token = await client.post(f"{url}/oauth/access_token", data={
                "grant_type": "authorization_code", "client_id": client_id,
                "client_secret": secret, "code": code,
                "redirect_uri": f"{BASE_URL.rstrip('/')}{_MM_PATH}/callback",
            })
            token.raise_for_status()
            access_token = token.json().get("access_token")
            if not isinstance(access_token, str) or not access_token:
                return reject("access_token_missing")
            profile = await client.get(f"{url}/api/v4/users/me",
                                       headers={"Authorization": f"Bearer {access_token}"})
            profile.raise_for_status()
            user = profile.json()
        if not isinstance(user.get("id"), str) or not user["id"] or user.get("delete_at", 0):
            return reject("profile_inactive_or_invalid")
        if not user.get("email"):
            return reject("email_missing")
        result = upsert_oauth_user(
            db, provider="mattermost", oauth_id=user["id"], email=user.get("email"),
            verified=user.get("email_verified") is True,
            display_name=user.get("username"),
            ip=request.client.host if request.client else None, allow_provisioning=True,
            request=request,
        )
    except HTTPException:
        return reject("account_rejected")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        # Never log token responses, authorization codes, or provider secrets.
        logger.warning("Mattermost OAuth exchange or profile validation failed")
        return finish(failed)
    if result["status"] == "pending_approval":
        return finish("pending-approval=1")
    if result["status"] == "2fa_required":
        return finish(f"oauth-2fa={result['partial_token']}")
    if result["status"] == "ok":
        return finish(f"token={result['token']}")
    return finish(f"oauth-confirm={result['pending_token']}")


# ---------------------------------------------------------------------------
# GitHub redirect
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/github/redirect")
async def github_redirect(db: Session = Depends(get_db)):
    """Initiate the GitHub OAuth Authorization Code flow."""
    if not oauth_provider_enabled(db, "github"):
        raise HTTPException(403, "This OAuth provider is disabled")
    state = _new_state(db, "github")
    params = urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": f"{BASE_URL}/api/auth/oauth/github/callback",
        "scope": "user:email",
        "state": state,
    })
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")


# ---------------------------------------------------------------------------
# GitHub callback
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/github/callback")
async def github_callback(
    db: Session = Depends(get_db),
    code: str = None,
    state: str = None,
    error: str = None,
    request: Request = None,
):
    """Handle the GitHub OAuth callback after user authorization."""
    if not oauth_provider_enabled(db, "github"):
        raise HTTPException(403, "This OAuth provider is disabled")
    # User denied consent
    if error:
        return RedirectResponse(f"{BASE_URL}/#oauth-error=cancelled&provider=github")

    # Validate state nonce
    try:
        _consume_state(db, state, "github")
    except HTTPException:
        return RedirectResponse(f"{BASE_URL}/#oauth-error=failed&provider=github")

    try:
        redirect_uri = f"{BASE_URL}/api/auth/oauth/github/callback"

        # Exchange code for access token
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": GITHUB_CLIENT_ID,
                    "client_secret": GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
            )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            logger.warning("github token exchange failed: %s", token_data)
            return RedirectResponse(f"{BASE_URL}/#oauth-error=failed&provider=github")

        github_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        # Fetch emails and user profile in parallel
        async with httpx.AsyncClient() as client:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers=github_headers,
            )
            user_resp = await client.get(
                "https://api.github.com/user",
                headers=github_headers,
            )

        emails_data = emails_resp.json()
        user_json = user_resp.json()

        # Find primary+verified email (always use /user/emails — /user.email may be null)
        primary_email_obj = next(
            (e for e in emails_data if e.get("primary") and e.get("verified")), None
        )
        primary_email = primary_email_obj["email"] if primary_email_obj else None

        display_name = user_json.get("name") or user_json.get("login")

    except Exception as exc:
        logger.warning("github network/parse error: %s", exc)
        return RedirectResponse(f"{BASE_URL}/#oauth-error=failed&provider=github")

    ip = request.client.host if request and request.client else None

    # upsert_oauth_user may raise HTTPException for unverified/missing email
    try:
        result = upsert_oauth_user(
            db,
            provider="github",
            oauth_id=user_json["id"],
            email=primary_email,
            verified=bool(primary_email_obj),
            display_name=display_name,
            ip=ip,
            request=request,
        )
    except HTTPException as exc:
        logger.warning("github upsert rejected: %s", exc.detail)
        return RedirectResponse(f"{BASE_URL}/#oauth-error={_oauth_error_kind(exc)}&provider=github")

    if result["status"] == "2fa_required":
        return RedirectResponse(f"{BASE_URL}/#oauth-2fa={result['partial_token']}")
    elif result["status"] == "ok":
        return RedirectResponse(f"{BASE_URL}/#token={result['token']}")
    else:
        return RedirectResponse(f"{BASE_URL}/#oauth-confirm={result['pending_token']}")


# ---------------------------------------------------------------------------
# Google redirect
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/google/redirect")
async def google_redirect(db: Session = Depends(get_db)):
    """Initiate the Google OAuth Authorization Code flow."""
    if not oauth_provider_enabled(db, "google"):
        raise HTTPException(403, "This OAuth provider is disabled")
    state = _new_state(db, "google")
    params = urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": f"{BASE_URL}/api/auth/oauth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


# ---------------------------------------------------------------------------
# Google callback
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/google/callback")
async def google_callback(
    db: Session = Depends(get_db),
    code: str = None,
    state: str = None,
    error: str = None,
    request: Request = None,
):
    """Handle the Google OAuth callback after user authorization."""
    if not oauth_provider_enabled(db, "google"):
        raise HTTPException(403, "This OAuth provider is disabled")
    # User denied consent
    if error:
        return RedirectResponse(f"{BASE_URL}/#oauth-error=cancelled&provider=google")

    # Validate state nonce
    try:
        _consume_state(db, state, "google")
    except HTTPException:
        return RedirectResponse(f"{BASE_URL}/#oauth-error=failed&provider=google")

    try:
        redirect_uri = f"{BASE_URL}/api/auth/oauth/google/callback"

        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )

        id_token_raw = r.json()["id_token"]
        # Signature verification is unnecessary for server-side code exchange —
        # the token came directly from Google's token endpoint over HTTPS.
        claims = jose_jwt.decode(id_token_raw, options={"verify_signature": False})

        ip = request.client.host if request and request.client else None

    except Exception as exc:
        logger.warning("google network/parse error: %s", exc)
        return RedirectResponse(f"{BASE_URL}/#oauth-error=failed&provider=google")

    # upsert_oauth_user may raise HTTPException for unverified/missing email
    try:
        result = upsert_oauth_user(
            db,
            provider="google",
            oauth_id=claims["sub"],
            email=claims.get("email"),
            verified=bool(claims.get("email_verified")),
            display_name=claims.get("name"),
            ip=ip,
            request=request,
        )
    except HTTPException as exc:
        logger.warning("google upsert rejected: %s", exc.detail)
        return RedirectResponse(f"{BASE_URL}/#oauth-error={_oauth_error_kind(exc)}&provider=google")

    if result["status"] == "2fa_required":
        return RedirectResponse(f"{BASE_URL}/#oauth-2fa={result['partial_token']}")
    elif result["status"] == "ok":
        return RedirectResponse(f"{BASE_URL}/#token={result['token']}")
    else:
        return RedirectResponse(f"{BASE_URL}/#oauth-confirm={result['pending_token']}")


# ---------------------------------------------------------------------------
# Confirm-link endpoint
# ---------------------------------------------------------------------------

class ConfirmLinkPayload(BaseModel):
    pending_token: str
    password: str


@router.post("/auth/oauth/confirm-link")
def confirm_link(payload: ConfirmLinkPayload, db: Session = Depends(get_db), request: Request = None):
    """
    Complete the same-email account-link flow.

    Validates the pending-link token, checks the password, creates OAuthIdentity,
    and issues a JWT.
    """
    now = datetime.now(timezone.utc).isoformat()

    row = db.query(models.OAuthPendingLink).filter(
        models.OAuthPendingLink.state_token == payload.pending_token,
    ).first()

    if not row or row.expires_at <= now:
        raise HTTPException(
            status_code=400,
            detail="Link session expired. Please try signing in again.",
        )

    if not oauth_provider_enabled(db, row.provider):
        raise HTTPException(status_code=403, detail="This OAuth provider is disabled")

    user = db.query(models.User).filter(models.User.id == row.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Link session expired. Please try signing in again.")
    if user.account_status != "active":
        raise HTTPException(403, "Account is not approved")

    # OAuth-only accounts carry a sentinel instead of a real hash. passlib raises
    # UnknownHashError on it rather than returning False, which surfaced as an
    # uncaught 500 and left the user permanently unable to link a second provider.
    if user.hashed_password == OAUTH_ONLY_SENTINEL:
        raise HTTPException(
            status_code=400,
            detail="This account signs in with a social provider and has no password. "
                   "Sign in with your original provider, then link this one from Settings.",
        )

    # Unlimited guesses against a 20-minute token is a password-brute-force
    # oracle for a known account; every other password check here is throttled.
    ip = request.client.host if request and request.client else None
    rate_key = "oauthlink|" + _login_key(ip, user.email)
    _check_login_rate(rate_key)

    try:
        password_ok = verify_password(payload.password, user.hashed_password)
    except Exception:
        # Malformed or unrecognised stored hash — treat as a failed attempt
        # rather than a 500.
        logger.warning("unusable password hash for user id=%s during OAuth link", user.id)
        password_ok = False

    if not password_ok:
        _record_login_failure(rate_key)
        raise HTTPException(status_code=401, detail="Incorrect password.")

    _clear_login_failures(rate_key)

    # Create the durable identity link
    link_now = datetime.now(timezone.utc).isoformat()
    identity = models.OAuthIdentity(
        user_id=row.user_id,
        provider=row.provider,
        oauth_id=row.oauth_id,
        email=row.email,
        created_at=link_now,
    )
    db.add(identity)
    db.delete(row)
    db.commit()
    db.refresh(identity)

    log_event(
        EVT_OAUTH_LINK,
        actor_id=user.id,
        actor_email=user.email,
        description=f"{user.email} linked {row.provider} OAuth identity",
        target_type="oauth_identity",
        target_id=str(identity.id),
    )

    ip = request.client.host if request and request.client else None
    return issue_session_or_2fa(user, ip, request, row.provider)
