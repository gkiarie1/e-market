"""Initial marketplace schema, frozen independently of future ORM changes."""
from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE TABLE users (\n\tid VARCHAR(36) NOT NULL, \n\temail VARCHAR(254) NOT NULL, \n\tpassword_hash VARCHAR(256) NOT NULL, \n\tname VARCHAR(100) NOT NULL, \n\trole VARCHAR(10) NOT NULL, \n\tphone VARCHAR(30) NOT NULL, \n\talternate VARCHAR(30) NOT NULL, \n\tarea VARCHAR(100) NOT NULL, \n\tproduce VARCHAR(300) NOT NULL, \n\tlatitude FLOAT, \n\tlongitude FLOAT, \n\tlocation_consent_at TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tCHECK (role IN ('buyer', 'farmer')), \n\tCHECK (latitude BETWEEN -90 AND 90), \n\tCHECK (longitude BETWEEN -180 AND 180), \n\tCHECK ((latitude IS NULL) = (longitude IS NULL)), \n\tUNIQUE (email)\n)")
    op.execute('CREATE INDEX ix_users_coordinates ON users (latitude, longitude)')
    op.execute('CREATE TABLE auth_sessions (\n\ttoken_hash VARCHAR(64) NOT NULL, \n\tuser_id VARCHAR(36) NOT NULL, \n\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (token_hash), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)')
    op.execute('CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id)')
    op.execute('CREATE TABLE listings (\n\tid VARCHAR(36) NOT NULL, \n\tfarmer_id VARCHAR(36) NOT NULL, \n\tname VARCHAR(120) NOT NULL, \n\tprice NUMERIC(12, 2) NOT NULL, \n\tquantity INTEGER NOT NULL, \n\tunit VARCHAR(30) NOT NULL, \n\tbulk BOOLEAN NOT NULL, \n\tminimum INTEGER NOT NULL, \n\timage VARCHAR(255) NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (price > 0), \n\tCHECK (quantity >= 0), \n\tCHECK (minimum >= 1), \n\tFOREIGN KEY(farmer_id) REFERENCES users (id)\n)')
    op.execute('CREATE INDEX ix_listings_farmer_id ON listings (farmer_id)')
    op.execute('CREATE TABLE orders (\n\tid VARCHAR(36) NOT NULL, \n\tbuyer_id VARCHAR(36) NOT NULL, \n\tfarmer_id VARCHAR(36) NOT NULL, \n\trequest_key VARCHAR(100) NOT NULL, \n\ttotal NUMERIC(20, 2) NOT NULL, \n\tdate TIMESTAMP WITH TIME ZONE NOT NULL, \n\tpayment VARCHAR(60) NOT NULL, \n\tstatus VARCHAR(50) NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (buyer_id, request_key, farmer_id), \n\tCHECK (total > 0), \n\tFOREIGN KEY(buyer_id) REFERENCES users (id), \n\tFOREIGN KEY(farmer_id) REFERENCES users (id)\n)')
    op.execute('CREATE INDEX ix_orders_buyer_id ON orders (buyer_id)')
    op.execute('CREATE INDEX ix_orders_farmer_id ON orders (farmer_id)')
    op.execute('CREATE TABLE photos (\n\tid VARCHAR(36) NOT NULL, \n\towner_id VARCHAR(36) NOT NULL, \n\tpath VARCHAR(255) NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(owner_id) REFERENCES users (id), \n\tUNIQUE (path)\n)')
    op.execute('CREATE TABLE reviews (\n\tid VARCHAR(36) NOT NULL, \n\tauthor_id VARCHAR(36) NOT NULL, \n\tfarmer_id VARCHAR(36) NOT NULL, \n\trating INTEGER NOT NULL, \n\ttext VARCHAR(2000) NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (author_id, farmer_id), \n\tCHECK (rating BETWEEN 1 AND 5), \n\tFOREIGN KEY(author_id) REFERENCES users (id), \n\tFOREIGN KEY(farmer_id) REFERENCES users (id)\n)')
    op.execute('CREATE INDEX ix_reviews_author_id ON reviews (author_id)')
    op.execute('CREATE INDEX ix_reviews_farmer_id ON reviews (farmer_id)')
    op.execute('CREATE TABLE order_items (\n\tid VARCHAR(36) NOT NULL, \n\torder_id VARCHAR(36) NOT NULL, \n\tlisting_id VARCHAR(36) NOT NULL, \n\tquantity INTEGER NOT NULL, \n\tprice NUMERIC(12, 2) NOT NULL, \n\tsnapshot JSON NOT NULL, \n\tPRIMARY KEY (id), \n\tCHECK (quantity > 0), \n\tCHECK (price > 0), \n\tFOREIGN KEY(order_id) REFERENCES orders (id), \n\tFOREIGN KEY(listing_id) REFERENCES listings (id)\n)')
    op.execute('CREATE INDEX ix_order_items_listing_id ON order_items (listing_id)')
    op.execute('CREATE INDEX ix_order_items_order_id ON order_items (order_id)')


def downgrade():
    op.drop_table('order_items')
    op.drop_table('reviews')
    op.drop_table('photos')
    op.drop_table('orders')
    op.drop_table('listings')
    op.drop_table('auth_sessions')
    op.drop_table('users')
