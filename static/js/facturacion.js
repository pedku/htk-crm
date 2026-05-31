// ============================================
// HTK CRM — FACTURACION Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

async function loadFacturas() {
  const statusEl = document.getElementById('factStatusMsg');
  if (statusEl) statusEl.textContent = 'Cargando...';
  try {
    const resp = await fetch('/api/facturas');
    const data = await resp.json();
    if (Array.isArray(data)) {
      facturas = data;
      if (statusEl) statusEl.textContent = data.length + ' facturas cargadas';
    } else if (data && data.error) {
      if (statusEl) statusEl.textContent = 'Error API: ' + data.error;
      console.error('Facturas API error:', data);
    }
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Error red: ' + e.message;
    console.error('loadFacturas:', e);
  }
  renderFacturasTable();
}

function filterFacturasDT() {
  renderFacturasTable();
}

function renderFacturasTable() {
  var tbody = document.getElementById('factBody');
  var empty = document.getElementById('factEmpty');
  var filter = document.getElementById('factEstadoFilter');
  var estadoVal = filter ? filter.value : '';
  
  if (!tbody) return;
  
  var data = facturas || [];
  if (estadoVal) {
    data = data.filter(function(f) { return f.estado === estadoVal; });
  }
  
  if (!data.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  
  if (empty) empty.style.display = 'none';
  
  var badges = {
    'borrador': '<span class="badge bg-secondary">BORRADOR</span>',
    'emitida': '<span class="badge bg-warning text-dark">EMITIDA</span>',
    'pagada': '<span class="badge bg-success">PAGADA</span>',
    'vencida': '<span class="badge bg-danger">VENCIDA</span>',
    'anulada': '<span class="badge bg-dark">ANULADA</span>'
  };
  
  var rows = '';
  for (var i = 0; i < data.length; i++) {
    var f = data[i];
    var btns = '<button class="action-btn primary" onclick="showFacturaDetail(\'' + f.id + '\')" title="Ver"><i class="bi bi-eye"></i></button>';
    if (f.estado === 'borrador') {
      btns += '<button class="action-btn primary" onclick="showFacturaModal(\'' + f.id + '\')" title="Editar"><i class="bi bi-pencil"></i></button>';
      btns += '<button class="action-btn danger" onclick="anularFactura(\'' + f.id + '\')" title="Anular"><i class="bi bi-x-circle"></i></button>';
      btns += '<button class="action-btn danger" onclick="eliminarBorrador(\'' + f.id + '\')" title="Eliminar permanentemente" style="color:#dc3545;"><i class="bi bi-trash"></i></button>';
    }
    if (f.estado === 'emitida' || f.estado === 'vencida') {
      btns += '<button class="action-btn primary" style="color:#198754;" onclick="pagarFactura(\'' + f.id + '\')" title="Pagar"><i class="bi bi-check-circle"></i></button>';
    }
    rows += '<tr>';
    rows += '<td><a href="#" onclick="showFacturaDetail(\'' + f.id + '\');return false;" style="color:var(--htk-primary);font-weight:600;">' + escHtml(f.numero) + '</a></td>';
    rows += '<td>' + escHtml(f.cliente_nombre || '—') + '</td>';
    rows += '<td><small>' + (f.fecha_emision || '').slice(0,10) + '</small></td>';
    rows += '<td><small>' + (f.fecha_vencimiento || '').slice(0,10) + '</small></td>';
    rows += '<td><strong>$' + ((f.total_general || 0)).toLocaleString('es-CO') + '</strong></td>';
    rows += '<td>' + (badges[f.estado] || '<span class="badge bg-secondary">' + f.estado.toUpperCase() + '</span>') + '</td>';
    rows += '<td><div class="d-flex gap-1">' + btns + '</div></td>';
    rows += '</tr>';
  }
  tbody.innerHTML = rows;
}

async function showFacturaModal(id) {
  document.getElementById('factEditId').value = id || '';
  document.getElementById('facturaModalTitle').textContent = id ? 'Editar Factura' : 'Nueva Factura';

  // Reset search
  document.getElementById('factClientId').value = '';
  document.getElementById('factClientSearch').value = '';
  document.getElementById('factClientDropdown').style.display = 'none';

  // Load WO options
  try {
    const wos = await fetchJSON('/api/work_orders');
    const woSel = document.getElementById('factWoId');
    woSel.innerHTML = '<option value="">Ninguna</option>';
    if (Array.isArray(wos)) {
      wos.forEach(w => {
        woSel.innerHTML += `<option value="${w.id}">${w.id} — ${escHtml(w.cliente_nombre||'')}</option>`;
      });
    }
  } catch(e) {}

  const today = new Date().toISOString().slice(0,10);
  const venc = new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
  document.getElementById('factFechaEmision').value = today;
  document.getElementById('factFechaVenc').value = venc;

  document.getElementById('factItemsContainer').innerHTML = '';
  document.getElementById('factDescuento').value = 0;
  document.getElementById('factNotas').value = '';
  document.getElementById('factMetodoPago').value = '';

  if (id) {
    try {
      const inv = await fetchJSON(`/api/facturas/${id}`);
      if (inv) {
        document.getElementById('factClientId').value = inv.client_id || '';
        document.getElementById('factClientSearch').value = (inv.cliente && inv.cliente.nombre) ? inv.cliente.nombre : '';
        document.getElementById('factWoId').value = inv.wo_id || '';
        document.getElementById('factFechaEmision').value = (inv.fecha_emision||'').slice(0,10);
        document.getElementById('factFechaVenc').value = (inv.fecha_vencimiento||'').slice(0,10);
        document.getElementById('factDescuento').value = inv.descuento || 0;
        document.getElementById('factNotas').value = inv.notas || '';
        document.getElementById('factMetodoPago').value = inv.metodo_pago || '';

        const container = document.getElementById('factItemsContainer');
        container.innerHTML = '';
        (inv.items || []).forEach(item => {
          addFacturaItem(item.descripcion, item.cantidad, item.precio_unitario, item.iva_porcentaje);
          // Set iva_incluido checkbox if applicable
          if (item.iva_incluido) {
            const rows = document.querySelectorAll('.fact-item-row');
            const lastRow = rows[rows.length - 1];
            if (lastRow) {
              const cb = lastRow.querySelector('.fact-item-iva-incl');
              if (cb) cb.checked = true;
            }
          }
        });
        updateFacturaPreview();
      }
    } catch(e) { console.error(e); }
  } else {
    addFacturaItem();
  }

  updateFacturaPreview();
  const modal = new bootstrap.Modal(document.getElementById('facturaModal'));
  modal.show();
}

function addFacturaItem(desc, cant, precio, iva) {
  const container = document.getElementById('factItemsContainer');
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'fact-item-row d-flex gap-2 align-items-end mb-2 p-2';
  div.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.05);';
  div.innerHTML = `
    <div style="flex:1;min-width:160px;">
      <input type="text" class="form-control form-control-sm fact-item-desc" value="${escHtml(desc||'')}" placeholder="Descripción" oninput="updateFacturaPreview()">
    </div>
    <div style="width:90px;">
      <input type="number" class="form-control form-control-sm fact-item-cant" value="${cant||1}" min="0.1" step="0.1" oninput="updateFacturaPreview()" style="-moz-appearance:textfield;">
      <style>.fact-item-cant::-webkit-inner-spin-button,.fact-item-cant::-webkit-outer-spin-button,.fact-item-iva::-webkit-inner-spin-button,.fact-item-iva::-webkit-outer-spin-button,.fact-item-precio::-webkit-inner-spin-button,.fact-item-precio::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}</style>
    </div>
    <div style="width:120px;">
      <input type="number" class="form-control form-control-sm fact-item-precio" value="${precio||0}" min="0" step="1000" oninput="updateFacturaPreview()">
    </div>
    <div style="width:90px;">
      <input type="number" class="form-control form-control-sm fact-item-iva" value="${iva||19}" min="0" max="100" step="0.5" oninput="updateFacturaPreview()" style="-moz-appearance:textfield;">
    </div>
    <div style="width:60px;text-align:center;">
      <div class="form-check">
        <input type="checkbox" class="form-check-input fact-item-iva-incl" onchange="updateFacturaPreview()">
        <label class="form-check-label" style="font-size:0.65rem;color:rgba(255,255,255,0.5);">Incl.</label>
      </div>
    </div>
    <div style="width:110px;">
      <span class="fact-item-total" style="font-weight:600;color:#fff;">$0</span>
    </div>
    <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.fact-item-row').remove();updateFacturaPreview();" title="Quitar"><i class="bi bi-trash"></i></button>
  `;
  container.appendChild(div);
  updateFacturaPreview();
}

function updateFacturaPreview() {
  let sub = 0, iva_total = 0;
  document.querySelectorAll('.fact-item-row').forEach(row => {
    const cant = parseFloat(row.querySelector('.fact-item-cant')?.value) || 0;
    const precio = parseFloat(row.querySelector('.fact-item-precio')?.value) || 0;
    const iva = parseFloat(row.querySelector('.fact-item-iva')?.value) || 0;
    const ivaIncl = row.querySelector('.fact-item-iva-incl')?.checked || false;
    let total, ivaLinea, baseLinea;
    if (ivaIncl) {
      // IVA incluido en el precio — extraer IVA del precio total
      total = cant * precio;
      ivaLinea = cant * precio * iva / (100 + iva);
      baseLinea = total - ivaLinea;  // Base imponible (sin IVA)
    } else {
      // IVA discriminado: total = precio + IVA aparte
      ivaLinea = cant * precio * iva / 100;
      total = cant * precio + ivaLinea;
      baseLinea = cant * precio;
    }
    const totalEl = row.querySelector('.fact-item-total');
    if (totalEl) totalEl.textContent = '$' + Math.round(total).toLocaleString('es-CO');
    sub += baseLinea;
    iva_total += ivaLinea;
  });
  const desc = parseFloat(document.getElementById('factDescuento')?.value) || 0;
  const total = sub + iva_total - desc;
  document.getElementById('factPreviewSub').textContent = '$' + Math.round(sub).toLocaleString('es-CO');
  document.getElementById('factPreviewIva').textContent = '$' + Math.round(iva_total).toLocaleString('es-CO');
  document.getElementById('factPreviewTotal').textContent = '$' + Math.round(total).toLocaleString('es-CO');
}

function collectFacturaItems() {
  const items = [];
  document.querySelectorAll('.fact-item-row').forEach(row => {
    const desc = row.querySelector('.fact-item-desc')?.value?.trim();
    if (!desc) return;
    items.push({
      descripcion: desc,
      cantidad: parseFloat(row.querySelector('.fact-item-cant')?.value) || 1,
      precio_unitario: parseFloat(row.querySelector('.fact-item-precio')?.value) || 0,
      iva_porcentaje: parseFloat(row.querySelector('.fact-item-iva')?.value) || 19,
      iva_incluido: row.querySelector('.fact-item-iva-incl')?.checked ? 1 : 0
    });
  });
  return items;
}

async function saveFactura() {
  const id = document.getElementById('factEditId').value;
  const clientId = document.getElementById('factClientId').value;
  if (!clientId) { alert('Selecciona un cliente'); return; }

  const items = collectFacturaItems();
  if (!items.length) { alert('Agrega al menos un item'); return; }

  const body = {
    client_id: clientId,
    wo_id: document.getElementById('factWoId').value || null,
    fecha_emision: document.getElementById('factFechaEmision').value,
    fecha_vencimiento: document.getElementById('factFechaVenc').value,
    descuento: parseFloat(document.getElementById('factDescuento').value) || 0,
    notas: document.getElementById('factNotas').value,
    metodo_pago: document.getElementById('factMetodoPago').value,
    items: items
  };

  try {
    const url = id ? `/api/facturas/${id}` : '/api/facturas';
    const method = id ? 'PUT' : 'POST';
    const resp = await fetch(API + url, {
      method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), credentials:'same-origin'
    });
    if (!resp.ok) {
      const text = await resp.text();
      const err = text.startsWith('<!') ? {error:'Sesión expirada'} : JSON.parse(text);
      throw new Error(err.error || 'Error al guardar');
    }
    const data = await resp.json();
    bootstrap.Modal.getInstance(document.getElementById('facturaModal')).hide();
    showToast(id ? 'Factura actualizada ✅' : `Factura ${data.numero} creada ✅`, 'success');
    loadFacturas();
  } catch(e) { alert('Error: ' + e.message); }
}

async function showFacturaDetail(id) {
  currentFactViewId = id;
  const modal = new bootstrap.Modal(document.getElementById('facturaViewModal'));
  modal.show();

  try {
    const resp = await fetch(API + `/api/facturas/${id}/pdf`);
    const html = await resp.text();
    const iframe = document.getElementById('facturaPreviewIframe');
    iframe.srcdoc = html;

    const inv = await fetchJSON(`/api/facturas/${id}`);
    const estado = inv?.estado || '';
    document.getElementById('btnEmitirFact').style.display = (estado === 'borrador') ? '' : 'none';
    document.getElementById('btnPagarFact').style.display = (estado === 'emitida' || estado === 'vencida') ? '' : 'none';
    
    // Load linked payments
    await loadFacturaPayments(id, inv);
  } catch(e) { console.error(e); }
}

async function loadFacturaPayments(id, inv) {
  const bar = document.getElementById('factPaymentBar');
  if (!bar) return;
  
  try {
    const payments = await fetchJSON(`/api/facturas/${id}/payments`);
    const total = Number(inv?.total_general || 0);
    var abonado = 0;
    if (Array.isArray(payments)) {
      payments.forEach(p => { abonado += Number(p.monto || 0); });
    }
    abonado = Math.round(abonado * 100) / 100;
    const saldo = Math.round((total - abonado) * 100) / 100;
    const pct = total > 0 ? Math.min(100, Math.round((abonado / total) * 100)) : 0;
    
    bar.style.display = '';
    
    // Progress bar
    document.getElementById('factPaymentBarFill').style.width = pct + '%';
    document.getElementById('factPaymentBarFill').style.background = (abonado >= total) ? '#10b981' : 'var(--htk-primary)';
    document.getElementById('factPaymentText').textContent = '$' + abonado.toLocaleString('es-CO') + ' / $' + total.toLocaleString('es-CO');
    
    // Status badge
    const badge = document.getElementById('factPaymentStatusBadge');
    if (abonado >= total && total > 0) {
      badge.textContent = '✅ PAGADA';
      badge.style.background = 'rgba(16,185,129,0.2)';
      badge.style.color = '#10b981';
      document.getElementById('factPaymentDetail').textContent = 'Saldo: $0';
    } else if (abonado > 0) {
      badge.textContent = '⏳ PARCIAL';
      badge.style.background = 'rgba(245,158,11,0.2)';
      badge.style.color = '#f59e0b';
      document.getElementById('factPaymentDetail').textContent = 'Saldo: $' + saldo.toLocaleString('es-CO');
    } else {
      badge.textContent = '⚪ PENDIENTE';
      badge.style.background = 'rgba(255,255,255,0.1)';
      badge.style.color = 'rgba(255,255,255,0.5)';
      document.getElementById('factPaymentDetail').textContent = '';
    }
    
    // Payment list
    const list = document.getElementById('factPaymentList');
    const tbody = document.getElementById('factPaymentListBody');
    if (Array.isArray(payments) && payments.length > 0) {
      list.style.display = '';
      tbody.innerHTML = payments.map(p => {
        const met = p.metodo || '-';
        const ref = p.referencia || '';
        return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
          '<td style="padding:4px 0;">' + (p.fecha || '').slice(0,10) + '</td>' +
          '<td style="padding:4px 0;color:var(--htk-primary);font-weight:600;">$' + Number(p.monto).toLocaleString('es-CO') + '</td>' +
          '<td style="padding:4px 0;">' + met + '</td>' +
          '<td style="padding:4px 0;color:rgba(255,255,255,0.4);">' + (ref || '') + '</td>' +
          '</tr>';
      }).join('');
    } else {
      list.style.display = 'none';
    }
  } catch(e) {
    console.error('loadFacturaPayments:', e);
    bar.style.display = 'none';
  }
}

async function emitirFactura(id) {
  if (!confirm('¿Emitir esta factura? Ya no se podrá editar.')) return;
  try {
    const resp = await fetch(API + '/api/facturas/' + id + '/emitir', { method:'POST', credentials:'same-origin' });
    if (!resp.ok) { handleFetchError(resp); return; }
    showToast('Factura emitida ✅', 'success');
    bootstrap.Modal.getInstance(document.getElementById('facturaViewModal'))?.hide();
    loadFacturas();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function handleFetchError(resp) {
  const ct = resp.headers.get('content-type') || '';
  const text = await resp.text();
  if (ct.includes('text/html') || text.startsWith('<!')) {
    showToast('Sesión expirada — recarga la página e inicia sesión de nuevo', 'danger');
    setTimeout(() => window.location.href = '/login', 2000);
  } else {
    try { showToast(JSON.parse(text).error || 'Error del servidor', 'danger'); }
    catch(e) { showToast('Error desconocido', 'danger'); }
  }
}

async function pagarFactura(id) {
  if (!confirm('¿Registrar pago de esta factura?')) return;
  console.log('[PAGAR] Iniciando pago para', id, 'API:', API);
  try {
    const resp = await fetch(API + '/api/facturas/' + id + '/pagar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodo_pago: 'CRM' }),
      credentials: 'same-origin'
    });
    console.log('[PAGAR] Respuesta:', resp.status, 'ok:', resp.ok);
    if (!resp.ok) {
      const ct = (resp.headers.get('content-type') || '').split(';')[0];
      const text = await resp.text();
      console.log('[PAGAR] Error! Status:', resp.status, 'CT:', ct, 'Body:', text.substring(0,200));
      if (ct.includes('text/html') || text.startsWith('<!')) {
        throw new Error('Sesión expirada — recarga la página y vuelve a iniciar sesión');
      }
      try { throw new Error(JSON.parse(text).error || 'Error desconocido'); } catch(e) { throw new Error('Error de servidor'); }
    }
    const data = await resp.json();
    showToast('Factura pagada ✅', 'success');
    bootstrap.Modal.getInstance(document.getElementById('facturaViewModal'))?.hide();
    loadFacturas();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function eliminarBorrador(id) {
  if (!confirm('¿Eliminar permanentemente esta factura en borrador? Esta accion no se puede deshacer.')) return;
  try {
    const resp = await fetch(API + '/api/facturas/' + id + '/delete', { method:'DELETE', credentials:'same-origin' });
    if (!resp.ok) { handleFetchError(resp); return; }
    showToast('Borrador eliminado ✅', 'success');
    loadFacturas();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function anularFactura(id) {
  if (!confirm('¿Anular esta factura?')) return;
  try {
    const resp = await fetch(API + '/api/facturas/' + id, { method:'DELETE', credentials:'same-origin' });
    if (!resp.ok) { handleFetchError(resp); return; }
    showToast('Factura anulada', 'warning');
    bootstrap.Modal.getInstance(document.getElementById('facturaViewModal'))?.hide();
    loadFacturas();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function imprimirFactura(id) {
  try {
    const resp = await fetch(API + `/api/facturas/${id}/pdf`);
    const html = await resp.text();
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  } catch(e) {
    alert('Error al cargar la factura: ' + e.message);
  }
}

async function enviarFacturaWhatsApp(id) {
  if (!confirm('¿Enviar esta factura por WhatsApp al cliente?')) return;
  try {
    const resp = await fetch(API + `/api/facturas/${id}/enviar-whatsapp`, { method:'POST', credentials:'same-origin' });
    const data = await resp.json();
    if (data.ok) showToast('Factura enviada por WhatsApp ✅', 'success');
    else showToast(data.error || 'Error al enviar', 'error');
  } catch(e) { alert('Error: ' + e.message); }
}

async function loadFacturasStats() {
  try {
    const stats = await fetchJSON('/api/facturas/stats');
    if (stats) {
      const elP = document.getElementById('statFactPendientes');
      const elV = document.getElementById('statFactVencidas');
      const elM = document.getElementById('statFactTotalMes');
      if (elP) elP.textContent = stats.pendientes || 0;
      if (elV) elV.textContent = stats.vencidas || 0;
      if (elM) elM.textContent = '$' + ((stats.total_mes||0)).toLocaleString('es-CO');
    }
  } catch(e) {}
}


function exportarFacturas() {
  const filtro = document.getElementById('factEstadoFilter');
  const estado = filtro ? filtro.value : '';
  const params = new URLSearchParams({ estado });
  window.location.href = '/api/facturas/export?' + params;
}
