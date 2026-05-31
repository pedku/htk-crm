"""
F2.1 — Recordatorio de facturas por vencer.
Script para cron: detecta facturas emitidas próximas a vencer y envía WhatsApp.
"""
import sys, os, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, DB_PATH
from app.core.db import get_db
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('recordatorios')

# Ensure recordatorios_enviados table exists
def _ensure_table():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recordatorios_enviados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            factura_id TEXT NOT NULL,
            fecha TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(factura_id, fecha)
        )
    """)
    conn.commit()

def run():
    app = create_app()
    with app.app_context():
        _ensure_table()
        db = get_db()
        hoy = datetime.now().date()
        limite = hoy + timedelta(days=3)

        # Facturas emitidas, no pagadas, que vencen en ≤3 días
        facturas = db.execute("""
            SELECT f.id, f.numero, f.total_general, f.fecha_vencimiento,
                   c.nombre, c.telefono
            FROM invoices f
            JOIN clients c ON c.id = f.client_id
            WHERE f.estado = 'emitida'
              AND f.fecha_vencimiento <= ?
              AND NOT EXISTS (
                  SELECT 1 FROM recordatorios_enviados r
                  WHERE r.factura_id = f.id AND r.fecha = ?
              )
        """, (str(limite), str(hoy))).fetchall()

        if not facturas:
            logger.info("Sin facturas por recordar hoy")
            return

        for fac in facturas:
            try:
                vence = datetime.strptime(fac['fecha_vencimiento'], '%Y-%m-%d').date()
                dias = (vence - hoy).days
                telefono = str(fac['telefono'] or '').strip()
                if not telefono:
                    logger.warning("Factura %s sin telefono", fac['numero'])
                    continue

                if dias < 0:
                    msg = (f"⚠️ HTK INGENIERIA — Hola {fac['nombre']}, tu factura "
                           f"{fac['numero']} por ${fac['total_general']:,.0f} COP "
                           f"venció hace {abs(dias)} día(s). Por favor contáctanos.")
                else:
                    msg = (f"⚡ HTK INGENIERIA — Hola {fac['nombre']}, tu factura "
                           f"{fac['numero']} por ${fac['total_general']:,.0f} COP "
                           f"vence el {vence.strftime('%d/%m/%Y')}.")

                # Enviar WhatsApp via bot_service
                sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
                from app.services.bot_service import send_whatsapp
                ok = send_whatsapp(telefono, msg)

                if ok:
                    db.execute(
                        "INSERT INTO recordatorios_enviados (factura_id, fecha) VALUES (?, ?)",
                        (fac['id'], str(hoy))
                    )
                    db.commit()
                    logger.info("Recordatorio OK: %s → %s", fac['numero'], telefono)
                else:
                    logger.error("Fallo envio recordatorio %s", fac['numero'])
            except Exception as e:
                logger.error("Error procesando %s: %s", fac['numero'], e)

if __name__ == '__main__':
    run()
