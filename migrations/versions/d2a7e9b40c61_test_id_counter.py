"""Persistent counter for optional sequential test case IDs."""
from alembic import op
import sqlalchemy as sa

revision = 'd2a7e9b40c61'
down_revision = 'c1f6b2a34d70'
branch_labels = None
depends_on = None


def upgrade():
    if 'test_id_counter' not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            'test_id_counter',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('last_value', sa.BigInteger(), nullable=False),
        )


def downgrade():
    op.drop_table('test_id_counter')
