from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from .. import models
from ..schemas import UserOut, AdminUserCreate, UserRoleUpdate
from ..auth_utils import require_role, hash_password, validate_password
from ..audit_utils import (
    log_event,
    EVT_USER_CREATED,
    EVT_USER_DELETED,
    EVT_ROLE_CHANGED,
    EVT_OAUTH_PROVIDER_SETTING_CHANGED,
)

router = APIRouter(tags=["admin"])

ADMIN_ONLY = require_role("admin")

VALID_ROLES = {"admin", "manager", "tester", "viewer"}
OAUTH_PROVIDERS = {"github", "google", "mattermost"}


class OAuthProviderSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: StrictBool


@router.get("/admin/oauth-providers")
def list_oauth_providers(
    db: Session = Depends(get_db),
    _: models.User = ADMIN_ONLY,
):
    from .oauth import oauth_provider_status

    return oauth_provider_status(db)


@router.patch("/admin/oauth-providers/{provider}")
def update_oauth_provider(
    provider: str,
    payload: OAuthProviderSettingUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = ADMIN_ONLY,
):
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="OAuth provider not found")

    setting = db.query(models.OAuthProviderSetting).filter_by(provider=provider).first()
    if setting is None:
        try:
            with db.begin_nested():
                setting = models.OAuthProviderSetting(provider=provider, enabled=payload.enabled)
                db.add(setting)
                db.flush()
        except IntegrityError:
            setting = db.query(models.OAuthProviderSetting).filter_by(provider=provider).first()
            if setting is None:
                raise
            setting.enabled = payload.enabled
    else:
        setting.enabled = payload.enabled
    db.commit()

    log_event(
        EVT_OAUTH_PROVIDER_SETTING_CHANGED,
        actor_id=current_user.id,
        actor_email=current_user.email,
        description=f"{current_user.email} {'enabled' if payload.enabled else 'disabled'} {provider} OAuth",
        target_type="oauth_provider",
        target_id=provider,
    )
    from .oauth import oauth_provider_configured

    return {"enabled": payload.enabled, "configured": oauth_provider_configured(provider)}


@router.get("/admin/users", response_model=list[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: models.User = ADMIN_ONLY,
):
    """List all users — admin only."""
    return db.query(models.User).order_by(models.User.display_name).all()


@router.post("/admin/users", response_model=UserOut, status_code=201)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = ADMIN_ONLY,
):
    """Create a new user with an explicit role — admin only."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role. Must be one of: {sorted(VALID_ROLES)}")
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    validate_password(payload.password, email=payload.email, username=payload.username)
    user = models.User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_event(
        EVT_USER_CREATED,
        actor_id=current_user.id,
        actor_email=current_user.email,
        description=f"{current_user.email} created user {user.email} with role {user.role}",
        target_type="user",
        target_id=str(user.id),
    )
    return user


@router.patch("/admin/users/{user_id}/role", response_model=UserOut)
def change_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = ADMIN_ONLY,
):
    """Change a user's role — admin only."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role. Must be one of: {sorted(VALID_ROLES)}")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    log_event(
        EVT_ROLE_CHANGED,
        actor_id=current_user.id,
        actor_email=current_user.email,
        description=f"{current_user.email} changed {user.email}'s role to {user.role}",
        target_type="user",
        target_id=str(user.id),
    )
    return user


@router.delete("/admin/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = ADMIN_ONLY,
):
    """Delete a user — admin only. Cannot delete self."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    deleted_email = user.email   # capture before delete
    db.delete(user)
    db.commit()
    log_event(
        EVT_USER_DELETED,
        actor_id=current_user.id,
        actor_email=current_user.email,
        description=f"{current_user.email} deleted user {deleted_email}",
        target_type="user",
        target_id=str(user_id),
    )
