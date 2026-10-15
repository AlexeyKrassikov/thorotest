from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text, inspect


def test_existing_accounts_keep_role_and_access_after_migration(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "e4f1a8c2d690")
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (username, email, hashed_password, role, token_version) VALUES (:name, :email, :hash, :role, 0)"),
                     {"name": "existing", "email": "existing@example.test", "hash": "!", "role": "manager"})
    command.upgrade(config, "head")
    with engine.connect() as conn:
        user = conn.execute(text("SELECT role, account_status, security_version FROM users WHERE username='existing'")).one()
        assert tuple(user) == ("manager", "active", 0)
        assert conn.execute(text("SELECT password_enabled FROM login_settings WHERE id=1")).scalar() == 1
    assert {"passkeys", "auth_challenges", "trusted_devices"} <= set(inspect(engine).get_table_names())
    engine.dispose()
