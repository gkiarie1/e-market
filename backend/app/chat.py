import firebase_admin
from firebase_admin import auth, firestore, credentials
from fastapi import HTTPException
from .models import now
from .config import settings


def firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        if not settings().firebase_project_id:
            raise HTTPException(503, 'Live chat is not configured on the server.')
        try:
            credential = credentials.Certificate(settings().google_application_credentials) if settings().google_application_credentials else None
            return firebase_admin.initialize_app(credential, options={'projectId': settings().firebase_project_id})
        except Exception as exc:
            raise HTTPException(503, 'Firebase server credentials are unavailable.') from exc


def custom_token(user_id: str, expires_at):
    try:
        return auth.create_custom_token(user_id, {'marketplace': True, 'chatExpiresAt': min(int(expires_at.timestamp()), int(now().timestamp()) + 3600)}, app=firebase_app()).decode()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'Live chat authentication is unavailable.') from exc


def ensure_conversation(user, recipient):
    ids = sorted([user.id, recipient.id])
    conversation_id = '_'.join(ids)
    try:
        firestore.client(app=firebase_app()).collection('conversations').document(conversation_id).set({
            'participants': ids,
            'names': {user.id: user.name, recipient.id: recipient.name},
        })
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'Live chat is temporarily unavailable.') from exc
    return {'id': conversation_id, 'participants': ids}


def delete_account_data(user_id):
    if not settings().firebase_project_id:
        return
    app = firebase_app()
    try:
        auth.delete_user(user_id, app=app)
    except auth.UserNotFoundError:
        pass
    client = firestore.client(app=app)
    from google.cloud.firestore_v1.base_query import FieldFilter
    # Remove membership first so no new messages can be added to these threads.
    for name in ['conversations', 'messages']:
        collection = client.collection(name)
        query = collection.where(filter=FieldFilter('participants', 'array_contains', user_id)).limit(400)
        while True:
            docs = list(query.stream())
            if not docs:
                break
            batch = client.batch()
            for document in docs:
                batch.delete(document.reference)
            batch.commit()
