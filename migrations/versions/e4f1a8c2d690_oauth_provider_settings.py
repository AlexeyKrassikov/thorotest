"""Persist enabled state for OAuth providers."""
from alembic import op
import sqlalchemy as sa


revision = "e4f1a8c2d690"
down_revision = "d2a7e9b40c61"
branch_labels = None
depends_on = None


def upgrade():
    if "oauth_provider_settings" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "oauth_provider_settings",
            sa.Column("provider", sa.String(length=32), primary_key=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade():
    if "oauth_provider_settings" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("oauth_provider_settings")
