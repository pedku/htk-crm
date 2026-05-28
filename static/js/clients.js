// ============================================
// HTK CRM — CLIENTS Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// ─── CLIENTS ──────────────────────────────────────────
async function loadClients() {
 showLoading('clientsLoading','clientsContent');
 try {
 const data = await fetchJSON('/api/clients');
 if (Array.isArray(data)) clients = data;
 } catch(e) {}
 renderClientsDT();
 updateNotifications();
}

function renderClientsDT() {
  _ensureDTFilters();
  const cols = [
    { data:'id', render: function(d,t,r) {
      let h = `<a href="#" onclick="showClientDetail('${d}');return false;" style="color:var(--htk-primary);font-weight:600;">${d}</a>`;
      if(r.lead_id) h += ` <small style="color:var(--htk-primary);font-size:0.7em;">← ${r.lead_id}</small>`;
      return h;
    }},
    { data:'nombre', render: function(d) { return `<strong>${escHtml(d||'-')}</strong>`; }},
    { data:'telefono', render: function(d) { return escHtml(d||'-'); }},
    { data:'estado', render: function(d) {
      const es = ESTADOS_CLIENTE[d] || {label:d||'nuevo', class:'bg-secondary'};
      return `<span class="badge ${es.class}">${es.label}</span>`;
    }},
    { data:'segmento', render: function(d) { return escHtml(d||'-'); }},
    { data:'linea_interes', render: function(d) { return escHtml(d||'-'); }},
    { data:'ordenes', render: function(d) { return `<span class="badge bg-info">${(d||[]).length}</span>`; }},
    { data:'ultimo_contacto', render: function(d) { return `<small>${formatDate(d)}</small>`; }},
    { data:null, render: function(d,t,r) {
      return `<div class="d-flex gap-1">
 <button class="action-btn primary" onclick="showModal('client','${r.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
 <button class="action-btn primary" onclick="showClientDetail('${r.id}')" title="Ver detalle"><i class="bi bi-eye"></i></button>
 <button class="action-btn danger" onclick="deleteItem('clients','${r.id}','${escHtml(r.nombre||'')}')" title="Eliminar"><i class="bi bi-trash"></i></button>
 </div>`;
    }}
  ];
  dtClients = initDT('tableClients', clients, cols, {
    drawCallback: function() {
      hideLoading('clientsLoading','clientsContent');
      emptyState(null, 'clientsEmpty', this.api().rows({filter:'applied'}).count());
    }
  });
}

async function showClientDetail(id) {
 const c = clients.find(x => x.id === id);
 if (!c) return;

 // Determine phone
 const contactoStr = c.telefono || '';
 let phoneClean = contactoStr.replace(/[^\d+]/g, '');
 if (phoneClean && !phoneClean.startsWith('+')) phoneClean = '+57' + phoneClean.replace(/^57/,'');
 if (phoneClean === '+57') phoneClean = '';
 const initials = (c.nombre || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
 const esCliente = ESTADOS_CLIENTE[c.estado] || {label:c.estado||'nuevo',class:'bg-secondary'};

 // Header card
 let headerHTML = `<div class="contact-profile-card">
 <div class="d-flex align-items-center gap-3 mb-2">
 <div class="contact-avatar">${initials}</div>
 <div>
 <h5 style="color:#fff;margin:0;">${escHtml(c.nombre || '-')}</h5>
 <small style="color:rgba(255,255,255,0.4);">${escHtml(c.segmento||'')}${c.empresa?' · '+escHtml(c.empresa):''}</small>
 </div>
 </div>
 <div class="d-flex flex-wrap gap-1 align-items-center">
 <span class="badge ${esCliente.class}">${esCliente.label}</span>
 <span style="color:rgba(255,255,255,0.3);font-size:0.8em;">${c.id}</span>
 </div>
 </div>`;

 // Tabs
 headerHTML += `<div class="client-profile-tabs">
 <button class="client-profile-tab active" onclick="switchClientTab('${id}','datos')">📋 Datos</button>
 <button class="client-profile-tab" onclick="switchClientTab('${id}','ordenes')">🔧 Órdenes</button>
 <button class="client-profile-tab" onclick="switchClientTab('${id}','historial')">📊 Historial</button>
 <button class="client-profile-tab" onclick="switchClientTab('${id}','pagos')">💰 Pagos</button>
 </div>`;

 // Tab 1: Datos
 let tabDatos = `<div id="clientTab_datos_${id}" class="client-tab-content">
 <div class="row">
 <div class="col-md-6">
 <p><strong>Nombre:</strong> ${escHtml(c.nombre||'-')}</p>
 <p><strong>Teléfono:</strong> ${escHtml(c.telefono||'-')}
 ${phoneClean?` <button class="btn btn-sm btn-link p-0 ms-1" onclick="copyToClipboard('${phoneClean}','copyCli_${id}')" title="Copiar"><i class="bi bi-clipboard" style="color:var(--htk-primary);"></i></button>`:''}
 </p>
 <p><strong>Email:</strong> <span id="cliEmail_${id}">${escHtml(c.email||'-')}</span></p>
 <p><strong>Documento:</strong> ${c.tipo_documento||''} ${escHtml(c.documento||'-')}</p>
 <p><strong>Tipo Persona:</strong> ${c.tipo_persona === 'juridica' ? 'Jurídica' : 'Natural'}</p>
 ${c.tipo_persona === 'juridica' && c.nombre_comercial ? `<p><strong>Nombre Comercial:</strong> ${escHtml(c.nombre_comercial)}</p>` : ''}
 <p><strong>Empresa:</strong> ${escHtml(c.empresa||'-')}</p>
 <p><strong>Cargo:</strong> ${escHtml(c.cargo||'-')}</p>
 </div>
 <div class="col-md-6">
 <p><strong>Dirección:</strong> ${escHtml(c.direccion||'-')}</p>
 <p><strong>Ciudad:</strong> ${escHtml(c.ciudad||'-')}</p>
 <p><strong>Segmento:</strong> ${escHtml(c.segmento||'-')}</p>
 <p><strong>Línea de Interés:</strong> ${escHtml(c.linea_interes||'-')}</p>
 <p><strong>Fuente:</strong> ${escHtml(c.fuente||'-')}</p>
 <p><strong>Cumpleaños:</strong> ${c.cumpleanos ? formatDate(c.cumpleanos) : '-'}</p>
 <p><strong>Redes:</strong> ${escHtml(c.redes_contacto||'-')}</p>
 </div>
 </div>
 <div class="mt-2">
 <p><strong>Notas:</strong></p>
 <div id="notesDisplay_client_${id}" class="notes-display">${c.notas ? escHtml(c.notas) : '<em style="color:rgba(255,255,255,0.3);">Sin notas</em>'}</div>
 <div id="notesEdit_client_${id}" style="display:none;">
 <textarea class="form-control" id="notesTextarea_client_${id}" rows="3">${escHtml(c.notas||'')}</textarea>
 <div class="mt-2 d-flex gap-2">
 <button class="btn btn-sm btn-htk" onclick="saveClientField('${id}','notas',document.getElementById('notesTextarea_client_${id}').value);cancelEditNotes('client','${id}')"><i class="bi bi-check"></i> Guardar</button>
 <button class="btn btn-sm btn-outline-secondary" onclick="cancelEditNotes('client','${id}')">Cancelar</button>
 </div>
 </div>
 <button class="btn btn-sm btn-outline-htk mt-2" onclick="toggleEditNotes('client','${id}')"><i class="bi bi-pencil"></i> Editar notas</button>
 <button class="btn btn-sm btn-outline-htk ms-1" onclick="showModal('client','${id}')"><i class="bi bi-pencil-square"></i> Editar cliente</button>
 </div>
 </div>`;

 // Tab 2: Órdenes (loaded async)
 let tabOrdenes = `<div id="clientTab_ordenes_${id}" class="client-tab-content" style="display:none;">
 <div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>
 </div>`;

 // Tab 3: Historial (loaded async)
 let tabHistorial = `<div id="clientTab_historial_${id}" class="client-tab-content" style="display:none;">
 <div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>
 </div>`;

 // Tab 4: Pagos (loaded async)
 let tabPagos = `<div id="clientTab_pagos_${id}" class="client-tab-content" style="display:none;">
 <div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>
 </div>`;

 const fullHTML = headerHTML + tabDatos + tabOrdenes + tabHistorial + tabPagos;

 setModal('👤 ' + (c.nombre || c.id), fullHTML, 
 `<a href="/leads/${c.lead_id||''}" class="btn btn-sm btn-outline-htk" ${!c.lead_id?'style="display:none"':''}><i class="bi bi-arrow-left-right"></i> Ver Lead</a>`
 );
 modalInstance.show();

 // Load async tabs
 setTimeout(() => loadClientOrdersTab(id), 300);
 setTimeout(() => loadClientHistorialTab(id), 300);
 setTimeout(() => loadClientPaymentsTab(id), 300);
}

function switchClientTab(clientId, tabName) {
 const modalBody = document.getElementById('modalBody');
 modalBody.querySelectorAll('.client-profile-tab').forEach(b => b.classList.remove('active'));
 modalBody.querySelectorAll('.client-tab-content').forEach(c => c.style.display = 'none');
 
 const tabBtn = modalBody.querySelector(`.client-profile-tab[onclick*="'${tabName}'"]`);
 if (tabBtn) tabBtn.classList.add('active');
 
 const tabContent = document.getElementById(`clientTab_${tabName}_${clientId}`);
 if (tabContent) tabContent.style.display = '';
}

async function loadClientOrdersTab(clientId) {
 const container = document.getElementById(`clientTab_ordenes_${clientId}`);
 if (!container) return;
 try {
 const orders = await fetchJSON(`/api/clients/${clientId}/orders`);
 if (orders.length === 0) {
 container.innerHTML = '<div class="text-center py-4" style="color:rgba(255,255,255,0.3);">Sin órdenes de trabajo</div>';
 return;
 }
 container.innerHTML = `<div class="table-responsive"><table class="table table-hover">
 <thead><tr><th>ID</th><th>Equipo</th><th>Estado</th><th>Recibido</th><th>Presupuesto</th><th>Pendiente</th></tr></thead>
 <tbody>${orders.map(o => {
 const es = ESTADOS_WO[o.estado] || {label:o.estado, class:'bg-secondary'};
 const pendiente = o.saldo_pendiente !== null && o.saldo_pendiente > 0 
 ? `<span class="badge bg-warning text-dark">${formatCurrency(o.saldo_pendiente)}</span>` : '<span class="badge bg-success">Pagado</span>';
 return `<tr style="cursor:pointer;" onclick="showWODetail('${o.id}')">
 <td><strong style="color:var(--htk-primary);">${o.id}</strong></td>
 <td>${escHtml(o.equipo_marca||'')} ${escHtml(o.equipo_modelo||'')} <small class="text-secondary">(${escHtml(o.equipo_tipo||'')})</small></td>
 <td><span class="badge ${es.class}">${es.label}</span></td>
 <td><small>${formatDate(o.fecha_recibido)}</small></td>
 <td>${formatCurrency(o.presupuesto)}</td>
 <td>${pendiente}</td>
 </tr>`;
 }).join('')}</tbody></table></div>`;
 } catch(e) {
 container.innerHTML = '<div class="text-center py-4" style="color:#dc3545;">Error al cargar órdenes</div>';
 }
}

async function loadClientHistorialTab(clientId) {
 const container = document.getElementById(`clientTab_historial_${clientId}`);
 if (!container) return;
 try {
 const full = await fetchJSON(`/api/clients/${clientId}`);
 const interacciones = full.interacciones || [];
 if (interacciones.length === 0) {
 container.innerHTML = '<div class="text-center py-4" style="color:rgba(255,255,255,0.3);">Sin interacciones registradas</div>';
 return;
 }
 const ICONOS = {whatsapp:'bi-whatsapp',llamada:'bi-telephone',email:'bi-envelope',presencial:'bi-person-badge',manual:'bi-chat-dots',otro:'bi-chat'};
 const COLORES = {whatsapp:'#25D366',llamada:'#0dcaf0',email:'#6f42c1',presencial:'#ffc107',manual:'var(--htk-primary)',otro:'#6c757d'};
 container.innerHTML = `<div class="timeline">${interacciones.map(int => {
 const icono = ICONOS[int.tipo] || 'bi-chat-dots';
 const color = COLORES[int.tipo] || 'var(--htk-primary)';
 return `<div class="timeline-item">
 <div class="date">${formatDateTime(int.fecha)}</div>
 <div><i class="bi ${icono}" style="color:${color};"></i> <strong>${int.tipo}</strong> — ${int.direccion==='entrante'?'📥':'📤'}</div>
 <small>${escHtml(int.resumen||int.detalle||'')}</small>
 </div>`;
 }).join('')}</div>`;
 } catch(e) {
 container.innerHTML = '<div class="text-center py-4" style="color:#dc3545;">Error al cargar historial</div>';
 }
}

async function loadClientPaymentsTab(clientId) {
 const container = document.getElementById(`clientTab_pagos_${clientId}`);
 if (!container) return;
 try {
 const payments = await fetchJSON(`/api/clients/${clientId}/payments`);
 if (payments.length === 0) {
 container.innerHTML = '<div class="text-center py-4" style="color:rgba(255,255,255,0.3);">Sin pagos registrados</div>';
 return;
 }
 const total = payments.reduce((s,p) => s + (p.monto||0), 0);
 container.innerHTML = `<div class="mb-2" style="font-size:1.1em;"><strong>Total abonado:</strong> <span style="color:var(--htk-primary);">${formatCurrency(total)}</span></div>
 <div class="table-responsive"><table class="table table-hover">
 <thead><tr><th>Fecha</th><th>OT</th><th>Monto</th><th>Método</th><th>Referencia</th></tr></thead>
 <tbody>${payments.map(p => `<tr>
 <td><small>${formatDate(p.fecha)}</small></td>
 <td><a href="#" onclick="showWODetail('${p.wo_id}');return false;" style="color:var(--htk-primary);">${p.wo_id}</a></td>
 <td><strong>${formatCurrency(p.monto)}</strong></td>
 <td>${p.metodo||'-'}</td>
 <td>${escHtml(p.referencia||'-')}</td>
 </tr>`).join('')}</tbody></table></div>`;
 } catch(e) {
 container.innerHTML = '<div class="text-center py-4" style="color:#dc3545;">Error al cargar pagos</div>';
 }
}

async function saveClientField(clientId, field, value) {
 try {
 await fetchJSON('/api/clients/' + clientId, {
 method: 'PUT', headers: {'Content-Type': 'application/json'},
 body: JSON.stringify({[field]: value})
 });
 // Update local cache
 const cl = clients.find(x => x.id === clientId);
 if (cl) cl[field] = value;
 flashSave();
 showToast('✅ Campo actualizado');
 } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

// ÓRDENES DE TRABAJO 
