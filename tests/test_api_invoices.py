"""
Tests: Facturación — F1.1 del ROADMAP v5.
Cubre: creación, IVA incluido/discriminado, emisión, pago, anulación.
"""


def _create_invoice(client, cid, items):
    resp = client.post('/api/facturas', json={
        'client_id': cid, 'fecha_emision': '2026-05-31',
        'fecha_vencimiento': '2026-06-30', 'items': items
    })
    return resp.get_json() if resp.status_code in (200, 201) else None


def _detail(client, inv_id):
    return client.get(f'/api/facturas/{inv_id}').get_json()


def test_create_simple(client, test_client_id):
    """Crear factura básica: 500k + IVA 19% = 595k."""
    data = _create_invoice(client, test_client_id, [{
        'descripcion': 'Mantenimiento', 'cantidad': 1,
        'precio_unitario': 500000, 'iva_porcentaje': 19, 'iva_incluido': 0
    }])
    assert data and data['total_general'] == 595000.0
    d = _detail(client, data['id'])
    assert d['iva_total'] == 95000.0 and d['sub_total'] == 500000.0


def test_iva_incluido(client, test_client_id):
    """IVA incluido: NO duplica (bug histórico)."""
    data = _create_invoice(client, test_client_id, [{
        'descripcion': 'IVA incl', 'cantidad': 1,
        'precio_unitario': 119000, 'iva_porcentaje': 19, 'iva_incluido': 1
    }])
    assert data and data['total_general'] == 119000.0
    d = _detail(client, data['id'])
    assert d['iva_total'] == 19000.0 and d['sub_total'] == 100000.0


def test_mixed_iva(client, test_client_id):
    """Items mixtos: total correcto."""
    data = _create_invoice(client, test_client_id, [
        {'descripcion': 'Sin IVA', 'cantidad': 2,
         'precio_unitario': 100000, 'iva_porcentaje': 19, 'iva_incluido': 0},
        {'descripcion': 'Con IVA', 'cantidad': 1,
         'precio_unitario': 119000, 'iva_porcentaje': 19, 'iva_incluido': 1}
    ])
    assert data and data['total_general'] == 357000.0
    d = _detail(client, data['id'])
    assert d['sub_total'] == 300000.0 and d['iva_total'] == 57000.0


def test_no_client_fails(client):
    """Factura sin cliente rechazada."""
    resp = client.post('/api/facturas', json={
        'items': [{'descripcion': 'Test', 'cantidad': 1,
                   'precio_unitario': 1000, 'iva_porcentaje': 19}]
    })
    assert resp.status_code in (400, 500)


def test_emit(client, test_client_id):
    """Emitir cambia estado."""
    d = _create_invoice(client, test_client_id, [
        {'descripcion': 'Test', 'cantidad': 1,
         'precio_unitario': 100000, 'iva_porcentaje': 19}
    ])
    r = client.post(f'/api/facturas/{d["id"]}/emitir')
    assert r.status_code == 200 and r.get_json()['estado'] == 'emitida'
    assert _detail(client, d['id'])['estado'] == 'emitida'


def test_pay(client, test_client_id):
    """Pagar cambia a pagada."""
    d = _create_invoice(client, test_client_id, [
        {'descripcion': 'Pago test', 'cantidad': 1,
         'precio_unitario': 200000, 'iva_porcentaje': 19}
    ])
    client.post(f'/api/facturas/{d["id"]}/emitir')
    r = client.post(f'/api/facturas/{d["id"]}/pagar',
                    json={'metodo_pago': 'Transferencia'})
    assert r.status_code == 200 and r.get_json()['estado'] == 'pagada'
    det = _detail(client, d['id'])
    assert det['estado'] == 'pagada' and det.get('pagada_fecha')


def test_void(client, test_client_id):
    """Anular desactiva factura."""
    d = _create_invoice(client, test_client_id, [
        {'descripcion': 'Void', 'cantidad': 1,
         'precio_unitario': 50000, 'iva_porcentaje': 19}
    ])
    r = client.delete(f'/api/facturas/{d["id"]}')
    assert r.status_code == 200 and r.get_json()['estado'] == 'anulada'
    det = _detail(client, d['id'])
    assert det['estado'] == 'anulada' and det['activo'] == 0


def test_pdf_preview(client, test_client_id):
    """PDF devuelve HTML."""
    d = _create_invoice(client, test_client_id, [
        {'descripcion': 'PDF test', 'cantidad': 1,
         'precio_unitario': 100000, 'iva_porcentaje': 19}
    ])
    r = client.get(f'/api/facturas/{d["id"]}/pdf')
    assert r.status_code == 200
    assert 'text/html' in r.content_type and b'HTK' in r.data


def test_items_persisted(client, test_client_id):
    """Items guardados con campos correctos."""
    d = _create_invoice(client, test_client_id, [{
        'descripcion': 'Item test', 'cantidad': 3,
        'precio_unitario': 50000, 'iva_porcentaje': 19, 'iva_incluido': 0
    }])
    det = _detail(client, d['id'])
    item = det.get('items', [None])[0]
    assert item is not None
    assert item['descripcion'] == 'Item test'
    assert item['cantidad'] == 3.0
    assert item['iva_incluido'] == 0
    assert item['total_linea'] == 178500.0
