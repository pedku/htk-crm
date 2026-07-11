"""API Quotes Blueprint — Cotizaciones CRUD + generación PDF."""
import os
import subprocess
from datetime import datetime
import logging
from flask import Blueprint, jsonify, request, render_template, send_file

logger = logging.getLogger(__name__)
from app.core.db import get_db, now_iso
from app.core.auth import login_required

api_quotes_bp = Blueprint('api_quotes', __name__)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
QUOTES_PDF_DIR = os.path.join(BASE_DIR, 'cotizaciones')

EMPRESA_DEFAULTS = {
    'nombre': 'HOUSETRONIK INGENIERÍA Y AUTOMATIZACIÓN INTELIGENTE S.A.S',
    'comercial': 'HTK INGENIERIA',
    'nit': '1.124.361.169-2',
    'direccion': 'Cra 7b #46-108, Barranquilla, Colombia',
    'telefono': '+57 315 603 2940',
    'email': 'info@htk-ingenieria.com',
    'logo_url': '/static/img/logo_htk.png'
}

POLITICA_GARANTIA_DEFAULT = """HTK INGENIERIA (HOUSETRONIK S.A.S.) garantiza el transformador del equipo ofertado por un periodo de un (1) año, contado a partir de la fecha de entrega, contra defectos de fábrica y fallos de funcionamiento imputables al proceso de fabricación del mismo, así como por acondicionamiento y ajuste. La presente garantía se limita exclusivamente al transformador, elemento fabricado directamente por nuestra empresa, bajo la condición de que el equipo haya sido operado dentro de los parámetros eléctricos y condiciones de uso para los cuales fue diseñado.

Quedan excluidos de la cobertura de garantía: los componentes internos de conmutación, control y accesorios (relés, contactores, tableros, cableado interno, entre otros); así como daños ocasionados por mal uso, uso inadecuado, manipulación por personal no autorizado, sobretensiones o descargas atmosféricas, conexiones incorrectas, y en general cualquier condición de operación que exceda el rango normal de funcionamiento del equipo. Los componentes de conmutación y control cuentan con mantenimiento preventivo y correctivo disponible por separado.

Los equipos ofertados son fabricados bajo pedido y diseñados de acuerdo con las necesidades específicas de cada cliente. En consecuencia, no se aceptan devoluciones del equipo, ya sea en dinero o en especie, salvo que medie un mutuo acuerdo entre las partes debidamente formalizado.

Para hacer efectiva la garantía, el cliente deberá presentar el presente documento de cotización o la factura correspondiente, y facilitar la revisión técnica del equipo en nuestras instalaciones ubicadas en la ciudad de Barranquilla."""


def get_empresa_config():
    """Read company config from DB, fall back to defaults."""
    config = dict(EMPRESA_DEFAULTS)
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT key, value FROM bot_config WHERE key LIKE 'company_%'"
        ).fetchall()
        for r in rows:
            key = r['key'].replace('company_', '')
            if key in config and r['value']:
                config[key] = r['value']
        conn.close()
    except:
        pass
    return config


def next_quote_num():
    """Generate next quote number like COT-2026-001."""
    conn = get_db()
    year = datetime.now().strftime('%Y')
    row = conn.execute(
        "SELECT numero FROM quotes WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1",
        (f'COT-{year}-%',)
    ).fetchone()
    if row:
        seq = int(row['numero'].split('-')[-1]) + 1
    else:
        seq = 1
    conn.close()
    return f'COT-{year}-{seq:03d}'


def ensure_quotes_dir():
    """Create cotizaciones directory if it doesn't exist."""
    os.makedirs(QUOTES_PDF_DIR, exist_ok=True)


# ── LISTAR COTIZACIONES ──────────────────────────────────────────────

@api_quotes_bp.route('/api/cotizaciones')
@login_required
def list_quotes():
    conn = get_db()
    try:
        where = ['activo = 1']
        params = []

        estado = request.args.get('estado')
        if estado:
            where.append('estado = ?')
            params.append(estado)

        tipo = request.args.get('tipo')
        if tipo:
            where.append('tipo = ?')
            params.append(tipo)

        q = request.args.get('q')
        if q:
            where.append('(cliente_nombre LIKE ? OR numero LIKE ? OR asunto LIKE ?)')
            like = f'%{q}%'
            params.extend([like, like, like])

        sql = f"SELECT * FROM quotes WHERE {' AND '.join(where)} ORDER BY created_at DESC"
        rows = conn.execute(sql, params).fetchall()
        quotes = [dict(r) for r in rows]
        return jsonify(quotes)
    finally:
        conn.close()


# ── DETALLE ───────────────────────────────────────────────────────────

@api_quotes_bp.route('/api/cotizaciones/<quote_id>')
@login_required
def get_quote(quote_id):
    conn = get_db()
    try:
        quote = conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)).fetchone()
        if not quote:
            return jsonify({'error': 'Cotización no encontrada'}), 404

        items = conn.execute(
            "SELECT * FROM quote_items WHERE quote_id = ? ORDER BY opcion, item_num",
            (quote_id,)
        ).fetchall()

        result = dict(quote)
        result['items'] = [dict(i) for i in items]

        # Enrich with client data if client_id is set
        if quote['client_id']:
            client = conn.execute("SELECT * FROM clients WHERE id = ?",
                                  (quote['client_id'],)).fetchone()
            result['cliente'] = dict(client) if client else None

        return jsonify(result)
    finally:
        conn.close()


# ── CREAR ─────────────────────────────────────────────────────────────

@api_quotes_bp.route('/api/cotizaciones', methods=['POST'])
@login_required
def create_quote():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    conn = get_db()
    try:
        numero = next_quote_num()
        now = now_iso()
        quote_id = f"QTE-{numero}"

        items = data.get('items', [])
        incluye_iva = int(data.get('incluye_iva', 0))
        sub_total = 0.0
        iva_total = 0.0

        for item in items:
            cant = float(item.get('cantidad', 0))
            precio = float(item.get('precio_unitario', 0))
            item['total_linea'] = round(cant * precio, 2)
            sub_total += item['total_linea']

        if incluye_iva:
            iva_total = round(sub_total * 0.19, 2)

        total_general = round(sub_total + iva_total, 2)

        conn.execute('''
            INSERT INTO quotes (id, numero, tipo, client_id, cliente_nombre, cliente_documento,
                destinatario, asunto, fecha_emision, fecha_validez, incluye_iva,
                sub_total, iva_total, total_general, alcance, politica_garantia,
                formas_pago, notas, estado, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'borrador', ?, ?)
        ''', (
            quote_id, numero,
            data.get('tipo', 'normal'),
            data.get('client_id', ''),
            data.get('cliente_nombre', ''),
            data.get('cliente_documento', ''),
            data.get('destinatario', ''),
            data.get('asunto', ''),
            data.get('fecha_emision', now),
            data.get('fecha_validez', ''),
            incluye_iva,
            sub_total, iva_total, total_general,
            data.get('alcance', ''),
            data.get('politica_garantia', POLITICA_GARANTIA_DEFAULT),
            data.get('formas_pago', ''),
            data.get('notas', ''),
            now, now
        ))

        for i, item in enumerate(items):
            conn.execute('''
                INSERT INTO quote_items (quote_id, opcion, item_num, descripcion,
                    detalle_tecnico, cantidad, precio_unitario, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                quote_id,
                item.get('opcion', 'unica'),
                i + 1,
                item.get('descripcion', ''),
                item.get('detalle_tecnico', ''),
                float(item.get('cantidad', 1)),
                float(item.get('precio_unitario', 0)),
                item['total_linea']
            ))

        conn.commit()
        return jsonify({'id': quote_id, 'numero': numero, 'total_general': total_general}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── EDITAR ────────────────────────────────────────────────────────────

@api_quotes_bp.route('/api/cotizaciones/<quote_id>', methods=['PUT'])
@login_required
def update_quote(quote_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    conn = get_db()
    try:
        quote = conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)).fetchone()
        if not quote:
            return jsonify({'error': 'Cotización no encontrada'}), 404

        items = data.get('items', [])
        incluye_iva = int(data.get('incluye_iva', 0))
        sub_total = 0.0
        iva_total = 0.0

        for item in items:
            cant = float(item.get('cantidad', 0))
            precio = float(item.get('precio_unitario', 0))
            item['total_linea'] = round(cant * precio, 2)
            sub_total += item['total_linea']

        if incluye_iva:
            iva_total = round(sub_total * 0.19, 2)

        total_general = round(sub_total + iva_total, 2)
        now = now_iso()

        conn.execute('''
            UPDATE quotes SET tipo=?, client_id=?, cliente_nombre=?, cliente_documento=?,
                destinatario=?, asunto=?, fecha_emision=?, fecha_validez=?, incluye_iva=?,
                sub_total=?, iva_total=?, total_general=?, alcance=?, politica_garantia=?,
                formas_pago=?, notas=?, updated_at=?
            WHERE id=?
        ''', (
            data.get('tipo', quote['tipo']),
            data.get('client_id', quote['client_id']),
            data.get('cliente_nombre', quote['cliente_nombre']),
            data.get('cliente_documento', quote['cliente_documento']),
            data.get('destinatario', quote['destinatario']),
            data.get('asunto', quote['asunto']),
            data.get('fecha_emision', quote['fecha_emision']),
            data.get('fecha_validez', quote['fecha_validez']),
            incluye_iva,
            sub_total, iva_total, total_general,
            data.get('alcance', quote['alcance']),
            data.get('politica_garantia', quote['politica_garantia']),
            data.get('formas_pago', quote['formas_pago']),
            data.get('notas', quote['notas']),
            now, quote_id
        ))

        # Replace items
        conn.execute("DELETE FROM quote_items WHERE quote_id = ?", (quote_id,))
        for i, item in enumerate(items):
            conn.execute('''
                INSERT INTO quote_items (quote_id, opcion, item_num, descripcion,
                    detalle_tecnico, cantidad, precio_unitario, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                quote_id,
                item.get('opcion', 'unica'),
                i + 1,
                item.get('descripcion', ''),
                item.get('detalle_tecnico', ''),
                float(item.get('cantidad', 1)),
                float(item.get('precio_unitario', 0)),
                item['total_linea']
            ))

        # Reset pdf_generado when editing
        conn.execute("UPDATE quotes SET pdf_generado = 0 WHERE id = ?", (quote_id,))

        conn.commit()
        return jsonify({'ok': True, 'total_general': total_general})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ── ELIMINAR ─────────────────────────────────────────────────────────

@api_quotes_bp.route('/api/cotizaciones/<quote_id>', methods=['DELETE'])
@login_required
def delete_quote(quote_id):
    conn = get_db()
    try:
        quote = conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)).fetchone()
        if not quote:
            return jsonify({'error': 'Cotización no encontrada'}), 404

        conn.execute("UPDATE quotes SET activo = 0, updated_at = ? WHERE id = ?",
                     (now_iso(), quote_id))
        conn.commit()

        # Delete PDF if exists
        pdf_path = os.path.join(QUOTES_PDF_DIR, f'{quote_id}.pdf')
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

        return jsonify({'ok': True})
    finally:
        conn.close()


# ── GENERAR PDF con WeasyPrint ───────────────────────────────────────

def _find_weasyprint():
    """Find weasyprint executable."""
    candidates = [
        '/home/peku/.local/bin/weasyprint',
        '/usr/local/bin/weasyprint',
        '/usr/bin/weasyprint',
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    # Try which
    try:
        result = subprocess.run(['which', 'weasyprint'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except:
        pass
    return None


@api_quotes_bp.route('/api/cotizaciones/<quote_id>/pdf', methods=['POST'])
@login_required
def generate_quote_pdf(quote_id):
    """Generate PDF for a quote using WeasyPrint."""
    conn = get_db()
    try:
        quote = conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)).fetchone()
        if not quote:
            return jsonify({'error': 'Cotización no encontrada'}), 404

        items = conn.execute(
            "SELECT * FROM quote_items WHERE quote_id = ? ORDER BY opcion, item_num",
            (quote_id,)
        ).fetchall()

        empresa = get_empresa_config()

        # Choose template
        template_name = 'cotizacion_formal.html' if quote['tipo'] == 'formal' else 'cotizacion_normal.html'

        ensure_quotes_dir()
        pdf_path = os.path.join(QUOTES_PDF_DIR, f'{quote_id}.pdf')
        html_path = os.path.join(QUOTES_PDF_DIR, f'{quote_id}.html')

        # Group items by opcion
        items_list = [dict(i) for i in items]
        opciones = {}
        for item in items_list:
            opcion = item.get('opcion', 'unica')
            if opcion not in opciones:
                opciones[opcion] = []
            opciones[opcion].append(item)

        # Render HTML
        html_content = render_template(
            template_name,
            quote=dict(quote),
            items=items_list,
            opciones=opciones,
            empresa=empresa,
            now=datetime.now()
        )

        # Write HTML to temp file
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        # Generate PDF with WeasyPrint
        weasyprint_bin = _find_weasyprint()
        if weasyprint_bin:
            try:
                result = subprocess.run(
                    [weasyprint_bin, html_path, pdf_path],
                    capture_output=True, text=True, timeout=30
                )
                if result.returncode == 0 and os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 500:
                    conn.execute("UPDATE quotes SET pdf_generado = 1, updated_at = ? WHERE id = ?",
                                 (now_iso(), quote_id))
                    conn.commit()
                    return jsonify({'ok': True, 'pdf_path': pdf_path})
                else:
                    logger.error(f"WeasyPrint failed: {result.stderr}")
            except Exception as e:
                logger.error(f"WeasyPrint error: {e}")

        # Fallback: use weasyprint Python API directly
        try:
            from weasyprint import HTML
            HTML(filename=html_path).write_pdf(pdf_path)
            if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 500:
                conn.execute("UPDATE quotes SET pdf_generado = 1, updated_at = ? WHERE id = ?",
                             (now_iso(), quote_id))
                conn.commit()
                return jsonify({'ok': True, 'pdf_path': pdf_path})
        except ImportError:
            pass
        except Exception as e:
            logger.error(f"WeasyPrint Python API error: {e}")

        # Clean up HTML
        if os.path.exists(html_path):
            try:
                os.remove(html_path)
            except:
                pass

        return jsonify({'error': 'No se pudo generar el PDF'}), 500
    finally:
        conn.close()


@api_quotes_bp.route('/api/cotizaciones/<quote_id>/pdf', methods=['GET'])
@login_required
def download_quote_pdf(quote_id):
    """Download or preview existing PDF."""
    pdf_path = os.path.join(QUOTES_PDF_DIR, f'{quote_id}.pdf')

    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) < 500:
        # Try to generate on the fly
        conn = get_db()
        try:
            quote = conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)).fetchone()
            if not quote:
                return jsonify({'error': 'Cotización no encontrada'}), 404

            items = conn.execute(
                "SELECT * FROM quote_items WHERE quote_id = ? ORDER BY opcion, item_num",
                (quote_id,)
            ).fetchall()

            empresa = get_empresa_config()
            template_name = 'cotizacion_formal.html' if quote['tipo'] == 'formal' else 'cotizacion_normal.html'

            items_list = [dict(i) for i in items]
            opciones = {}
            for item in items_list:
                opcion = item.get('opcion', 'unica')
                if opcion not in opciones:
                    opciones[opcion] = []
                opciones[opcion].append(item)

            ensure_quotes_dir()
            html_path = os.path.join(QUOTES_PDF_DIR, f'{quote_id}.html')

            html_content = render_template(
                template_name,
                quote=dict(quote),
                items=items_list,
                opciones=opciones,
                empresa=empresa,
                now=datetime.now()
            )

            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(html_content)

            try:
                from weasyprint import HTML
                HTML(filename=html_path).write_pdf(pdf_path)
            except ImportError:
                pass
            except Exception as e:
                logger.error(f"WeasyPrint error: {e}")

            if os.path.exists(html_path):
                try:
                    os.remove(html_path)
                except:
                    pass
        finally:
            conn.close()

    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 500:
        return send_file(pdf_path, mimetype='application/pdf',
                        download_name=f'cotizacion_{quote_id}.pdf')

    # If still no PDF, return HTML preview
    conn = get_db()
    try:
        quote = conn.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)).fetchone()
        if not quote:
            return '<p>Cotización no encontrada</p>', 404

        items = conn.execute(
            "SELECT * FROM quote_items WHERE quote_id = ? ORDER BY opcion, item_num",
            (quote_id,)
        ).fetchall()

        empresa = get_empresa_config()
        template_name = 'cotizacion_formal.html' if quote['tipo'] == 'formal' else 'cotizacion_normal.html'

        items_list = [dict(i) for i in items]
        opciones = {}
        for item in items_list:
            opcion = item.get('opcion', 'unica')
            if opcion not in opciones:
                opciones[opcion] = []
            opciones[opcion].append(item)

        return render_template(
            template_name,
            quote=dict(quote),
            items=items_list,
            opciones=opciones,
            empresa=empresa,
            now=datetime.now()
        )
    finally:
        conn.close()
