"""Account approval, passkeys and trusted browsers."""
from alembic import op
import sqlalchemy as sa

revision = "f5b2c9d7a801"
down_revision = "e4f1a8c2d690"
branch_labels = None
depends_on = None


def upgrade():
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}
    if "account_status" not in columns:
        op.add_column("users", sa.Column("account_status", sa.String(16), nullable=False, server_default="active"))
    if "security_version" not in columns:
        op.add_column("users", sa.Column("security_version", sa.Integer(), nullable=False, server_default="0"))
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "login_settings" not in tables:
        table = op.create_table("login_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("password_enabled", sa.Boolean(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False))
        op.bulk_insert(table, [{"id": 1, "password_enabled": True, "revision": 0}])
    if "auth_challenges" not in tables:
        op.create_table("auth_challenges",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("purpose", sa.String(32), nullable=False),
            sa.Column("value", sa.Text(), nullable=False),
            sa.Column("expires_at", sa.BigInteger(), nullable=False),
            sa.Column("token_version", sa.Integer(), nullable=False),
            sa.Column("primary_method", sa.String(32), nullable=False),
            sa.Column("auth_time", sa.BigInteger(), nullable=False),
            sa.Column("used", sa.Boolean(), nullable=False))
        op.create_index("ix_auth_challenges_user_id", "auth_challenges", ["user_id"])
    if "passkeys" not in tables:
        op.create_table("passkeys",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("credential_id", sa.String(1400), nullable=False, unique=True),
            sa.Column("public_key", sa.Text(), nullable=False),
            sa.Column("sign_count", sa.BigInteger(), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("created_at", sa.BigInteger(), nullable=False))
        op.create_index("ix_passkeys_user_id", "passkeys", ["user_id"])
    if "trusted_devices" not in tables:
        op.create_table("trusted_devices",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("passkey_id", sa.String(64), nullable=False),
            sa.Column("secret_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("security_version", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("created_at", sa.BigInteger(), nullable=False),
            sa.Column("expires_at", sa.BigInteger(), nullable=False))
        op.create_index("ix_trusted_devices_user_id", "trusted_devices", ["user_id"])


def downgrade():
    for table in ("trusted_devices", "passkeys", "auth_challenges", "login_settings"):
        op.drop_table(table)
    with op.batch_alter_table("users") as batch:
        batch.drop_column("security_version")
        batch.drop_column("account_status")
