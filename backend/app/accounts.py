"""Authenticated account management. Shared purchase records retain anonymous IDs."""
from secrets import token_urlsafe
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, delete, or_
from sqlalchemy.orm import Session
from .db import database
from .models import User, Listing, AuthSession, Photo, Order, Review, Notification, ChatRead, AccountCleanup, now
from .schemas import ProfileUpdate, PasswordChange, DeleteAccount
from .security import current_user, passwords, create_session
from .account_cleanup import cleanup_account
from .profiles import profile_json

router = APIRouter()


def require_password(user, password):
    if not passwords.verify(password, user.password_hash):
        raise HTTPException(403, 'Your current password is incorrect.')


@router.patch('/me')
def update_profile(data: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(database)):
    if user.role == 'farmer' and (not data.alternate or not data.produce):
        raise HTTPException(422, 'Farmers need an alternative contact and produce information.')
    for key, value in data.model_dump().items():
        setattr(user, key, value)
    db.commit()
    return profile_json(user)


@router.post('/me/password')
def change_password(data: PasswordChange, user: User = Depends(current_user), db: Session = Depends(database)):
    require_password(user, data.currentPassword)
    user.password_hash = passwords.hash(data.newPassword)
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    # Rotation and revocation commit together; the current device receives a replacement token.
    return {'token': create_session(db, user)}


@router.delete('/me', status_code=202)
def delete_account(data: DeleteAccount, tasks: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(database)):
    require_password(user, data.password)
    db.refresh(user, with_for_update=True)
    if user.deleted_at:
        raise HTTPException(401, 'Account has already been deleted.')
    affected = db.scalars(select(Order).where(or_(Order.buyer_id == user.id, Order.farmer_id == user.id)).order_by(Order.id).with_for_update()).all()
    active = [order for order in affected if order.status in ['Awaiting seller confirmation', 'Confirmed']]
    ids = sorted({item.listing_id for order in active for item in order.items})
    stock = {listing.id: listing for listing in db.scalars(select(Listing).where(Listing.id.in_(ids)).order_by(Listing.id).with_for_update())}
    for order in active:
        order.status = 'Cancelled'
        for item in order.items:
            stock[item.listing_id].quantity += item.quantity
    # Remove identifying seller information from snapshots shared with buyers.
    for order in affected:
        if order.farmer_id == user.id:
            for item in order.items:
                snapshot = {**item.snapshot, 'seller': 'Deleted account', 'phone': '', 'alternate': '', 'area': ''}
                snapshot.pop('image', None)
                item.snapshot = snapshot
    order_ids = [order.id for order in affected]
    for notice in db.scalars(select(Notification).where(Notification.order_id.in_(order_ids))):
        notice.body = 'An account linked to this order was deleted. Shared order records are retained.'
    for order in active:
        recipient = order.farmer_id if order.buyer_id == user.id else order.buyer_id
        db.add(Notification(user_id=recipient, order_id=order.id, title='Order cancelled', body='The other account was deleted. Reserved stock has been released.'))
    for listing in db.scalars(select(Listing).where(Listing.farmer_id == user.id).order_by(Listing.id).with_for_update()):
        listing.quantity = 0
        listing.image = ''
    photos = list(db.scalars(select(Photo.path).where(Photo.owner_id == user.id)))
    db.execute(delete(Photo).where(Photo.owner_id == user.id))
    db.execute(delete(Review).where(or_(Review.author_id == user.id, Review.farmer_id == user.id)))
    db.execute(delete(Notification).where(Notification.user_id == user.id))
    db.execute(delete(ChatRead).where(or_(ChatRead.user_id == user.id, ChatRead.contact_id == user.id)))
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    user.deleted_at = now()
    user.email = f'deleted-{user.id}@deleted.invalid'
    user.name = 'Deleted account'
    user.password_hash = passwords.hash(token_urlsafe(64))
    user.phone = user.alternate = user.area = user.produce = ''
    user.latitude = user.longitude = user.location_consent_at = None
    db.add(AccountCleanup(user_id=user.id, photos=photos))
    db.commit()
    tasks.add_task(cleanup_account, user.id)
    return {'status': 'deleted', 'cleanup': 'queued'}
