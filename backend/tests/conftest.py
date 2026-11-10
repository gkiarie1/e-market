import os
from pathlib import Path
import tempfile

# Tests must use an explicitly supplied disposable PostgreSQL database.
url = os.environ.get('TEST_DATABASE_URL')
if not url or 'test' not in url.rsplit('/', 1)[-1]:
    raise RuntimeError('Set TEST_DATABASE_URL to a disposable PostgreSQL database whose name contains test.')
os.environ['DATABASE_URL'] = url
os.environ['UPLOAD_DIR'] = tempfile.mkdtemp(prefix='shamba-test-uploads-')
os.environ['FIREBASE_PROJECT_ID'] = ''

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.main import app
from app.db import engine, Base
from app import models


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        names = ', '.join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
        connection.execute(text(f'TRUNCATE {names} CASCADE'))
    yield


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
