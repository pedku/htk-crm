import functools
from flask import session, redirect, url_for, request, jsonify


def _is_local():
    """Check if request comes from localhost (not via Cloudflare)."""
    # If Cloudflare header is present, it's NOT local even if remote_addr is 127.0.0.1
    if request.headers.get('CF-Connecting-IP'):
        return False
    return request.remote_addr in ('127.0.0.1', 'localhost', '::1')


def login_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            # Allow localhost GET without auth (bot.js, healthchecks)
            is_local = _is_local()
            if is_local and request.method == 'GET':
                return f(*args, **kwargs)
            # For API routes (JSON), return 401 instead of redirect
            if request.path.startswith('/api/') or request.is_json:
                return jsonify({'error': 'No autenticado', 'redirect': '/login'}), 401
            return redirect(url_for('views.login_page', next=request.path))
        return f(*args, **kwargs)
    return decorated_function


def admin_or_local_required(f):
    """Require auth for mutating operations, allow local GET without auth."""
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            is_local = _is_local()
            if request.method == 'GET' and is_local:
                return f(*args, **kwargs)
            return redirect(url_for('views.login_page', next=request.path))
        return f(*args, **kwargs)
    return decorated_function