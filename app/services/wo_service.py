"""Service layer for Work Order business logic."""
import json
from app.core.db import get_db, now_iso, now_col
from app.core.wo_types import TIPOS_OT, get_estado_inicial, can_transition, validate_wo_fields


def wo_to_dict(conn, wo_id):
    """Convert work order DB row to full nested format with proper types."""
    row = conn.execute("SELECT * FROM work_orders WHERE id = ?", (wo_id,)).fetchone()
    if not row:
        return None
    wo = dict(row)
    wo['cliente'] = {
        'nombre': wo.pop('cliente_nombre', ''),
        'telefono': wo.pop('cliente_telefono', '')
    }
    wo['equipo'] = {
        'tipo': wo.pop('equipo_tipo', 'otro'),
        'marca': wo.pop('equipo_marca', ''),
        'modelo': wo.pop('equipo_modelo', '')
    }
    wo['fechas'] = {
        'recibido': wo.pop('fecha_recibido', None),
        'diagnostico': wo.pop('fecha_diagnostico', None),
        'presupuesto_aprobado': wo.pop('fecha_presupuesto_aprobado', None),
        'completado': wo.pop('fecha_completado', None),
        'entregado': wo.pop('fecha_entregado', None)
    }
    # Parse campos_extra JSON
    try:
        wo['campos_extra'] = json.loads(wo.get('campos_extra', '{}') or '{}')
    except (json.JSONDecodeError, TypeError):
        wo['campos_extra'] = {}
    # Type conversions for JSON compatibility
    wo['activo'] = bool(wo.get('activo', 0))
    if wo.get('presupuesto') is not None:
        wo['presupuesto'] = float(wo['presupuesto'])
    if wo.get('valor_total') is not None:
        wo['valor_total'] = float(wo['valor_total'])
    # Load history with bool conversion
    hist_rows = conn.execute(
        "SELECT fecha, estado, descripcion, notificado FROM work_order_history WHERE wo_id = ? ORDER BY id",
        (wo['id'],)
    ).fetchall()
    wo['historial'] = []
    for h in hist_rows:
        entry = dict(h)
        entry['notificado'] = bool(entry.get('notificado', 0))
        wo['historial'].append(entry)
    # Load payments
    pay_rows = conn.execute(
        "SELECT id, monto, tipo, metodo, referencia, fecha, notas, registrado_por FROM payments WHERE wo_id = ? ORDER BY id",
        (wo_id,)
    ).fetchall()
    wo['payments'] = [dict(p) for p in pay_rows]
    wo['total_abonado'] = sum(p['monto'] for p in pay_rows)
    if wo.get('presupuesto'):
        wo['saldo_pendiente'] = round(wo['presupuesto'] - wo['total_abonado'], 2)
    else:
        wo['saldo_pendiente'] = None
    # Load linked client data if client_id is set
    wo['client_id'] = wo.get('client_id')
    wo['cliente_vinculado'] = None
    if wo.get('client_id'):
        client_row = conn.execute("SELECT * FROM clients WHERE id = ?", (wo['client_id'],)).fetchone()
        if client_row:
            c = dict(client_row)
            prev_count = conn.execute(
                "SELECT COUNT(*) FROM work_order_client_links WHERE client_id = ?",
                (wo['client_id'],)
            ).fetchone()[0]
            total_fact = conn.execute(
                "SELECT COALESCE(SUM(presupuesto), 0) FROM work_orders w JOIN work_order_client_links l ON w.id = l.wo_id WHERE l.client_id = ?",
                (wo['client_id'],)
            ).fetchone()[0]
            wo['cliente_vinculado'] = {
                'id': c['id'],
                'nombre': c.get('nombre', ''),
                'telefono': c.get('telefono', ''),
                'empresa': c.get('empresa', ''),
                'segmento': c.get('segmento', ''),
                'ciudad': c.get('ciudad', ''),
                'ordenes_previas': prev_count,
                'total_facturado': float(total_fact)
            }
    return wo


def export_work_orders_full(conn, tipo_filter=None):
    """Export work orders with nested cliente/equipo/historial/fechas and proper types."""
    if tipo_filter:
        orders = conn.execute(
            "SELECT * FROM work_orders WHERE tipo = ? ORDER BY id", (tipo_filter,)
        ).fetchall()
    else:
        orders = conn.execute("SELECT * FROM work_orders ORDER BY id").fetchall()
    result = []
    for o in orders:
        wo = dict(o)
        wo['cliente'] = {
            'nombre': wo.pop('cliente_nombre', ''),
            'telefono': wo.pop('cliente_telefono', '')
        }
        wo['equipo'] = {
            'tipo': wo.pop('equipo_tipo', 'otro'),
            'marca': wo.pop('equipo_marca', ''),
            'modelo': wo.pop('equipo_modelo', '')
        }
        wo['fechas'] = {
            'recibido': wo.pop('fecha_recibido', None),
            'diagnostico': wo.pop('fecha_diagnostico', None),
            'presupuesto_aprobado': wo.pop('fecha_presupuesto_aprobado', None),
            'completado': wo.pop('fecha_completado', None),
            'entregado': wo.pop('fecha_entregado', None)
        }
        try:
            wo['campos_extra'] = json.loads(wo.get('campos_extra', '{}') or '{}')
        except (json.JSONDecodeError, TypeError):
            wo['campos_extra'] = {}
        wo['activo'] = bool(wo.get('activo', 0))
        if wo.get('presupuesto') is not None:
            wo['presupuesto'] = float(wo['presupuesto'])
        if wo.get('valor_total') is not None:
            wo['valor_total'] = float(wo['valor_total'])
        hist_rows = conn.execute(
            "SELECT fecha, estado, descripcion, notificado FROM work_order_history WHERE wo_id = ? ORDER BY id",
            (wo['id'],)
        ).fetchall()
        wo['historial'] = []
        for h in hist_rows:
            entry = dict(h)
            entry['notificado'] = bool(entry.get('notificado', 0))
            wo['historial'].append(entry)
        result.append(wo)
    return result


def link_wo_to_client(wo_id, cliente_nombre, cliente_telefono):
    """Link work order to matching client by name or phone."""
    conn = get_db()
    try:
        if cliente_nombre:
            row = conn.execute(
                "SELECT id FROM clients WHERE LOWER(nombre) = LOWER(?)",
                (cliente_nombre.strip(),)
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, row['id'])
                )
                conn.execute(
                    "UPDATE clients SET interacciones_totales = interacciones_totales + 1, ultimo_contacto = ? WHERE id = ?",
                    (now_iso(), row['id'])
                )
                conn.commit()
                return

        if cliente_telefono:
            row = conn.execute(
                "SELECT id FROM clients WHERE telefono = ?",
                (cliente_telefono.strip(),)
            ).fetchone()
            if row:
                conn.execute(
                    "INSERT OR IGNORE INTO work_order_client_links (wo_id, client_id) VALUES (?, ?)",
                    (wo_id, row['id'])
                )
                conn.execute(
                    "UPDATE clients SET interacciones_totales = interacciones_totales + 1, ultimo_contacto = ? WHERE id = ?",
                    (now_iso(), row['id'])
                )
                conn.commit()
    finally:
        conn.close()


def update_wo_status(conn, wo_id, new_status, old_status, wo_tipo, data=None):
    """
    Update work order status with transition validation.
    
    Args:
        conn: DB connection
        wo_id: Work order ID
        new_status: Target estado
        old_status: Current estado
        wo_tipo: OT type
        data: dict with optional fields (descripcion, presupuesto, diagnostico, notificado)
    
    Returns:
        tuple (success: bool, error_message: str or None)
    
    Side effects:
        Updates status, fecha fields, history entry
    """
    # Validate transition
    valid, error = can_transition(wo_tipo, old_status, new_status)
    if not valid:
        return False, error
    
    now = now_iso()
    data = data or {}
    
    # Update specific date fields
    if new_status == 'diagnosticando':
        conn.execute("UPDATE work_orders SET fecha_diagnostico = ? WHERE id = ?", (now, wo_id))
    elif new_status == 'aprobado':
        conn.execute("UPDATE work_orders SET fecha_presupuesto_aprobado = ? WHERE id = ?", (now, wo_id))
    elif new_status == 'completado':
        conn.execute("UPDATE work_orders SET fecha_completado = ? WHERE id = ?", (now, wo_id))
    elif new_status == 'entregado':
        conn.execute("UPDATE work_orders SET fecha_entregado = ? WHERE id = ?", (now, wo_id))
    
    # Update status
    conn.execute("UPDATE work_orders SET estado = ? WHERE id = ?", (new_status, wo_id))
    
    # Update presupuesto/diagnostico if provided
    if 'presupuesto' in data and data['presupuesto'] is not None:
        conn.execute("UPDATE work_orders SET presupuesto = ? WHERE id = ?",
                     (data['presupuesto'], wo_id))
    if 'diagnostico' in data:
        conn.execute("UPDATE work_orders SET diagnostico = ? WHERE id = ?",
                     (data['diagnostico'], wo_id))
    
    # Add history entry
    descripcion = data.get('descripcion',
                           f'Estado cambiado de {old_status} a {new_status}')
    notificado = 1 if data.get('notificado') else 0
    conn.execute("""
        INSERT INTO work_order_history (wo_id, fecha, estado, descripcion, notificado)
        VALUES (?, ?, ?, ?, ?)
    """, (wo_id, now, new_status, descripcion, notificado))
    
    return True, None