import asyncio
from contextlib import suppress
from collections import defaultdict
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from uuid import uuid4
import hashlib
import io
import math
import warnings

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select, func, or_, and_, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from . import chat
from .accounts import router as accounts_router
from .account_cleanup import cleanup_loop
from .config import settings
from .profiles import profile_json
from .db import database, engine
from .models import User, AuthSession, Listing, Photo, Order, OrderItem, Review, Notification, ChatRead, now
from .schemas import Register, Login, ListingInput, LocationUpdate, Checkout, ReviewInput, ConversationInput, StatusInput, ChatReadInput
from .security import passwords, dummy_hash, current_user, create_session, bearer, token_hash

config = settings()
uploads = Path(config.upload_dir)
uploads.mkdir(parents=True, exist_ok=True)
Image.MAX_IMAGE_PIXELS = 20_000_000


@asynccontextmanager
async def lifespan(app):
    # Schema changes are explicit Alembic migrations, never implicit startup mutations.
    worker = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker
        engine.dispose()


app = FastAPI(title='Shamba Market API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins.split(','), allow_methods=['GET', 'POST', 'PATCH', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])
app.include_router(accounts_router)
app.mount('/uploads', StaticFiles(directory=uploads), name='uploads')



def listing_json(listing, distance_km=None, average=0, purchased=0):
    farmer = listing.farmer
    result = {'id': listing.id, 'farmerId': farmer.id, 'seller': farmer.name, 'name': listing.name, 'area': farmer.area,
              'phone': farmer.phone, 'alternate': farmer.alternate, 'price': float(listing.price), 'quantity': listing.quantity,
              'unit': listing.unit, 'bulk': listing.bulk, 'minimum': listing.minimum, 'image': config.public_base_url.rstrip('/') + listing.image,
              'wholesalePrice': float(listing.wholesale_price) if listing.wholesale_price is not None else None, 'wholesaleMinimum': listing.wholesale_minimum, 'wholesaleOnly': listing.bulk, 'emoji': '🌱', 'rating': float(average or 0), 'purchaseCount': int(purchased or 0)}
    # Exact farm coordinates never leave the server in public listings.
    if distance_km is not None:
        result['distanceKm'] = math.ceil(distance_km)
    return result


def order_json(order):
    return {'id': order.id, 'buyerId': order.buyer_id, 'buyerName': order.buyer.name, 'items': [{'listing': item.snapshot, 'quantity': item.quantity, 'unitPrice': float(item.price)} for item in order.items],
            'total': float(order.total), 'date': order.date.isoformat(), 'payment': order.payment, 'status': order.status}


def farmer_only(user):
    if user.role != 'farmer':
        raise HTTPException(403, 'A farmer account is required.')


@app.get('/health')
def health(db: Session = Depends(database)):
    db.execute(select(1))
    return {'status': 'ok', 'apiVersion': 3}


@app.post('/auth/register', status_code=201)
def register(data: Register, db: Session = Depends(database)):
    user = User(email=str(data.email).lower(), password_hash=passwords.hash(data.password), name=data.name, role=data.role,
                phone=data.phone, alternate=data.alternate, area=data.area, produce=data.produce,
                latitude=data.latitude, longitude=data.longitude, location_consent_at=now() if data.locationConsent else None)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'An account with this email already exists.')
    token = create_session(db, user)
    return {'token': token, 'profile': profile_json(user)}


@app.post('/auth/login')
def login(data: Login, db: Session = Depends(database)):
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = passwords.verify(data.password, user.password_hash if user else dummy_hash)
    if not user or user.deleted_at is not None or not valid:
        raise HTTPException(401, 'Email or password is incorrect.')
    return {'token': create_session(db, user), 'profile': profile_json(user)}


@app.post('/auth/logout', status_code=204)
def logout(user: User = Depends(current_user), credentials=Depends(bearer), db: Session = Depends(database)):
    db.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(credentials.credentials)))
    db.commit()


@app.get('/me')
def me(user: User = Depends(current_user)):
    return profile_json(user)


@app.patch('/me/location')
def update_location(data: LocationUpdate, user: User = Depends(current_user), db: Session = Depends(database)):
    farmer_only(user)
    user.latitude, user.longitude, user.area = data.latitude, data.longitude, data.area
    user.location_consent_at = now()
    db.commit()
    return profile_json(user)


@app.delete('/me/location', status_code=204)
def remove_location(user: User = Depends(current_user), db: Session = Depends(database)):
    user.latitude = user.longitude = user.location_consent_at = None
    db.commit()


@app.post('/photos', status_code=201)
def photo(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(database)):
    farmer_only(user)
    content = file.file.read(8 * 1024 * 1024 + 1)
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(413, 'Photo must be smaller than 8 MB.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(content))
            image.load()
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((1600, 1600))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Use a valid photo with at most 20 million pixels.')
    name = f'{uuid4()}.jpg'
    image.save(uploads / name, format='JPEG', quality=85)  # Re-encoding strips EXIF, including GPS metadata.
    entry = Photo(owner_id=user.id, path=f'/uploads/{name}')
    db.add(entry)
    db.commit()
    return {'path': entry.path}


@app.post('/listings', status_code=201)
def create_listing(data: ListingInput, user: User = Depends(current_user), db: Session = Depends(database)):
    farmer_only(user)
    if user.latitude is None:
        raise HTTPException(422, 'Set your farm location before publishing produce.')
    owned = db.scalar(select(Photo).where(Photo.owner_id == user.id, Photo.path == data.image))
    if not owned:
        raise HTTPException(422, 'Upload your own produce photo first.')
    listing = Listing(farmer_id=user.id, **data.model_dump())
    db.add(listing)
    db.commit()
    return listing_json(listing)


@app.get('/listings')
def listings(q: str = Query(default='', max_length=120), sort: str = Query(default='rating', pattern='^(rating|popular)$'),
             latitude: float | None = Query(default=None, ge=-90, le=90), longitude: float | None = Query(default=None, ge=-180, le=180),
             radiusKm: float = Query(default=30, ge=1, le=200), area: str = Query(default='', max_length=100),
             mine: bool = False, offset: int = Query(default=0, ge=0), limit: int = Query(default=200, ge=1, le=200),
             user: User = Depends(current_user), db: Session = Depends(database)):
    if (latitude is None) != (longitude is None):
        raise HTTPException(422, 'Supply both latitude and longitude.')
    averages = select(Review.farmer_id, func.avg(Review.rating).label('rating')).group_by(Review.farmer_id).subquery()
    purchases = select(Order.farmer_id, func.count(Order.id).label('purchases')).where(Order.status == 'Completed').group_by(Order.farmer_id).subquery()
    # Great-circle distance is calculated by PostgreSQL; coordinates are never returned.
    km = None
    if latitude is not None:
        dot = func.sin(func.radians(latitude)) * func.sin(func.radians(User.latitude)) + func.cos(func.radians(latitude)) * func.cos(func.radians(User.latitude)) * func.cos(func.radians(User.longitude - longitude))
        km = 6371 * func.acos(func.least(1.0, func.greatest(-1.0, dot)))
    statement = select(Listing, averages.c.rating, purchases.c.purchases, km if km is not None else func.nullif(1, 1)).join(User, Listing.farmer_id == User.id).outerjoin(averages, averages.c.farmer_id == User.id).outerjoin(purchases, purchases.c.farmer_id == User.id).options(joinedload(Listing.farmer))
    if mine:
        statement = statement.where(Listing.farmer_id == user.id)
    else:
        statement = statement.where(Listing.quantity >= Listing.minimum)
    if q:
        statement = statement.where(or_(Listing.name.icontains(q, autoescape=True), User.name.icontains(q, autoescape=True), User.area.icontains(q, autoescape=True)))
    if km is not None:
        statement = statement.where(User.latitude.is_not(None), User.longitude.is_not(None), km <= radiusKm)
    elif area:
        statement = statement.where(func.lower(User.area) == area.lower())
    ranking = averages.c.rating if sort == 'rating' else purchases.c.purchases
    rows = db.execute(statement.order_by(ranking.desc().nulls_last(), Listing.id).offset(offset).limit(limit)).all()
    return [listing_json(item, nearby, average, purchased) for item, average, purchased, nearby in rows]


@app.get('/orders')
def orders(user: User = Depends(current_user), db: Session = Depends(database)):
    records = db.scalars(select(Order).options(joinedload(Order.buyer)).where(or_(Order.buyer_id == user.id, Order.farmer_id == user.id)).order_by(Order.date.desc()).limit(200)).all()
    return [order_json(order) for order in records]


@app.post('/orders', status_code=201)
def checkout(data: Checkout, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role != 'buyer':
        raise HTTPException(403, 'A buyer account is required.')
    # Serialize retries of the same checkout before checking the idempotency key.
    lock_key = int.from_bytes(hashlib.sha256(f'{user.id}:{data.requestKey}'.encode()).digest()[:8], signed=True)
    db.execute(select(func.pg_advisory_xact_lock(lock_key)))
    previous = db.scalars(select(Order).where(Order.buyer_id == user.id, Order.request_key == data.requestKey)).all()
    if previous:
        expected = {item.listingId: item.quantity for item in data.items}
        actual = {item.listing_id: item.quantity for order in previous for item in order.items}
        if actual != expected or any(order.payment != data.payment for order in previous):
            raise HTTPException(409, 'Checkout key was already used for another basket.')
        return [order_json(order) for order in previous]
    requested = {item.listingId: item.quantity for item in data.items}
    farmer_ids = select(Listing.farmer_id).where(Listing.id.in_(sorted(requested)))
    farmers = db.scalars(select(User).where(User.id.in_(farmer_ids)).order_by(User.id).with_for_update(read=True)).all()
    if any(farmer.deleted_at is not None for farmer in farmers):
        raise HTTPException(409, 'A seller is no longer available.')
    rows = db.scalars(select(Listing).where(Listing.id.in_(sorted(requested))).order_by(Listing.id).with_for_update()).all()
    if len(rows) != len(requested):
        raise HTTPException(409, 'Some produce is no longer available.')
    groups = defaultdict(list)
    for listing in rows:
        amount = requested[listing.id]
        if amount < listing.minimum or amount > listing.quantity:
            raise HTTPException(409, f'{listing.name}: quantity exceeds available stock or is below the bulk minimum.')
        groups[listing.farmer_id].append((listing, amount))
    created = []
    for farmer_id, items in groups.items():
        order = Order(buyer_id=user.id, farmer_id=farmer_id, request_key=data.requestKey, payment=data.payment,
                      total=sum((unit_price(listing, amount) * amount for listing, amount in items), Decimal(0)))
        order.items = [OrderItem(listing_id=listing.id, quantity=amount, price=unit_price(listing, amount), snapshot={**listing_json(listing), "price": float(unit_price(listing, amount))}) for listing, amount in items]
        for listing, amount in items:
            listing.quantity -= amount
        db.add(order)
        created.append(order)
        db.flush()
        db.add(Notification(user_id=farmer_id, order_id=order.id, title='New order request', body=f'{user.name} requested produce worth KSh {order.total:,.2f}.'))
        db.add(Notification(user_id=user.id, order_id=order.id, title='Order request sent', body='Your produce is reserved. Arrange collection and payment with the farmer.'))
    db.commit()
    return [order_json(order) for order in created]


@app.patch('/orders/{order_id}')
def order_status(order_id: str, data: StatusInput, user: User = Depends(current_user), db: Session = Depends(database)):
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if not order or user.id not in [order.buyer_id, order.farmer_id]:
        raise HTTPException(404, 'Order not found.')
    allowed = {'Awaiting seller confirmation': {'Confirmed', 'Cancelled'}, 'Confirmed': {'Completed', 'Cancelled'}}
    if data.status not in allowed.get(order.status, set()):
        raise HTTPException(409, 'This order status cannot be changed that way.')
    if data.status != 'Cancelled' and user.id != order.farmer_id:
        raise HTTPException(403, 'Only the farmer can confirm or complete the order.')
    if data.status == 'Cancelled':
        ids = sorted(item.listing_id for item in order.items)
        rows = db.scalars(select(Listing).where(Listing.id.in_(ids)).order_by(Listing.id).with_for_update()).all()
        quantities = {item.listing_id: item.quantity for item in order.items}
        for listing in rows:
            listing.quantity += quantities[listing.id]
    order.status = data.status
    recipient = order.buyer_id if user.id == order.farmer_id else order.farmer_id
    db.add(Notification(user_id=recipient, order_id=order.id, title=f'Order {data.status.lower()}', body=f'{user.name} updated your order to {data.status.lower()}.'))
    db.commit()
    return order_json(order)


@app.get('/reviews')
def reviews(user: User = Depends(current_user), db: Session = Depends(database)):
    return [{'id': r.id, 'farmerId': r.farmer_id, 'author': r.author.name, 'rating': r.rating, 'text': r.text} for r in db.scalars(select(Review).options(joinedload(Review.author)).limit(1000))]


@app.post('/reviews')
def review(data: ReviewInput, user: User = Depends(current_user), db: Session = Depends(database)):
    farmer = db.get(User, data.farmerId)
    if user.role != 'buyer' or not farmer or farmer.deleted_at is not None or farmer.role != 'farmer':
        raise HTTPException(403, 'Buyers may review farmer accounts.')
    review = db.scalar(select(Review).where(Review.author_id == user.id, Review.farmer_id == farmer.id))
    if not review:
        review = Review(author_id=user.id, farmer_id=farmer.id)
        db.add(review)
    review.rating, review.text = data.rating, data.text
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Review was updated concurrently. Please retry.')
    return {'id': review.id}


@app.get('/analytics')
def analytics(user: User = Depends(current_user), db: Session = Depends(database)):
    farmer_only(user)
    rows = db.execute(select(Order.status, func.count(Order.id), func.sum(Order.total)).where(Order.farmer_id == user.id).group_by(Order.status)).all()
    result = {status: {'count': count, 'value': float(value)} for status, count, value in rows}
    result['summary'] = {
        'rating': float(db.scalar(select(func.avg(Review.rating)).where(Review.farmer_id == user.id)) or 0),
        'listingCount': db.scalar(select(func.count(Listing.id)).where(Listing.farmer_id == user.id)),
        'orderCount': sum(count for _, count, _ in rows),
    }
    return result


@app.post('/chat/token')
def chat_token(user: User = Depends(current_user), credentials=Depends(bearer), db: Session = Depends(database)):
    session = db.get(AuthSession, token_hash(credentials.credentials))
    return {'token': chat.custom_token(user.id, session.expires_at)}


@app.post('/chat/conversations')
def conversation(data: ConversationInput, user: User = Depends(current_user), db: Session = Depends(database)):
    recipient = db.scalar(select(User).where(User.id == data.recipientId).with_for_update(read=True))
    if not recipient or recipient.deleted_at is not None or recipient.id == user.id or recipient.role == user.role:
        raise HTTPException(404, 'Choose a buyer or farmer account to chat with.')
    return chat.ensure_conversation(user, recipient)


def unit_price(listing, quantity):
    return listing.wholesale_price if listing.wholesale_price is not None and quantity >= listing.wholesale_minimum else listing.price


@app.get('/notifications')
def notifications(user: User = Depends(current_user), db: Session = Depends(database)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.date.desc()).limit(200)).all()
    return [{'id': n.id, 'title': n.title, 'body': n.body, 'orderId': n.order_id, 'date': n.date.isoformat(), 'read': n.read_at is not None} for n in rows]


@app.patch('/notifications/{notification_id}/read', status_code=204)
def read_notification(notification_id: str, user: User = Depends(current_user), db: Session = Depends(database)):
    entry = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not entry:
        raise HTTPException(404, 'Notification not found.')
    entry.read_at = now()
    db.commit()


@app.get('/chat/reads')
def chat_reads(user: User = Depends(current_user), db: Session = Depends(database)):
    return {r.contact_id: r.date.isoformat() for r in db.scalars(select(ChatRead).where(ChatRead.user_id == user.id))}


@app.patch('/chat/reads/{contact_id}', status_code=204)
def mark_chat_read(contact_id: str, data: ChatReadInput, user: User = Depends(current_user), db: Session = Depends(database)):
    from sqlalchemy.dialects.postgresql import insert
    recipient = db.get(User, contact_id)
    if not recipient or recipient.deleted_at is not None or recipient.role == user.role:
        raise HTTPException(404, 'Contact not found.')
    statement = insert(ChatRead).values(user_id=user.id, contact_id=contact_id, date=data.date)
    db.execute(statement.on_conflict_do_update(index_elements=['user_id', 'contact_id'], set_={'date': func.greatest(ChatRead.date, data.date)}))
    db.commit()
