"""
F3.3 — Link de Tracking público para clientes (sin auth).
"""
from flask import Blueprint, render_template, abort
from app.core.db import get_db

tracking_bp = Blueprint('tracking', __name__)


@tracking_bp.route('/status/<wo_id>')
def tracking(wo_id):
    conn = get_db()
    try:
        wo = conn.execute("""
            SELECT wo.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
            FROM work_orders wo
            JOIN clients c ON c.id = wo.client_id
            WHERE wo.id = ?
        """, (wo_id,)).fetchone()
    finally:
        conn.close()

    if not wo:
        abort(404)

    return render_template('public/tracking.html', wo=dict(wo))
