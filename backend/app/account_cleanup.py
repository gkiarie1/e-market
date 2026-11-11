"""Retry external account cleanup after the SQL account has been anonymized."""
import asyncio
import logging
from pathlib import Path
from sqlalchemy import select
from .config import settings
from .db import SessionLocal
from .models import AccountCleanup
from . import chat

logger = logging.getLogger(__name__)


def cleanup_account(user_id):
    try:
        with SessionLocal.begin() as db:
            job = db.scalar(select(AccountCleanup).where(AccountCleanup.user_id == user_id).with_for_update(skip_locked=True))
            if not job:
                return
            chat.delete_account_data(user_id)
            root = Path(settings().upload_dir).resolve()
            for photo in job.photos:
                # Only generated files in the configured upload directory can be removed.
                if not photo.startswith('/uploads/') or Path(photo).name != photo.removeprefix('/uploads/'):
                    raise ValueError('Invalid stored photo path')
                (root / Path(photo).name).unlink(missing_ok=True)
            db.delete(job)
    except Exception:
        # The durable job remains queued; do not log message contents or credentials.
        logger.warning('Account cleanup will be retried.', exc_info=False)


def retry_pending():
    with SessionLocal() as db:
        ids = db.scalars(select(AccountCleanup.user_id)).all()
    for user_id in ids:
        cleanup_account(user_id)


async def cleanup_loop():
    while True:
        try:
            await asyncio.to_thread(retry_pending)
        except Exception:
            logger.warning('Account cleanup worker could not connect; retrying.')
        await asyncio.sleep(60)
