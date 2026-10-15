"""Project membership and test case editor."""
from alembic import op
import sqlalchemy as sa

revision = "a6c3d8e9f102"
down_revision = "f5b2c9d7a801"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if "project_members" not in sa.inspect(bind).get_table_names():
        op.create_table("project_members",
            sa.Column("project_id", sa.String(255), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("role", sa.String(16), nullable=False))
    additions = {
        "tests": [sa.Column("author", sa.String(255)),
                  sa.Column("description", sa.Text(), nullable=False, server_default=""),
                  sa.Column("prerequisites", sa.Text(), nullable=False, server_default=""),
                  sa.Column("revision", sa.Integer(), nullable=False, server_default="0")],
        "users": [sa.Column("appearance", sa.JSON())],
        "test_steps": [sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false())],
    }
    for table, columns in additions.items():
        existing = {c["name"] for c in sa.inspect(bind).get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)


def downgrade():
    op.drop_table("project_members")
    for table, names in {"tests": ["author", "description", "prerequisites", "revision"],
                         "users": ["appearance"], "test_steps": ["archived"]}.items():
        with op.batch_alter_table(table) as batch:
            for name in names:
                batch.drop_column(name)
