// ============================================
// HTK CRM — COTIZACIONES Module
// ============================================

let cotizaciones = [];
let currentQuoteViewId = null;
let currentQuoteEditId = null;

const POLITICA_GARANTIA_DEFAULT = `HTK INGENIERIA (HOUSETRONIK S.A.S.) garantiza el transformador del equipo ofertado por un periodo de un (1) año, contado a partir de la fecha de entrega, contra defectos de fábrica y fallos de funcionamiento imputables al proceso de fabricación del mismo, así como por acondicionamiento y ajuste. La presente garantía se limita exclusivamente al transformador, elemento fabricado directamente por nuestra empresa, bajo la condición de que el equipo haya sido operado dentro de los parámetros eléctricos y condiciones de uso para los cuales fue diseñado.

Quedan excluidos de la cobertura de garantía: los componentes internos de conmutación, control y accesorios (relés, contactores, tableros, cableado interno, entre otros); así como daños ocasionados por mal uso, uso inadecuado, manipulación por personal no autorizado, sobretensiones o descargas atmosféricas, conexiones incorrectas, y en general cualquier condición de operación que exceda el rango normal de funcionamiento del equipo. Los componentes de conmutación y control cuentan con mantenimiento preventivo y correctivo disponible por separado.

Los equipos ofertados son fabricados bajo pedido y diseñados de acuerdo con las necesidades específicas de cada cliente. En consecuencia, no se aceptan devoluciones del equipo, ya sea en dinero o en especie, salvo que medie un mutuo acuerdo entre las partes debidamente formalizado.

Para hacer efectiva la garantía, el cliente deberá presentar el presente documento de cotización o la factura correspondiente, y facilitar la revisión técnica del equipo en nuestras instalaciones ubicadas en la ciudad de Barranquilla.`;

// ── Quote search clients debounce ──
let _quoteClientTimer = null;
function quoteSearchClientsDebounce() {
  clearTimeout(_quoteClientTimer);
  _quoteClientTimer = setTimeout(quoteSearchClients, 250);
}

async function quoteSearchClients() {
  const q = document.getElementById('cotClientSearch').value.trim();
  const dd = document.getElementById('cotClientDropdown');
  if (q.length < 2) { dd.style.display = 'none'; return; }
  try {
    const resp = await fetch('/api/clients?q=' + encodeURIComponent(q));
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) {
      dd.innerHTML = '<div class="px-2 py-1" style="color:rgba(255,255,255,0.4);">Sin resultados</div>';
      dd.style.display = 'block';
      return;
    }
    dd.innerHTML = data.map(c => {
      const name = c.nombre || '';
      const doc = c.documento || '';
      const tel = c.telefono || '';
      return '<div class="client-search-item" onclick="selectQuoteClient(\'' + c.id + '\', \'' + escHtml(name).replace(/'/g, "\\'") + '\')">' +
        '<strong>' + escHtml(name) + '</strong>' +
        (doc ? ' <small style="color:rgba(255,255,255,0.4);">' + escHtml(doc) + '</small>' : '') +
        (tel ? '<br><small style="color:rgba(255,255,255,0.3);">' + escHtml(tel) + '</small>' : '') +
        '</div>';
    }).join('');
    dd.style.display = 'block';
  } catch(e) { console.error('quoteSearchClients:', e); }
}

function selectQuoteClient(id, name) {
  document.getElementById('cotClientId').value = id;
  document.getElementById('cotClientSearch').value = name;
  document.getElementById('cotClientDropdown').style.display = 'none';
}

// ── Load Cotizaciones ──
async function loadCotizaciones() {
  const statusEl = document.getElementById('cotStatusMsg');
  if (statusEl) statusEl.textContent = 'Cargando...';
  try {
    const resp = await fetch('/api/cotizaciones');
    const data = await resp.json();
    if (Array.isArray(data)) {
      cotizaciones = data;
      if (statusEl) statusEl.textContent = data.length + ' cotizaciones cargadas';
    } else if (data && data.error) {
      if (statusEl) statusEl.textContent = 'Error API: ' + data.error;
      console.error('Cotizaciones API error:', data);
    }
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Error red: ' + e.message;
    console.error('loadCotizaciones:', e);
  }
  renderCotizacionesTable();
}

function filterCotizacionesDT() {
  renderCotizacionesTable();
}

function renderCotizacionesTable() {
  var tbody = document.getElementById('cotBody');
  var empty = document.getElementById('cotEmpty');
  var estadoFilter = document.getElementById('cotEstadoFilter');
  var tipoFilter = document.getElementById('cotTipoFilter');
  var searchInput = document.getElementById('cotSearchInput');
  var estadoVal = estadoFilter ? estadoFilter.value : '';
  var tipoVal = tipoFilter ? tipoFilter.value : '';
  var searchVal = (searchInput ? searchInput.value : '').toLowerCase().trim();

  if (!tbody) return;

  var data = cotizaciones || [];
  if (estadoVal) {
    data = data.filter(function(q) { return q.estado === estadoVal; });
  }
  if (tipoVal) {
    data = data.filter(function(q) { return q.tipo === tipoVal; });
  }
  if (searchVal) {
    data = data.filter(function(q) {
      return (q.cliente_nombre || '').toLowerCase().includes(searchVal) ||
             (q.numero || '').toLowerCase().includes(searchVal) ||
             (q.asunto || '').toLowerCase().includes(searchVal);
    });
  }

  if (!data.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  var badges = {
    'borrador': '<span class="badge bg-secondary">BORRADOR</span>',
    'enviada': '<span class="badge bg-info">ENVIADA</span>',
    'aprobada': '<span class="badge bg-success">APROBADA</span>',
    'rechazada': '<span class="badge bg-danger">RECHAZADA</span>'
  };

  var tipoBadges = {
    'formal': '<span class="badge" style="background:rgba(5,155,218,0.2);color:#059BDA;">FORMAL</span>',
    'normal': '<span class="badge" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);">NORMAL</span>'
  };

  var rows = '';
  for (var i = 0; i < data.length; i++) {
    var q = data[i];
    var btns = '<button class="action-btn primary" onclick="viewCotizacion(\'' + q.id + '\')" title="Ver"><i class="bi bi-eye"></i></button>';
    btns += '<button class="action-btn primary" onclick="showCotizacionModal(\'' + q.id + '\')" title="Editar"><i class="bi bi-pencil"></i></button>';
    btns += '<button class="action-btn primary" style="color:#dc3545;" onclick="generateQuotePDF(\'' + q.id + '\')" title="PDF"><i class="bi bi-file-pdf"></i></button>';
    btns += '<button class="action-btn danger" onclick="deleteCotizacion(\'' + q.id + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>';

    rows += '<tr>';
    rows += '<td><a href="#" onclick="viewCotizacion(\'' + q.id + '\');return false;" style="color:var(--htk-primary);font-weight:600;">' + escHtml(q.numero) + '</a></td>';
    rows += '<td>' + escHtml(q.cliente_nombre || '—') + '</td>';
    rows += '<td><small>' + escHtml(q.asunto || '—') + '</small></td>';
    rows += '<td><small>' + (q.fecha_emision || '').slice(0, 10) + '</small></td>';
    rows += '<td>' + (tipoBadges[q.tipo] || '<span class="badge bg-secondary">' + (q.tipo || 'normal').toUpperCase() + '</span>') + '</td>';
    rows += '<td><strong>$' + ((q.total_general || 0)).toLocaleString('es-CO') + '</strong></td>';
    rows += '<td>' + (badges[q.estado] || '<span class="badge bg-secondary">' + (q.estado || 'borrador').toUpperCase() + '</span>') + '</td>';
    rows += '<td><div class="d-flex gap-1">' + btns + '</div></td>';
    rows += '</tr>';
  }
  tbody.innerHTML = rows;
}

// ── Modal ──
function onCotTipoChange() {
  var tipo = document.getElementById('cotTipo').value;
  var destGroup = document.getElementById('cotDestinatarioGroup');
  if (tipo === 'formal') {
    destGroup.classList.remove('d-none');
  } else {
    destGroup.classList.add('d-none');
  }
}

async function showCotizacionModal(id) {
  currentQuoteEditId = id || null;
  document.getElementById('cotEditId').value = id || '';
  document.getElementById('cotizacionModalTitle').textContent = id ? 'Editar Cotización' : 'Nueva Cotización';

  // Reset search
  document.getElementById('cotClientId').value = '';
  document.getElementById('cotClientSearch').value = '';
  document.getElementById('cotClientDropdown').style.display = 'none';

  var today = new Date().toISOString().slice(0, 10);
  document.getElementById('cotFechaEmision').value = today;
  document.getElementById('cotTipo').value = 'normal';
  document.getElementById('cotDestinatarioGroup').classList.add('d-none');
  document.getElementById('cotAsunto').value = '';
  document.getElementById('cotDestinatario').value = '';
  document.getElementById('cotIncluyeIva').checked = false;
  document.getElementById('cotAlcance').value = '';
  document.getElementById('cotFormasPago').value = '';
  document.getElementById('cotGarantia').value = POLITICA_GARANTIA_DEFAULT;
  document.getElementById('cotNotas').value = '';

  document.getElementById('cotItemsContainer').innerHTML = '';

  if (id) {
    try {
      const quote = await fetchJSON('/api/cotizaciones/' + id);
      if (quote) {
        document.getElementById('cotTipo').value = quote.tipo || 'normal';
        document.getElementById('cotAsunto').value = quote.asunto || '';
        document.getElementById('cotDestinatario').value = quote.destinatario || '';
        document.getElementById('cotFechaEmision').value = (quote.fecha_emision || '').slice(0, 10);
        document.getElementById('cotIncluyeIva').checked = !!quote.incluye_iva;
        document.getElementById('cotAlcance').value = quote.alcance || '';
        document.getElementById('cotFormasPago').value = quote.formas_pago || '';
        document.getElementById('cotGarantia').value = quote.politica_garantia || POLITICA_GARANTIA_DEFAULT;
        document.getElementById('cotNotas').value = quote.notas || '';

        if (quote.client_id) {
          document.getElementById('cotClientId').value = quote.client_id;
          document.getElementById('cotClientSearch').value = quote.cliente_nombre || '';
        } else if (quote.cliente_nombre) {
          document.getElementById('cotClientSearch').value = quote.cliente_nombre;
        }

        onCotTipoChange();

        var container = document.getElementById('cotItemsContainer');
        container.innerHTML = '';
        (quote.items || []).forEach(function(item) {
          addQuoteItem(
            item.opcion, item.descripcion, item.detalle_tecnico,
            item.cantidad, item.precio_unitario
          );
        });
        updateCotizacionPreview();
      }
    } catch(e) { console.error(e); }
  } else {
    addQuoteItem();
    updateCotizacionPreview();
  }

  updateCotizacionPreview();
  var modal = new bootstrap.Modal(document.getElementById('cotizacionModal'));
  modal.show();
}

function addQuoteItem(opcion, desc, detalle, cant, precio) {
  var container = document.getElementById('cotItemsContainer');
  var div = document.createElement('div');
  div.className = 'quote-item-row d-flex gap-2 align-items-end mb-2 p-2';
  div.style.cssText = 'background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;';
  div.innerHTML = `
    <div style="width:110px;">
      <select class="form-select form-select-sm quote-item-opcion" onchange="updateCotizacionPreview()">
        <option value="unica" ${opcion === 'unica' ? 'selected' : ''}>Única</option>
        <option value="opcion_1" ${opcion === 'opcion_1' ? 'selected' : ''}>Opción 1</option>
        <option value="opcion_2" ${opcion === 'opcion_2' ? 'selected' : ''}>Opción 2</option>
      </select>
    </div>
    <div style="flex:1;min-width:180px;">
      <input type="text" class="form-control form-control-sm quote-item-desc" value="${escHtml(desc||'')}" placeholder="Descripción" oninput="updateCotizacionPreview()">
    </div>
    <div style="flex:0.8;min-width:120px;">
      <input type="text" class="form-control form-control-sm quote-item-detalle" value="${escHtml(detalle||'')}" placeholder="Detalle técnico" oninput="updateCotizacionPreview()">
    </div>
    <div style="width:80px;">
      <input type="number" class="form-control form-control-sm quote-item-cant" value="${cant||1}" min="0.1" step="0.1" oninput="updateCotizacionPreview()" style="-moz-appearance:textfield;">
      <style>.quote-item-cant::-webkit-inner-spin-button,.quote-item-cant::-webkit-outer-spin-button,.quote-item-precio::-webkit-inner-spin-button,.quote-item-precio::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}</style>
    </div>
    <div style="width:110px;">
      <input type="number" class="form-control form-control-sm quote-item-precio" value="${precio||0}" min="0" step="1000" oninput="updateCotizacionPreview()">
    </div>
    <div style="width:110px;">
      <span class="quote-item-total" style="font-weight:600;color:#fff;">$0</span>
    </div>
    <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.quote-item-row').remove();updateCotizacionPreview();" title="Quitar"><i class="bi bi-trash"></i></button>
  `;
  container.appendChild(div);
  updateCotizacionPreview();
}

function updateCotizacionPreview() {
  var sub = 0;
  document.querySelectorAll('.quote-item-row').forEach(function(row) {
    var cant = parseFloat(row.querySelector('.quote-item-cant')?.value) || 0;
    var precio = parseFloat(row.querySelector('.quote-item-precio')?.value) || 0;
    var total = cant * precio;
    var totalEl = row.querySelector('.quote-item-total');
    if (totalEl) totalEl.textContent = '$' + Math.round(total).toLocaleString('es-CO');
    sub += total;
  });
  sub = Math.round(sub);

  var ivaCol = document.getElementById('cotIvaCol');
  var incluyeIva = document.getElementById('cotIncluyeIva').checked;
  var iva = incluyeIva ? Math.round(sub * 0.19) : 0;
  var total = Math.round(sub + iva);

  document.getElementById('cotPreviewSub').textContent = '$' + sub.toLocaleString('es-CO');
  if (incluyeIva) {
    ivaCol.style.display = '';
    document.getElementById('cotPreviewIva').textContent = '$' + iva.toLocaleString('es-CO');
  } else {
    ivaCol.style.display = 'none';
    document.getElementById('cotPreviewIva').textContent = '$0';
  }
  document.getElementById('cotPreviewTotal').textContent = '$' + total.toLocaleString('es-CO');
}

function collectQuoteItems() {
  var items = [];
  document.querySelectorAll('.quote-item-row').forEach(function(row) {
    var desc = row.querySelector('.quote-item-desc')?.value?.trim();
    if (!desc) return;
    items.push({
      opcion: row.querySelector('.quote-item-opcion')?.value || 'unica',
      descripcion: desc,
      detalle_tecnico: row.querySelector('.quote-item-detalle')?.value?.trim() || '',
      cantidad: parseFloat(row.querySelector('.quote-item-cant')?.value) || 1,
      precio_unitario: parseFloat(row.querySelector('.quote-item-precio')?.value) || 0
    });
  });
  return items;
}

async function saveCotizacion() {
  var id = document.getElementById('cotEditId').value;

  var items = collectQuoteItems();
  if (!items.length) { alert('Agrega al menos un item'); return; }

  var body = {
    tipo: document.getElementById('cotTipo').value,
    client_id: document.getElementById('cotClientId').value,
    cliente_nombre: document.getElementById('cotClientSearch').value.trim(),
    cliente_documento: '',
    destinatario: document.getElementById('cotDestinatario').value,
    asunto: document.getElementById('cotAsunto').value,
    fecha_emision: document.getElementById('cotFechaEmision').value,
    incluye_iva: document.getElementById('cotIncluyeIva').checked ? 1 : 0,
    alcance: document.getElementById('cotAlcance').value,
    politica_garantia: document.getElementById('cotGarantia').value,
    formas_pago: document.getElementById('cotFormasPago').value,
    notas: document.getElementById('cotNotas').value,
    items: items
  };

  try {
    var url = id ? '/api/cotizaciones/' + id : '/api/cotizaciones';
    var method = id ? 'PUT' : 'POST';
    var resp = await fetch(API + url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin'
    });
    if (!resp.ok) {
      var text = await resp.text();
      var err = text.startsWith('<!') ? { error: 'Sesión expirada' } : JSON.parse(text);
      throw new Error(err.error || 'Error al guardar');
    }
    var data = await resp.json();
    bootstrap.Modal.getInstance(document.getElementById('cotizacionModal')).hide();
    showToast(id ? 'Cotización actualizada ✅' : 'Cotización ' + data.numero + ' creada ✅', 'success');
    loadCotizaciones();
  } catch(e) { alert('Error: ' + e.message); }
}

async function viewCotizacion(id) {
  currentQuoteViewId = id;
  var modal = new bootstrap.Modal(document.getElementById('cotizacionViewModal'));
  modal.show();

  try {
    // Try loading PDF first
    var respPdf = await fetch(API + '/api/cotizaciones/' + id + '/pdf');
    var ct = respPdf.headers.get('content-type') || '';
    var iframe = document.getElementById('cotizacionPreviewIframe');

    if (ct.includes('application/pdf')) {
      var blob = await respPdf.blob();
      var url = URL.createObjectURL(blob);
      iframe.src = url;
    } else {
      var html = await respPdf.text();
      iframe.srcdoc = html;
    }
  } catch(e) {
    console.error('viewCotizacion:', e);
    document.getElementById('cotizacionPreviewIframe').srcdoc = '<p style="text-align:center;padding:40px;color:#999;font-family:sans-serif;">Error al cargar cotización</p>';
  }
}

async function generateQuotePDF(id) {
  if (!id) {
    showToast('Guarda la cotización primero antes de generar el PDF', 'warning');
    return;
  }
  try {
    showToast('Generando PDF...', 'info');
    var resp = await fetch(API + '/api/cotizaciones/' + id + '/pdf', {
      method: 'POST',
      credentials: 'same-origin'
    });
    if (!resp.ok) {
      var text = await resp.text();
      var err = text.startsWith('<!') ? { error: 'Error al generar PDF' } : JSON.parse(text);
      throw new Error(err.error || 'Error al generar PDF');
    }
    var data = await resp.json();
    if (data.ok) {
      showToast('PDF generado ✅', 'success');
      // If view modal is open, refresh it
      if (currentQuoteViewId === id) {
        viewCotizacion(id);
      }
    } else {
      showToast(data.error || 'Error al generar PDF', 'danger');
    }
  } catch(e) {
    showToast('Error: ' + e.message, 'danger');
  }
}

async function deleteCotizacion(id) {
  if (!confirm('¿Eliminar esta cotización? Se marcará como inactiva.')) return;
  try {
    var resp = await fetch(API + '/api/cotizaciones/' + id, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (!resp.ok) {
      var text = await resp.text();
      handleFetchError(resp);
      return;
    }
    showToast('Cotización eliminada ✅', 'success');
    bootstrap.Modal.getInstance(document.getElementById('cotizacionViewModal'))?.hide();
    loadCotizaciones();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

function imprimirCotizacion(id) {
  try {
    var iframe = document.getElementById('cotizacionPreviewIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    } else {
      // Fallback: open in new window
      var w = window.open('', '_blank', 'width=900,height=700');
      w.document.write(iframe.srcdoc);
      w.document.close();
      setTimeout(function() { w.print(); }, 400);
    }
  } catch(e) {
    alert('Error al imprimir: ' + e.message);
  }
}

async function enviarCotWhatsApp(id) {
  if (!confirm('¿Enviar esta cotización por WhatsApp al cliente?')) return;

  try {
    // Get quote details to find client phone
    var quote = await fetchJSON('/api/cotizaciones/' + id);
    if (!quote) { showToast('Cotización no encontrada', 'danger'); return; }

    var telefono = '';
    if (quote.cliente && quote.cliente.telefono) {
      telefono = quote.cliente.telefono;
    }

    if (!telefono) {
      showToast('No se encontró teléfono del cliente. Envío solo por texto.', 'warning');
    }

    var total = quote.total_general || 0;
    var caption = '⚡ *HTK INGENIERIA* — Cotización ' + quote.numero + '\n\n' +
      'Cliente: ' + (quote.cliente_nombre || '—') + '\n' +
      'Asunto: ' + (quote.asunto || '—') + '\n' +
      'Total: $' + total.toLocaleString('es-CO') + '\n\n' +
      'Gracias por confiar en nosotros ⚡';

    showToast('Función de envío WhatsApp en desarrollo. Se copió el mensaje al portapapeles.', 'info');

    // Copy text to clipboard
    try {
      await navigator.clipboard.writeText(caption);
    } catch(e) {}
  } catch(e) {
    showToast('Error: ' + e.message, 'danger');
  }
}
