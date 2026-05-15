"""Views Blueprint — HTML pages and auth routes."""
import os
from datetime import datetime
from flask import Blueprint, render_template, request, session, redirect, url_for
from app.core.db import get_db, now_col
from app.services.wo_service import wo_to_dict

views_bp = Blueprint('views', __name__)


@views_bp.route('/login', methods=['GET', 'POST'])
def login_page():
    if request.method == 'GET':
        if 'user' in session:
            return redirect('/')
        return render_template('login.html')

    # POST
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()

    admin_user = os.environ.get('HTK_ADMIN_USER', 'admin')
    admin_pass = os.environ.get('HTK_ADMIN_PASS', 'htk2026')

    if username == admin_user and password == admin_pass:
        session['user'] = username
        session['login_time'] = datetime.now(now_col().tzinfo).isoformat()
        next_page = request.args.get('next', '/')
        return redirect(next_page)

    return render_template('login.html', error='Usuario o contraseña incorrectos')


@views_bp.route('/logout')
def logout():
    session.clear()
    return redirect('/login')


@views_bp.route('/')
def index():
    if 'user' not in session:
        is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
        if not is_local:
            return redirect(url_for('views.login_page', next=request.path))
    return render_template('index.html')


@views_bp.route('/leads/<path:lid>')
def page_lead(lid):
    if 'user' not in session:
        is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
        if not is_local:
            return redirect(url_for('views.login_page', next=request.path))
    db = get_db()
    row = db.execute("SELECT * FROM leads WHERE id = ?", (lid,)).fetchone()
    if not row:
        db.close()
        return 'Lead no encontrado', 404
    lead = dict(row)
    interactions = db.execute(
        "SELECT * FROM interactions WHERE lead_id = ? ORDER BY fecha DESC LIMIT 20",
        (lid,)
    ).fetchall()
    db.close()
    actividades = [dict(i) for i in interactions]
    return render_template('lead_detail.html', lead=lead, actividades=actividades)


@views_bp.route('/ordenes/<path:wid>')
def page_wo(wid):
    if 'user' not in session:
        is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
        if not is_local:
            return redirect(url_for('views.login_page', next=request.path))
    conn = get_db()
    wo = wo_to_dict(conn, wid)
    conn.close()
    if not wo:
        return 'Orden de Trabajo no encontrada', 404
    return render_template('wo_detail.html', wo=wo)


@views_bp.route('/bot-whatsapp')
def page_bot_whatsapp():
    is_local = request.remote_addr in ('127.0.0.1', 'localhost', '::1')
    if not is_local and 'user' not in session:
        return redirect(url_for('views.login_page', next=request.path))
    return render_template('bot_whatsapp.html')