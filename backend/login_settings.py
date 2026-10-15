"""Serialized login-policy updates and administrator lockout protection."""
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from . import models


def password_enabled(db):
    row = db.get(models.LoginSettings, 1)
    return row.password_enabled if row else True


def lock_settings(db):
    if db.get(models.LoginSettings, 1) is None:
        try:
            with db.begin_nested():
                db.add(models.LoginSettings(id=1, password_enabled=True, revision=0))
                db.flush()
        except IntegrityError:
            pass
    # UPDATE also serializes writers on SQLite, where FOR UPDATE is ignored.
    db.query(models.LoginSettings).filter_by(id=1).update(
        {models.LoginSettings.revision: models.LoginSettings.revision + 1}, synchronize_session=False)
    return db.query(models.LoginSettings).populate_existing().filter_by(id=1).one()


def ensure_admin_login(db, acting_user=None):
    from .routers.oauth import oauth_provider_status
    if password_enabled(db):
        from .auth_utils import pwd_context
        admins = db.query(models.User).filter_by(role="admin", account_status="active").all()
        if any(pwd_context.identify(admin.hashed_password) for admin in admins):
            return
    status = oauth_provider_status(db)
    providers = [name for name, flags in status.items() if flags["enabled"] and flags["configured"]]
    query = db.query(models.OAuthIdentity).join(models.User).filter(
        models.User.role == "admin", models.User.account_status == "active",
        models.OAuthIdentity.provider.in_(providers))
    if acting_user is not None:
        query = query.filter(models.User.id == acting_user.id)
    if query.first() is None:
        db.rollback()
        raise HTTPException(409, "Keep an enabled login provider linked to an active administrator")


def ensure_active_admin(db):
    if not db.query(models.User).filter_by(role="admin", account_status="active").first():
        db.rollback()
        raise HTTPException(409, "Cannot remove the last active administrator")
    ensure_admin_login(db)
