"""
Test fixtures: app with test DB copy, authenticated client.
F1.1 — Test Suite de Integración.
"""
import pytest
import os
import shutil
import tempfile

# Copy real DB to temp location for tests
_REAL_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'htk_crm.db')
TEST_DIR = tempfile.mkdtemp(prefix='htk_crm_test_')
TEST_DB = os.path.join(TEST_DIR, 'test_crm.db')
shutil.copy2(_REAL_DB, TEST_DB)

# Monkey-patch DB path before importing app
import app as _app_module
_app_module.DB_PATH = TEST_DB


@pytest.fixture(scope='session')
def app():
    """Flask app instance with test database."""
    from app import create_app
    flask_app = create_app()
    flask_app.config['TESTING'] = True
    flask_app.config['SERVER_NAME'] = 'localhost'
    ctx = flask_app.app_context()
    ctx.push()
    yield flask_app
    ctx.pop()
    shutil.rmtree(TEST_DIR, ignore_errors=True)


@pytest.fixture()
def client(app):
    """Authenticated HTTP client (admin/htk2026)."""
    c = app.test_client()
    resp = c.post('/login', data={
        'username': 'admin',
        'password': 'htk2026'
    }, follow_redirects=True)
    assert resp.status_code == 200
    # Verify session was set
    with c.session_transaction() as sess:
        assert sess.get('user') == 'admin', 'Login failed'
    return c


@pytest.fixture()
def test_client_id():
    return 'CLI-004'  # pedro castro exists in the real DB
