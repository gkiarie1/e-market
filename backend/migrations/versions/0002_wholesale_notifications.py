"""Independent wholesale prices and order notifications."""
from alembic import op
import sqlalchemy as sa
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('listings', sa.Column('wholesale_price', sa.Numeric(12, 2), nullable=True))
    op.add_column('listings', sa.Column('wholesale_minimum', sa.Integer(), server_default='1', nullable=False))
    op.execute('UPDATE listings SET wholesale_price = price, wholesale_minimum = minimum WHERE bulk = true')
    op.create_check_constraint('ck_wholesale_price', 'listings', 'wholesale_price IS NULL OR wholesale_price > 0')
    op.create_check_constraint('ck_wholesale_minimum', 'listings', 'wholesale_minimum >= 1')
    op.create_table('notifications', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('title', sa.String(120), nullable=False), sa.Column('body', sa.String(500), nullable=False), sa.Column('order_id', sa.String(36), sa.ForeignKey('orders.id'), nullable=False), sa.Column('date', sa.DateTime(timezone=True), nullable=False), sa.Column('read_at', sa.DateTime(timezone=True)))
    op.create_table('chat_reads', sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True), sa.Column('contact_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True), sa.Column('date', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])


def downgrade():
    op.drop_table('chat_reads')
    op.drop_table('notifications')
    op.drop_constraint('ck_wholesale_price', 'listings')
    op.drop_constraint('ck_wholesale_minimum', 'listings')
    op.drop_column('listings', 'wholesale_minimum')
    op.drop_column('listings', 'wholesale_price')
