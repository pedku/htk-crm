"""
Dashboard Financiero: ingresos, tendencias, top clientes.
F2.3 del ROADMAP v5.
"""
from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from app.core.db import get_db

finanzas_bp = Blueprint('finanzas', __name__)


def _ingresos_mes(db, mes):
    """Total facturado y pagado en un mes (formato YYYY-MM)."""
    r = db.execute("""
        SELECT COALESCE(SUM(total_general), 0) AS total
        FROM invoices
        WHERE estado = 'pagada'
          AND substr(pagada_fecha, 1, 7) = ?
    """, (mes,)).fetchone()
    return r['total']


@finanzas_bp.route('/api/finanzas/stats')
def finanzas_stats():
    db = get_db()

    now = datetime.now()
    mes_actual = now.strftime('%Y-%m')
    # Mes anterior: retrocede 1 mes
    prev = now.replace(day=1) - timedelta(days=1)
    mes_anterior = prev.strftime('%Y-%m')

    ing_actual = _ingresos_mes(db, mes_actual)
    ing_anterior = _ingresos_mes(db, mes_anterior)
    variacion = round(
        ((ing_actual - ing_anterior) / ing_anterior * 100)
        if ing_anterior else 0, 1
    )

    # Facturas pendientes de cobro (emitidas, no pagadas)
    pendiente = db.execute("""
        SELECT COALESCE(SUM(total_general), 0) AS total
        FROM invoices WHERE estado = 'emitida'
    """).fetchone()['total']

    # Top 5 clientes por facturación pagada
    top = db.execute("""
        SELECT c.nombre, SUM(i.total_general) AS total
        FROM invoices i
        JOIN clients c ON c.id = i.client_id
        WHERE i.estado = 'pagada'
        GROUP BY c.id
        ORDER BY total DESC
        LIMIT 5
    """).fetchall()

    # Últimos 6 meses (con navegación correcta de meses)
    meses = []
    for i in range(5, -1, -1):
        # Restar i meses de forma correcta
        m = now.month - i
        y = now.year
        while m < 1:
            m += 12
            y -= 1
        mes_str = f'{y:04d}-{m:02d}'
        meses.append({
            'mes': datetime(y, m, 1).strftime('%b %Y'),
            'total': _ingresos_mes(db, mes_str)
        })

    return jsonify({
        'ingresos_mes_actual': ing_actual,
        'ingresos_mes_anterior': ing_anterior,
        'variacion_pct': variacion,
        'pendiente_cobro': pendiente,
        'top_clientes': [{'nombre': r['nombre'], 'total': r['total']} for r in top],
        'ultimos_6_meses': meses
    })
