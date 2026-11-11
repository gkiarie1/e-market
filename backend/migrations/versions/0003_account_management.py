"""Account removal and durable external-data cleanup."""
from alembic import op
import sqlalchemy as sa
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table('account_cleanup',
                    sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True),
                    sa.Column('photos', sa.JSON(), nullable=False))


def downgrade():
    op.drop_table('account_cleanup')
    op.drop_column('users', 'deleted_at')
