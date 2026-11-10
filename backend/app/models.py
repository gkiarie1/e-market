from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import String, DateTime, Float, Integer, Numeric, ForeignKey, CheckConstraint, UniqueConstraint, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


def new_id():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))
    phone: Mapped[str] = mapped_column(String(30))
    alternate: Mapped[str] = mapped_column(String(30), default='')
    area: Mapped[str] = mapped_column(String(100))
    produce: Mapped[str] = mapped_column(String(300), default='')
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    location_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("role IN ('buyer', 'farmer')"),
        CheckConstraint('latitude BETWEEN -90 AND 90'),
        CheckConstraint('longitude BETWEEN -180 AND 180'),
        CheckConstraint('(latitude IS NULL) = (longitude IS NULL)'),
        Index('ix_users_coordinates', 'latitude', 'longitude'),
    )


class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Listing(Base):
    __tablename__ = 'listings'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    name: Mapped[str] = mapped_column(String(120))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    unit: Mapped[str] = mapped_column(String(30))
    bulk: Mapped[bool]
    minimum: Mapped[int] = mapped_column(Integer, default=1)
    image: Mapped[str] = mapped_column(String(255))
    farmer: Mapped[User] = relationship()
    __table_args__ = (CheckConstraint('price > 0'), CheckConstraint('quantity >= 0'), CheckConstraint('minimum >= 1'))


class Photo(Base):
    __tablename__ = 'photos'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    path: Mapped[str] = mapped_column(String(255), unique=True)


class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    buyer_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    request_key: Mapped[str] = mapped_column(String(100))
    total: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    payment: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(50), default='Awaiting seller confirmation')
    items: Mapped[list['OrderItem']] = relationship(cascade='all, delete-orphan', lazy='selectin')
    __table_args__ = (UniqueConstraint('buyer_id', 'request_key', 'farmer_id'), CheckConstraint('total > 0'))


class OrderItem(Base):
    __tablename__ = 'order_items'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id'), index=True)
    listing_id: Mapped[str] = mapped_column(ForeignKey('listings.id'), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    snapshot: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (CheckConstraint('quantity > 0'), CheckConstraint('price > 0'))


class Review(Base):
    __tablename__ = 'reviews'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    author_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String(2000))
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    __table_args__ = (UniqueConstraint('author_id', 'farmer_id'), CheckConstraint('rating BETWEEN 1 AND 5'))
