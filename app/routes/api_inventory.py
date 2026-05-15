"""API Inventory Blueprint — CRUD, movements, stock adjustments."""
from flask import Blueprint, jsonify, request
from app.core.db import get_db, now_iso
from app.core.auth import login_required

api_inventory_bp = Blueprint('api_inventory', __name__)


@api_inventory_bp.route('/api/inventario/bajo-stock', methods=['GET'])
@login_required
def api_inventario_bajo_stock():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM inventario WHERE cantidad < stock_minimo ORDER BY (stock_minimo - cantidad) DESC"
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_inventory_bp.route('/api/inventario', methods=['GET', 'POST'])
@login_required
def api_inventario():
    if request.method == 'GET':
        conn = get_db()
        try:
            categoria = request.args.get('categoria')
            search = request.args.get('search', '').strip()
            query = "SELECT * FROM inventario WHERE 1=1"
            params = []
            if categoria:
                query += " AND categoria = ?"
                params.append(categoria)
            if search:
                query += " AND (nombre LIKE ? OR codigo LIKE ?)"
                params.extend([f'%{search}%', f'%{search}%'])
            query += " ORDER BY categoria, nombre"
            rows = conn.execute(query, params).fetchall()
            return jsonify([dict(r) for r in rows])
        finally:
            conn.close()

    # POST — crear item
    data = request.get_json()
    conn = get_db()
    try:
        conn.execute('''
            INSERT INTO inventario (codigo, nombre, categoria, unidad, cantidad, stock_minimo, proveedor, costo_unitario, ubicacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('codigo', ''),
            data.get('nombre', ''),
            data.get('categoria', ''),
            data.get('unidad', 'unidad'),
            data.get('cantidad', 0),
            data.get('stock_minimo', 0),
            data.get('proveedor', ''),
            data.get('costo_unitario', 0),
            data.get('ubicacion', '')
        ))
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_inventory_bp.route('/api/inventario/<int:item_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def api_inventario_item(item_id):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Item no encontrado'}), 404

        if request.method == 'GET':
            return jsonify(dict(row))

        if request.method == 'DELETE':
            conn.execute("DELETE FROM inventario_movimientos WHERE item_id = ?", (item_id,))
            conn.execute("DELETE FROM inventario WHERE id = ?", (item_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Item {row["codigo"]} eliminado'})

        # PUT
        data = request.get_json()
        updates = []
        params = []
        for key in ['codigo', 'nombre', 'categoria', 'unidad', 'cantidad', 'stock_minimo', 'proveedor', 'costo_unitario', 'ubicacion']:
            if key in data:
                updates.append(f"{key} = ?")
                params.append(data[key])
        if updates:
            params.append(item_id)
            conn.execute(f"UPDATE inventario SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_inventory_bp.route('/api/inventario/<int:item_id>/ajustar', methods=['POST'])
@login_required
def api_inventario_ajustar(item_id):
    data = request.get_json()
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Item no encontrado'}), 404

        tipo = data.get('tipo', 'entrada')
        cantidad = float(data.get('cantidad', 0))
        if cantidad <= 0:
            return jsonify({'error': 'Cantidad debe ser > 0'}), 400
        if tipo not in ('entrada', 'salida', 'ajuste'):
            return jsonify({'error': 'Tipo inválido: use entrada, salida o ajuste'}), 400

        if tipo == 'salida':
            nueva_cantidad = row['cantidad'] - cantidad
        else:
            nueva_cantidad = row['cantidad'] + cantidad

        if nueva_cantidad < 0:
            return jsonify({
                'error': f'Stock insuficiente. Actual: {row["cantidad"]} {row["unidad"]}'
            }), 400

        motivo = data.get('motivo', '')
        now = now_iso()

        conn.execute('''
            INSERT INTO inventario_movimientos (item_id, tipo, cantidad, motivo, fecha)
            VALUES (?, ?, ?, ?, ?)
        ''', (item_id, tipo, cantidad, motivo, now))

        conn.execute("UPDATE inventario SET cantidad = ? WHERE id = ?", (nueva_cantidad, item_id))
        conn.commit()

        row = conn.execute("SELECT * FROM inventario WHERE id = ?", (item_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@api_inventory_bp.route('/api/inventario/<int:item_id>/movimientos', methods=['GET'])
@login_required
def api_inventario_movimientos(item_id):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM inventario_movimientos WHERE item_id = ? ORDER BY fecha DESC LIMIT 50",
            (item_id,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@api_inventory_bp.route('/api/inventario/categorias', methods=['GET'])
@login_required
def api_inventario_categorias():
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT DISTINCT categoria FROM inventario WHERE categoria IS NOT NULL AND categoria != '' ORDER BY categoria"
        ).fetchall()
        return jsonify([r['categoria'] for r in rows])
    finally:
        conn.close()