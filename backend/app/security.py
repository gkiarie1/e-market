import hashlib
import secrets
from datetime import timedelta
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session
from sqlalchemy import select
from .db import database
from .models import AuthSession, User, now
from .config import settings

passwords = PasswordHash.recommended()
dummy_hash = passwords.hash('not-a-real-account-password')
bearer = HTTPBearer(auto_error=False)


def token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User):
    token = secrets.token_urlsafe(48)
    db.add(AuthSession(token_hash=token_hash(token), user_id=user.id, expires_at=now() + timedelta(hours=settings().session_hours)))
    db.commit()
    return token


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(database)):
    session = db.get(AuthSession, token_hash(credentials.credentials)) if credentials and credentials.scheme.lower() == 'bearer' else None
    if not session or session.expires_at <= now():
        raise HTTPException(401, 'Please log in again.', headers={'WWW-Authenticate': 'Bearer'})
    # Hold account changes behind in-flight marketplace operations.
    changing_account = request.method != 'GET' and request.url.path in ['/me', '/me/password', '/me/location']
    user = db.scalar(select(User).where(User.id == session.user_id).with_for_update(read=not changing_account))
    if db.scalar(select(AuthSession.token_hash).where(AuthSession.token_hash == session.token_hash)) is None:
        raise HTTPException(401, 'Please log in again.')
    if not user or user.deleted_at is not None:
        raise HTTPException(401, 'Account not found.')
    return user
