// ============================================
// HTK CRM — WORK ORDERS Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// ─── WORK ORDERS ─────────────────────────────────────
async function loadWorkOrders() {
 showLoading('woLoading','woContent');
 try {
 const data = await fetchJSON('/api/work_orders');
 if (Array.isArray(data)) workOrders = data;
 } catch(e) {}
 renderWOsDT();
 updateNotifications();
}

function filterWOsDT() {
  _ensureDTFilters();
  if (dtWOs) dtWOs.draw();
}

function renderWOsDT() {
  _ensureDTFilters();
  const cols = [
    { data:'id', render: function(d) { return `<a href="#" onclick="showWODetail('${d}');return false;" style="color:var(--htk-primary);text-decoration:none;font-weight:600;">${d}</a>`; }},
    { data:'tipo', render: function(d,t,r) {
      const ti = TIPOS_OT[d] || {};
      return `<span class="badge" style="background:${ti.color||'#f97316'};color:#fff;font-size:0.75em;">${ti.icono||'🔧'} ${ti.label||'Reparación'}</span>`;
    }},
    { data:null, render: function(d,t,r) {
      const ti = TIPOS_OT[r.tipo] || {};
      return `<a href="#" onclick="showWODetail('${r.id}');return false;" style="color:#fff;text-decoration:none;"><span title="${ti.label||r.tipo||'Reparación'}">${ti.icono||'🔧'}</span> ${escHtml(r.cliente?.nombre || '-')}</a>`;
    }},
    { data:'cliente', render: function(d) { return escHtml(d?.telefono || '-'); }},
    { data:null, render: function(d,t,r) {
      const eq = r.equipo || {};
      return `${escHtml(eq.marca||'')} ${escHtml(eq.modelo||'')} <small class="text-secondary">(${escHtml(eq.tipo||'')})</small>`;
    }},
    { data:'falla_reportada', render: function(d) {
      return `<span title="${escHtml(d||'')}" style="max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(d||'-')}</span>`;
    }},
    { data:'presupuesto', render: function(d) { return formatCurrency(d); }},
    { data:'estado', render: function(d) {
      const es = ESTADOS_WO[d] || {label:d, class:'bg-secondary'};
      return `<span class="badge ${es.class}">${es.label}</span>`;
    }},
    { data:'fechas', render: function(d) { return `<small>${formatDate(d?.recibido)}</small>`; }},
    { data:null, render: function(d,t,r) {
      return `<div class="d-flex gap-1">
 <button class="action-btn primary" onclick="showModal('workorder','${r.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
 <button class="action-btn primary" onclick="showWODetail('${r.id}')" title="Ver detalle"><i class="bi bi-eye"></i></button>
 <button class="action-btn primary" onclick="showStatusModal('${r.id}')" title="Cambiar estado"><i class="bi bi-arrow-right-circle"></i></button>
 <button class="action-btn danger" onclick="deleteItem('work_orders','${r.id}','${r.id}')" title="Eliminar"><i class="bi bi-trash"></i></button>
 </div>`;
    }}
  ];
  dtWOs = initDT('tableWOs', workOrders, cols, {
    drawCallback: function() {
      hideLoading('woLoading','woContent');
      emptyState(null, 'woEmpty', this.api().rows({filter:'applied'}).count());
    }
  });
  // Connect status filter
  $('#woStatusFilter').off('change.dt').on('change.dt', filterWOsDT);
}

// ─── Custom DataTables filters (registered once) ─────
var _dtFiltersAdded = false;
function _ensureDTFilters() {
  if (_dtFiltersAdded || !dtAvailable()) return;
  _dtFiltersAdded = true;
  
  // WO: filter by estado
  $.fn.dataTable.ext.search.push(function(settings, data, dataIdx) {
    if (settings.nTable.id !== 'tableWOs') return true;
    var st = document.getElementById('woStatusFilter');
    var val = st ? st.value : '';
    if (!val) return true;
    var row = dtWOs ? dtWOs.row(dataIdx).data() : null;
    return row && row.estado === val;
  });
  
  // Leads: filter by segmento, estado, servicio
  $.fn.dataTable.ext.search.push(function(settings, data, dataIdx) {
    if (settings.nTable.id !== 'tableLeads') return true;
    var l = dtLeads ? dtLeads.row(dataIdx).data() : null;
    if (!l) return true;
    var seg = (document.getElementById('leadSegmentFilter')||{}).value || '';
    var est = (document.getElementById('leadEstadoFilter')||{}).value || '';
    var svc = (document.getElementById('leadServicioFilter')||{}).value || '';
    if (seg && l.segmento !== seg) return false;
    if (est && (l.estado || 'nuevo') !== est) return false;
    if (svc && (l.linea_interes || '') !== svc) return false;
    return true;
  });
}

async function showWODetail(id) {
 setLastWO(id);
 // Reload fresh data from API to get client_vinculado + payments
 let o;
 try {
 o = await fetchJSON('/api/work_orders/' + id);
 // Update local cache
 const idx = workOrders.findIndex(x => x.id === id);
 if (idx >= 0) workOrders[idx] = o;
 } catch(e) {
 o = workOrders.find(x => x.id === id);
 }
 if (!o) return;

 const tipoInfo = TIPOS_OT[o.tipo] || {};
 const cv = o.cliente_vinculado;

 // Client card (with vinculado data if available)
 let headerHTML = '';
 if (cv && cv.id) {
 headerHTML += `<div class="client-mini-card">
 <div class="d-flex justify-content-between align-items-start">
 <div>
 <div class="cli-name">👤 ${escHtml(cv.nombre||o.cliente?.nombre||'-')}</div>
 <div class="cli-meta">
 ${cv.telefono?'📞 '+escHtml(cv.telefono)+' · ':''}
 ${cv.empresa?'🏢 '+escHtml(cv.empresa)+' · ':''}
 ${cv.ciudad?'📍 '+escHtml(cv.ciudad):''}
 </div>
 ${cv.ordenes_previas !== undefined ? `<div class="cli-meta mt-1">🔧 ${cv.ordenes_previas} órdenes · 💰 Total facturado: ${formatCurrency(cv.total_facturado)}</div>` : ''}
 </div>
 <button class="btn btn-sm btn-outline-htk" onclick="showClientDetail('${cv.id}')" title="Ver perfil completo">
 <i class="bi bi-person-badge"></i> Perfil →
 </button>
 </div>
 </div>`;
 } else {
 // Fallback: basic client card from WO data
 const contactoStr = o.cliente?.telefono || '';
 let phoneClean = contactoStr.replace(/[^\d+]/g, '');
 if (phoneClean && !phoneClean.startsWith('+')) phoneClean = '+57' + phoneClean.replace(/^57/,'');
 const initials = (o.cliente?.nombre || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
 headerHTML = '<div class="contact-profile-card">' +
 '<div class="d-flex align-items-center gap-3 mb-2">' +
 '<div class="contact-avatar">' + initials + '</div>' +
 '<div><h5 style="color:#fff;margin:0;">' + escHtml(o.cliente?.nombre || '-') + '</h5></div>' +
 '</div>';
 if (phoneClean) {
 headerHTML += '<div class="d-flex gap-2">' +
 '<button class="contact-action-btn flex-fill" onclick="copyToClipboard(\''+phoneClean+'\',\'copyWO_'+id+'\')"><i class="bi bi-telephone-fill" style="color:var(--htk-primary);"></i> ' + phoneClean + '</button>' +
 '<a class="contact-action-btn flex-fill" href="https://wa.me/' + phoneClean.replace(/\+/g,'') + '?text=Hola%20' + encodeURIComponent(o.cliente?.nombre||'') + '%2C%20te%20escribimos%20de%20HTK%20INGENIERIA%20sobre%20tu%20orden%20'+o.id+'" target="_blank"><i class="bi bi-whatsapp" style="color:#25D366;"></i> WhatsApp</a>' +
 '</div>';
 }
 headerHTML += '</div>';
 }

 // Campos extra
 const camposExtra = (typeof o.campos_extra === 'string') ? JSON.parse(o.campos_extra||'{}') : (o.campos_extra || {});
 let camposExtraHTML = '';
 if (Object.keys(camposExtra).length > 0) {
 const formatLabel = k => k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
 const boolFields = ['requiere_obra_civil'];
 camposExtraHTML = '<div class="section-title mt-3"><i class="bi bi-gear"></i> Detalles — ' + (tipoInfo.label || 'Reparación') + '</div><div class="row">';
 Object.entries(camposExtra).forEach(([k, v]) => {
 if (v === null || v === undefined || v === '') return;
 let displayVal = v;
 if (boolFields.includes(k)) displayVal = v ? '✅ Sí' : '❌ No';
 camposExtraHTML += `<div class="col-md-6"><p><strong>${formatLabel(k)}:</strong> ${escHtml(String(displayVal))}</p></div>`;
 });
 camposExtraHTML += '</div>';
 }

 // Main data
 let detailHTML = headerHTML + `
 <div class="row mb-3">
 <div class="col-md-6">
 <p><strong>ID:</strong> ${o.id} <span class="badge" style="background:${tipoInfo.color||'#f97316'};color:#fff;">${tipoInfo.icono||'🔧'} ${tipoInfo.label||'Reparación'}</span></p>
 <p><strong>Cliente:</strong> ${escHtml(o.cliente?.nombre || '-')}</p>
 <p><strong>Teléfono:</strong> ${escHtml(o.cliente?.telefono || '-')}</p>
 <p><strong>Equipo:</strong> ${escHtml(o.equipo?.marca||'')} ${escHtml(o.equipo?.modelo||'')} <span class="text-secondary">(${escHtml(o.equipo?.tipo||'')})</span></p>
 <p><strong>Falla Reportada:</strong> ${escHtml(o.falla_reportada || '-')}</p>
 </div>
 <div class="col-md-6">
 <p><strong>Diagnóstico:</strong> ${escHtml(o.diagnostico || 'Pendiente')}</p>
 <p><strong>Estado:</strong> <span class="badge ${ESTADOS_WO[o.estado]?.class||'bg-secondary'}">${ESTADOS_WO[o.estado]?.label||o.estado}</span></p>
 <p><strong>Notas Internas:</strong> ${escHtml(o.notas_internas || '-')}</p>
 </div>
 </div>
 ${camposExtraHTML}`;

 // ── FINANZAS Section ──
 const presupuesto = o.presupuesto || 0;
 const abonado = o.total_abonado || 0;
 const pendiente = o.saldo_pendiente !== null ? o.saldo_pendiente : (presupuesto - abonado);
 const pctPagado = presupuesto > 0 ? Math.round((abonado / presupuesto) * 100) : 0;
 const payments = o.payments || [];

 detailHTML += `<div class="finance-card">
 <div class="section-title mb-2">💰 Finanzas</div>
 <div class="row mb-2">
 <div class="col-4"><small style="color:rgba(255,255,255,0.5);">Presupuesto</small><br><strong>${formatCurrency(presupuesto)}</strong></div>
 <div class="col-4"><small style="color:rgba(255,255,255,0.5);">Abonado</small><br><strong style="color:var(--htk-primary);">${formatCurrency(abonado)}</strong></div>
 <div class="col-4"><small style="color:rgba(255,255,255,0.5);">Pendiente</small><br><strong style="color:${pendiente>0?'#ffc107':'#198754'};">${formatCurrency(pendiente)}</strong></div>
 </div>
 <div class="finance-bar">
 <div class="finance-bar-fill" style="width:${pctPagado}%;"></div>
 </div>
 <div style="font-size:0.8em;color:rgba(255,255,255,0.4);">${pctPagado}% completado</div>`;

 if (payments.length > 0) {
 detailHTML += `<div class="mt-2"><small style="color:rgba(255,255,255,0.5);">Historial de pagos:</small>`;
 payments.forEach(p => {
 detailHTML += `<div class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid rgba(255,255,255,0.04);">
 <span><small>${formatDate(p.fecha)}</small> — ${formatCurrency(p.monto)} <span class="badge bg-secondary">${p.metodo||''}</span></span>
 <small style="color:rgba(255,255,255,0.4);">${escHtml(p.notas||'')}</small>
 </div>`;
 });
 detailHTML += `</div>`;
 }

 detailHTML += `<div class="mt-3">
 <div class="d-flex justify-content-between align-items-center mb-2">
  <strong style="font-size:0.85rem;">💰 Abonos</strong>
  <div class="d-flex gap-1">
   <button class="btn btn-sm btn-htk" onclick="showPaymentModal('${o.id}')"><i class="bi bi-plus-lg"></i> Registrar</button>
   <button class="btn btn-sm btn-outline-success" onclick="emitirFacturaDesdeOT('${o.id}')" title="Emitir factura por esta OT"><i class="bi bi-receipt"></i> Facturar</button>
  </div>
 </div>
 <div id="paymentsList_${o.id}"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>
 </div>`;

 // ── Historial ──
 detailHTML += `<hr>
 <div class="section-title"><i class="bi bi-clock-history"></i> Historial de Estados</div>
 <div class="timeline">
 ${(o.historial||[]).slice().reverse().map(h => `
 <div class="timeline-item">
 <div class="date">${formatDateTime(h.fecha)}</div>
 <div><span class="badge ${ESTADOS_WO[h.estado]?.class||'bg-secondary'}">${ESTADOS_WO[h.estado]?.label||h.estado}</span></div>
 <small>${escHtml(h.descripcion)}</small>
 </div>
 `).join('')}
 </div>`;

 // ── Fechas ──
 detailHTML += `<hr>
 <div class="section-title"><i class="bi bi-calendar-event"></i> Fechas</div>
 <div class="row">
 <div class="col-md-4"><small>Recibido:</small><br><strong>${formatDateTime(o.fechas?.recibido)}</strong></div>
 <div class="col-md-4"><small>Diagnóstico:</small><br><strong>${formatDateTime(o.fechas?.diagnostico)||'Pendiente'}</strong></div>
 <div class="col-md-4"><small>Completado:</small><br><strong>${formatDateTime(o.fechas?.completado)||'Pendiente'}</strong></div>
 </div>`;

 setModal('🔧 Detalle OT: ' + o.id, detailHTML, 
 `<div class="d-flex gap-2">
  <button class="btn btn-sm btn-outline-light" onclick="copyToClipboard('${o.id}','copyWO_${o.id}')"><i class="bi bi-clipboard"></i> Copiar ID</button>
  <button class="btn btn-sm btn-outline-success" onclick="notifyClient('${o.id}')"><i class="bi bi-whatsapp"></i> Notificar</button>
  <button class="btn btn-sm btn-outline-htk" onclick="showStatusModal('${o.id}')"><i class="bi bi-arrow-right-circle"></i> Cambiar Estado</button>
  <a href="/ordenes/${o.id}" class="btn btn-sm btn-htk"><i class="bi bi-box-arrow-up-right"></i> Ver perfil</a>
 </div>`
 );
 modalInstance.show();
 loadPaymentsList(o.id);
}

function showStatusModal(id) {
 const o = workOrders.find(x => x.id === id);
 if (!o) return;

 const statusOrder = getWOStatusOrder(o.tipo || 'reparacion');
 const options = statusOrder.map(s => `<option value="${s}" ${s===o.estado?'selected':''}>${ESTADOS_WO[s]?.label||s}</option>`).join('');

 let detailHTML = `
 <p><strong>Orden:</strong> ${o.id} — ${escHtml(o.cliente?.nombre||'')} (${escHtml(o.equipo?.marca||'')} ${escHtml(o.equipo?.modelo||'')})</p>
 <div class="mb-3">
 <label class="form-label">Estado actual</label>
 <div>
 <span class="badge ${ESTADOS_WO[o.estado]?.class||'bg-secondary'} fs-6">${ESTADOS_WO[o.estado]?.label||o.estado}</span>
 </div>
 </div>
 <div class="mb-3">
 <label class="form-label">Nuevo estado</label>
 <select class="form-select" id="newStatus">${options}</select>
 </div>
 <div class="mb-3">
 <label class="form-label">Descripción del cambio</label>
 <textarea class="form-control" id="statusDesc" rows="2" placeholder="¿Qué se hizo?"></textarea>
 </div>
 <div class="mb-3">
 <label class="form-label">Presupuesto (COP) — si aplica</label>
 <input class="form-control" id="statusBudget" type="number" placeholder="Ej: 250000" value="${o.presupuesto||''}">
 </div>
 <div class="mb-3">
 <label class="form-label">Diagnóstico — si aplica</label>
 <textarea class="form-control" id="statusDiagnostico" rows="2" placeholder="Diagnóstico técnico...">${escHtml(o.diagnostico||'')}</textarea>
 </div>`;

 setModal(' Cambiar Estado — ' + o.id, detailHTML,
 `<div class="d-flex gap-2">
  <button class="btn btn-sm btn-outline-light" onclick="backToWODetail()"><i class="bi bi-arrow-left"></i> Volver a detalles</button>
  <button class="btn btn-htk" onclick="updateStatus('${id}')"><i class="bi bi-check-lg"></i> Actualizar Estado</button>
 </div>`
 );
 modalInstance.show();
}

async function notifyClient(woId) {
  const o = workOrders.find(x => x.id === woId);
  if (!o) return;
  const phone = (o.cliente?.telefono || '').replace(/[^\d+]/g, '');
  if (!phone) { showToast('No hay teléfono del cliente', 'warning'); return; }
  let p = phone;
  if (!p.startsWith('+')) p = '+57' + p.replace(/^57/, '');
  const msg = encodeURIComponent('Hola ' + (o.cliente?.nombre || '') + ', te escribimos de HTK INGENIERIA sobre tu orden ' + woId + '. Estado actual: ' + (ESTADOS_WO[o.estado]?.label || o.estado) + '.');
  window.open('https://wa.me/' + p.replace(/\+/g, '') + '?text=' + msg, '_blank');
  showToast('Abriendo WhatsApp para notificar...');
}

async function updateStatus(id) {
 const estado = document.getElementById('newStatus').value;
 const descripcion = document.getElementById('statusDesc').value || `Estado cambiado a ${ESTADOS_WO[estado]?.label||estado}`;
 const presupuesto = document.getElementById('statusBudget').value ? parseFloat(document.getElementById('statusBudget').value) : undefined;
 const diagnostico = document.getElementById('statusDiagnostico').value || undefined;

 try {
 const body = { estado, descripcion };
 if (presupuesto !== undefined) body.presupuesto = presupuesto;
 if (diagnostico) body.diagnostico = diagnostico;

 body.force = true;
 await fetch(`/api/work_orders/${id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
 modalInstance.hide();
 flashSave();
 showToast('Estado actualizado correctamente');
 await loadWorkOrders();
 await loadClients();
 updateNotifications();
 } catch(e) { showToast('Error al actualizar estado', 'danger'); }
}


// ── PAYMENT MODAL ──────────────────────────────────────────────────

function showPaymentModal(woId) {
  const o = workOrders.find(x => x.id === woId);
  if (!o) return;

  const total = parseFloat(o.valor_total || o.presupuesto || 0);
  const abonado = parseFloat(o.total_abonado || 0);
  const pendiente = Math.max(0, total - abonado);

  const html = `
  <p><strong>Orden:</strong> ${o.id} — ${escHtml(o.cliente?.nombre||'')}</p>
  <p><strong>Total OT:</strong> ${formatCurrency(total)} · <strong>Abonado:</strong> ${formatCurrency(abonado)} · <strong style="color:var(--htk-primary);">Pendiente: ${formatCurrency(pendiente)}</strong></p>
  <div class="mb-3">
    <label class="form-label">Monto <span class="text-danger">*</span> <small class="text-muted">(máx: ${formatCurrency(pendiente)})</small></label>
    <input class="form-control" id="payMonto" type="number" placeholder="Ej: 150000" min="1" max="${pendiente}" step="1">
  </div>
  <div class="mb-3">
    <label class="form-label">Método de pago</label>
    <select class="form-select" id="payMetodo">
      <option value="efectivo">💵 Efectivo</option>
      <option value="transferencia">🏦 Transferencia</option>
      <option value="nequi" selected>📱 Nequi</option>
      <option value="daviplata">📱 Daviplata</option>
      <option value="otro">Otro</option>
    </select>
  </div>
  <div class="mb-3">
    <label class="form-label">Referencia</label>
    <input class="form-control" id="payReferencia" placeholder="Ej: Comprobante #1234">
  </div>
  <div class="mb-3">
    <label class="form-label">Notas</label>
    <textarea class="form-control" id="payNotas" rows="2" placeholder="Notas adicionales..."></textarea>
  </div>
  <div class="mb-3">
    <label class="form-label">Fecha</label>
    <input class="form-control" id="payFecha" type="date" value="${new Date().toISOString().split('T')[0]}">
  </div>`;

  setModal('💰 Registrar Abono — ' + woId, html,
    `<div class="d-flex gap-2">
     <button class="btn btn-sm btn-outline-light" onclick="backToWODetail()"><i class="bi bi-arrow-left"></i> Volver a detalles</button>
     <button class="btn btn-htk" onclick="savePayment('${woId}')"><i class="bi bi-check-lg"></i> Registrar</button>
    </div>`
  );
  modalInstance.show();
}

async function savePayment(woId) {
  const monto = document.getElementById('payMonto')?.value;
  if (!monto || parseFloat(monto) <= 0) { showToast('Ingrese un monto válido', 'danger'); return; }
  
  const data = {
    monto: parseFloat(monto),
    tipo: 'abono',
    metodo: document.getElementById('payMetodo')?.value || 'nequi',
    referencia: document.getElementById('payReferencia')?.value || '',
    notas: document.getElementById('payNotas')?.value || '',
    fecha: document.getElementById('payFecha')?.value || new Date().toISOString().split('T')[0]
  };

  try {
    await fetchJSON('/api/work_orders/' + woId + '/payments', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    modalInstance.hide();
    flashSave();
    showToast('✅ Abono registrado');
    // Refresh WO detail if open
    const modalEl = document.getElementById('genericModal');
    if (modalEl && modalEl.classList.contains('show')) {
      showWODetail(woId);
    }
    await loadWorkOrders();
  } catch(e) { showToast('Error al registrar abono: ' + e.message, 'danger'); }
}

async function loadPaymentsList(woId) {
  var el = document.getElementById('paymentsList_' + woId);
  if (!el) return;
  try {
    var resp = await fetch('/api/work_orders/' + woId + '/payments');
    var payments = await resp.json();
    if (!payments || !payments.length) {
      el.innerHTML = '<small style="color:rgba(255,255,255,0.3);">Sin abonos registrados</small>';
      return;
    }
    var html = '<div style="max-height:250px;overflow-y:auto;">';
    for (var i = 0; i < payments.length; i++) {
      var p = payments[i];
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.85rem;">';
      html += '<div>';
      html += '<strong style="color:#fff;">$' + (p.monto||0).toLocaleString('es-CO') + '</strong>';
      html += ' <small style="color:rgba(255,255,255,0.4);">' + escHtml(p.metodo||'') + '</small>';
      if (p.referencia) html += ' <small style="color:rgba(255,255,255,0.3);">#' + escHtml(p.referencia) + '</small>';
      html += '<br><small style="color:rgba(255,255,255,0.3);">' + (p.fecha||'').slice(0,10) + '</small>';
      if (p.notas) html += ' <small style="color:rgba(255,255,255,0.3);">— ' + escHtml(p.notas) + '</small>';
      html += '</div>';
      html += '<div class="d-flex gap-1">';
      html += '<button class="action-btn primary" onclick="editPayment(' + p.id + ',\'' + woId + '\',' + p.monto + ')" title="Editar"><i class="bi bi-pencil"></i></button>';
      html += '<button class="action-btn danger" onclick="deletePayment(' + p.id + ',\'' + woId + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>';
      html += '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<small style="color:rgba(255,255,255,0.3);">Error al cargar abonos</small>';
    console.error('loadPaymentsList:', e);
  }
}

function editPayment(paymentId, woId, currentMonto) {
  var nuevo = prompt('Editar monto:', currentMonto);
  if (!nuevo || isNaN(parseFloat(nuevo)) || parseFloat(nuevo) <= 0) return;
  fetch('/api/work_orders/' + woId + '/payments/' + paymentId, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({monto: parseFloat(nuevo)})
  }).then(function() {
    loadPaymentsList(woId);
    loadWorkOrders();
    flashSave();
    showToast('Abono actualizado ✅', 'success');
  }).catch(function(e) { showToast('Error: ' + e.message, 'danger'); });
}

function deletePayment(paymentId, woId) {
  if (!confirm('¿Eliminar este abono?')) return;
  fetch('/api/work_orders/' + woId + '/payments/' + paymentId, {method: 'DELETE'})
    .then(function() {
      loadPaymentsList(woId);
      loadWorkOrders();
      flashSave();
      showToast('Abono eliminado', 'warning');
    }).catch(function(e) { showToast('Error: ' + e.message, 'danger'); });
}

async function emitirFacturaDesdeOT(woId) {
  var o = workOrders.find(function(x) { return x.id === woId; });
  if (!o) return;
  var total = parseFloat(o.valor_total || o.presupuesto || 0);
  if (!total || total <= 0) { alert('La OT no tiene valor total definido. Edítala primero.'); return; }
  if (!o.client_id) { alert('La OT no tiene cliente vinculado. Edítala primero.'); return; }
  if (!confirm('¿Crear factura por ' + formatCurrency(total) + ' para la OT ' + woId + '?')) return;
  try {
    var resp = await fetch('/api/facturas', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client_id: o.client_id,
        wo_id: woId,
        fecha_emision: new Date().toISOString().slice(0,10),
        fecha_vencimiento: new Date(Date.now() + 30*86400000).toISOString().slice(0,10),
        items: [{
          descripcion: 'OT ' + woId + ' — ' + (o.equipo?.tipo||'') + ' ' + (o.equipo?.marca||'') + ' ' + (o.equipo?.modelo||''),
          cantidad: 1,
          precio_unitario: total,
          iva_porcentaje: 0
        }]
      })
    });
    if (!resp.ok) { var txt = await resp.text(); throw new Error(txt.startsWith('<!') ? 'Sesión expirada' : txt); }
    var data = await resp.json();
    showToast('Factura ' + data.numero + ' creada ✅', 'success');
    if (modalInstance) modalInstance.hide();
    navigateToTab('facturacion');
  } catch(e) { alert('Error al facturar: ' + e.message); }
}

