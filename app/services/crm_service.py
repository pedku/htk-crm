"""Service layer for CRM Lead↔Client sync and conversion."""


def sync_lead_to_client(conn, lead_id, lead_data):
    """
    Sync lead fields to linked client when a lead is updated.
    
    Args:
        conn: DB connection
        lead_id: Lead ID
        lead_data: dict with updated lead fields
    """
    client = conn.execute(
        "SELECT id FROM clients WHERE lead_id = ?", (lead_id,)
    ).fetchone()
    if not client:
        return

    sync_fields = {
        'nombre': 'nombre',
        'telefono': 'telefono',
        'segmento': 'segmento',
        'linea_interes': 'linea_interes',
        'fuente': 'fuente',
        'notas': 'notas',
        'contacto': 'contacto_nombre',
        'contacto_nombre': 'contacto_nombre',
        'email': 'email',
    }

    client_updates = []
    client_params = []
    for lead_key, client_key in sync_fields.items():
        if lead_key in lead_data:
            client_updates.append(f"{client_key} = ?")
            client_params.append(lead_data[lead_key])

    if client_updates:
        client_params.append(client['id'])
        conn.execute(
            f"UPDATE clients SET {', '.join(client_updates)} WHERE id = ?",
            client_params
        )


def sync_client_to_lead(conn, client_id, client_data):
    """
    Sync client fields to linked lead when a client is updated.
    
    Args:
        conn: DB connection
        client_id: Client ID
        client_data: dict with updated client fields
    """
    lead_row = conn.execute(
        "SELECT lead_id FROM clients WHERE id = ?", (client_id,)
    ).fetchone()
    if not lead_row or not lead_row['lead_id']:
        return

    linked_lead_id = lead_row['lead_id']

    sync_fields = {
        'nombre': 'nombre',
        'telefono': 'telefono',
        'segmento': 'segmento',
        'linea_interes': 'linea_interes',
        'fuente': 'fuente',
        'notas': 'notas',
        'contacto_nombre': 'contacto_nombre',
        'email': 'email',
    }

    lead_updates = []
    lead_params = []
    for client_key, lead_key in sync_fields.items():
        if client_key in client_data:
            lead_updates.append(f"{lead_key} = ?")
            lead_params.append(client_data[client_key])

    if lead_updates:
        lead_params.append(linked_lead_id)
        conn.execute(
            f"UPDATE leads SET {', '.join(lead_updates)} WHERE id = ?",
            lead_params
        )


def convert_lead_to_client(conn, lead):
    """
    Given a lead DB row, create a corresponding client row.
    Does NOT commit - caller must commit.
    
    Args:
        conn: DB connection
        lead: Lead DB row (dict-like)
    
    Returns:
        new_client_id: str
    """
    from app.core.db import next_id, now_iso

    new_id = next_id('CLI', 'clients')
    now = now_iso()

    conn.execute("""
        INSERT INTO clients (id, telefono, nombre, fuente, primer_contacto, ultimo_contacto,
            interacciones_totales, estado, segmento, linea_interes, lead_id, notas,
            contacto_nombre, email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        new_id,
        lead['telefono'],
        lead['nombre'],
        lead['fuente'],
        now,
        now,
        0,
        'cliente',
        lead['segmento'],
        lead['linea_interes'],
        lead['id'],
        lead['notas'] or '',
        lead['contacto_nombre'] or lead['contacto'] or '',
        lead['email'] or ''
    ))

    conn.execute("UPDATE leads SET estado = 'cliente' WHERE id = ?", (lead['id'],))
    return new_id