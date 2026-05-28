// ============================================
// HTK CRM — INTERACTIONS Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// ─── INTERACTIONS ─────────────────────────────────────
async function loadInteractions() {
 showLoading('interactionsLoading','interactionsContent');
 interactions = (await fetchJSON('/api/interactions')) || [];
 renderInteractionsDT();
}

function renderInteractionsDT() {
  _ensureDTFilters();
  // Reverse so newest first
  const rev = [...interactions].reverse();
  const cols = [
    { data:'id', render: function(d) { return `<strong>${d}</strong>`; }},
    { data:null, render: function(d,t,r) { return escHtml(r.lead_nombre || r.cliente?.nombre || '-'); }},
    { data:'direccion', render: function(d) {
      return `<span class="badge ${d==='recibido'?'bg-info':'bg-success'}">${escHtml(d||'-')}</span>`;
    }},
    { data:'resumen', render: function(d) {
      return `<span title="${escHtml(d||'')}" style="max-width:300px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(d||'-')}</span>`;
    }},
    { data:'estado', render: function(d) { return `<span class="badge bg-secondary">${escHtml(d||'-')}</span>`; }},
    { data:'fecha', render: function(d) { return `<small>${formatDateTime(d)}</small>`; }},
    { data:null, render: function(d,t,r) {
      return `<button class="action-btn primary" onclick='showInteractionDetail(${JSON.stringify(r).replace(/'/g,"&#39;")})' title="Ver"><i class="bi bi-eye"></i></button>`;
    }}
  ];
  dtInteractions = initDT('tableInteractions', rev, cols, {
    drawCallback: function() {
      hideLoading('interactionsLoading','interactionsContent');
      emptyState(null, 'interactionsEmpty', this.api().rows({filter:'applied'}).count());
    }
  });
}

function showInteractionDetail(int) {
 let html = `
 <p><strong>ID:</strong> ${int.id}</p>
 <p><strong>Lead/Cliente:</strong> ${escHtml(int.lead_nombre || int.cliente?.nombre || '-')}</p>
 <p><strong>Dirección:</strong> <span class="badge ${int.direccion==='recibido'?'bg-info':'bg-success'}">${escHtml(int.direccion||'-')}</span></p>
 <p><strong>Resumen:</strong> ${escHtml(int.resumen || '-')}</p>
 <p><strong>Detalle:</strong></p>
 <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;white-space:pre-wrap;">${escHtml(int.detalle || '-')}</div>
 <p class="mt-2"><strong>Estado:</strong> <span class="badge bg-secondary">${escHtml(int.estado||'-')}</span></p>
 <p><strong>Próximo Paso:</strong> ${escHtml(int.proximo_paso || '-')}</p>
 <p><strong>Fecha:</strong> ${formatDateTime(int.fecha)}</p>
 `;
 setModal('Interacción: ' + int.id, html, '');
 modalInstance.show();
}

// GENERIC MODAL 
function setModal(title, bodyHTML, footerHTML) {
 document.getElementById('modalTitle').innerHTML = title;
 document.getElementById('modalBody').innerHTML = bodyHTML;
 document.getElementById('modalFooter').innerHTML = footerHTML;
 if (!modalInstance) modalInstance = new bootstrap.Modal(document.getElementById('genericModal'));
}

// FORM MODALS 
async function showModal(type, id) {
 let title = '', fields = [], item = null;

 if (type === 'client') {
 title = id ? 'Editar Cliente' : 'Nuevo Cliente';
 if (id) item = clients.find(c => c.id === id);
 fields = [
 {label:'Nombre', key:'nombre', type:'text', required:true},
 {label:'Tipo de Persona', key:'tipo_persona', type:'select', options:['natural','juridica']},
 {label:'Tipo Documento', key:'tipo_documento', type:'select', options:['CC','NIT','CE','Pasaporte']},
 {label:'N° Documento', key:'documento', type:'text'},
 {label:'Nombre Comercial', key:'nombre_comercial', type:'text', help:'Solo si es persona jurídica'},
 {label:'Teléfono', key:'telefono', type:'text', placeholder:'+573001234567'},
 {label:'Email', key:'email', type:'text', placeholder:'correo@ejemplo.com'},
 {label:'Dirección', key:'direccion', type:'text'},
 {label:'Ciudad', key:'ciudad', type:'text'},
 {label:'Fuente', key:'fuente', type:'select', options:['whatsapp','prospeccion','referido','web','otro']},
 {label:'Estado', key:'estado', type:'select', options:['lead','contacto','cliente','inactivo']},
 {label:'Segmento', key:'segmento', type:'segment'},
 {label:'Línea de Interés', key:'linea_interes', type:'select', options:['automatizacion','iot','mantenimiento','cargadores','varios']},
 {label:'Notas', key:'notas', type:'textarea'}
 ];
 } else if (type === 'workorder') {
 title = id ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo';
 if (id) item = workOrders.find(o => o.id === id);
 const clientSearch = `<div class="mb-3"><label class="form-label">Cliente (buscar)</label>
 <div class="client-search-wrapper">
  <input type="text" class="form-control" id="f_clientSearch" placeholder="🔍 Buscar por nombre, documento o teléfono..." autocomplete="off" oninput="searchWOClient()">
  <div class="client-search-dropdown" id="f_clientDropdown" style="display:none;"></div>
 </div>
 <input type="hidden" id="f_clientId" value="${item?.client_id||''}">
 <small style="color:rgba(255,255,255,0.4);">Si no encuentras el cliente, déjalo en blanco y llénalo manualmente.</small>
</div>`;
 
 // Tipo selector
 const tiposOT = TIPOS_OT || {};
 const currentTipo = (item && item.tipo) ? item.tipo : 'reparacion';
 const tipoOptions = Object.entries(tiposOT).map(([k,v]) => 
 `<option value="${k}" ${k===currentTipo?'selected':''}>${v.icono||''} ${v.label}</option>`
 ).join('');
 
 let formHTML = clientSearch;
 formHTML += `<div class="mb-3"><label class="form-label">Tipo de Orden <span class="text-danger">*</span></label>
 <select class="form-select" id="f_tipo" onchange="onTipoChange()">${tipoOptions}</select></div>`;
 
 // Common fields (hidden when not reparación)
 const tipoFieldsCommon = [
 {label:'Nombre del Cliente', key:'cliente_nombre', type:'text', required:true},
 {label:'Teléfono del Cliente', key:'cliente_telefono', type:'text', placeholder:'+573001234567'},
 {label:'Tipo de Equipo', key:'equipo_tipo', type:'select', options:['aire_acondicionado','lavadora','refrigerador','plc','variador','fuente','electrodomestico','cargador','otro']},
 {label:'Marca', key:'equipo_marca', type:'text'},
 {label:'Modelo', key:'equipo_modelo', type:'text'}
 ];
 
 tipoFieldsCommon.forEach(f => {
 let val = '';
 if (item) {
 if (f.key.startsWith('cliente_')) {
 val = item.cliente?.[f.key.replace('cliente_','')] || '';
 } else if (f.key.startsWith('equipo_')) {
 val = item.equipo?.[f.key.replace('equipo_','')] || '';
 } else {
 val = item[f.key] || '';
 }
 }
 formHTML += formField(f, val);
 });
 
 // Reparación fields
 formHTML += `<div id="woFieldsReparacion" class="wo-tipo-fields"${currentTipo!=='reparacion'?' style="display:none"':''}>`;
 [
 {label:'Falla Reportada', key:'falla_reportada', type:'textarea'}
 ].forEach(f => {
 const val = item ? (item[f.key] || '') : '';
 formHTML += formField(f, val);
 });
 formHTML += `</div>`;
 
 // Fabricación fields
 const ceFabricacion = (item && item.campos_extra) ? (typeof item.campos_extra === 'string' ? JSON.parse(item.campos_extra||'{}') : item.campos_extra) : {};
 formHTML += `<div id="woFieldsFabricacion" class="wo-tipo-fields"${currentTipo!=='fabricacion'?' style="display:none"':''}>`;
 [
 {label:'Tipo de Producto', key:'tipo_producto', type:'text', placeholder:'Ej: elevador, transformador'},
 {label:'Capacidad', key:'capacidad', type:'text', placeholder:'Ej: 5kVA'},
 {label:'Voltaje Entrada', key:'voltaje_entrada', type:'text', placeholder:'Ej: 90V-110V'},
 {label:'Voltaje Salida', key:'voltaje_salida', type:'text', placeholder:'Ej: 115V'},
 {label:'Fases', key:'fases', type:'select', options:['monofasico','trifasico']},
 {label:'Núcleo', key:'nucleo', type:'text', placeholder:'Ej: silicio'},
 {label:'Refrigeración', key:'refrigeracion', type:'select', options:['aire','aceite']},
 {label:'Operario', key:'operario', type:'text', placeholder:'Ej: Carlos'},
 {label:'Fecha Inicio', key:'fecha_inicio', type:'date'},
 {label:'Fecha Estimada Entrega', key:'fecha_estimada', type:'date'}
 ].forEach(f => {
 const val = ceFabricacion[f.key] || '';
 formHTML += formField(f, val);
 });
 formHTML += `</div>`;
 
 // Instalación fields
 const ceInstalacion = (item && item.campos_extra && currentTipo==='instalacion') ? (typeof item.campos_extra === 'string' ? JSON.parse(item.campos_extra||'{}') : item.campos_extra) : {};
 formHTML += `<div id="woFieldsInstalacion" class="wo-tipo-fields"${currentTipo!=='instalacion'?' style="display:none"':''}>`;
 [
 {label:'Dirección Instalación', key:'direccion_instalacion', type:'text', placeholder:'Cra 51B #94-420, Barranquilla'},
 {label:'Tipo de Cargador', key:'tipo_cargador', type:'select', options:['Nivel 1','Nivel 2','Nivel 3 (DC rápido)']},
 {label:'Potencia', key:'potencia', type:'text', placeholder:'Ej: 7.4kW'},
 {label:'Requiere Obra Civil', key:'requiere_obra_civil', type:'select', options:['no','si']},
 {label:'Fecha Agendada', key:'fecha_agendada', type:'date'},
 {label:'Técnico Asignado', key:'tecnico_asignado', type:'text', placeholder:'Ej: Pedro'}
 ].forEach(f => {
 const val = ceInstalacion[f.key] || '';
 formHTML += formField(f, val);
 });
 formHTML += `</div>`;
 
 // Common end fields
 [
 {label:'Presupuesto (COP)', key:'presupuesto', type:'number', placeholder:'Ej: 250000'},
 {label:'Notas Internas', key:'notas_internas', type:'textarea'}
 ].forEach(f => {
 let val = '';
 if (item) val = item[f.key] || '';
 formHTML += formField(f, val);
 });
 
 setModal(title, formHTML,
 `<button class="btn btn-htk" onclick="saveModal('${type}','${id||''}')"><i class="bi bi-check-lg"></i> Guardar</button>`
 );
 modalInstance.show();
 return;
 } else if (type === 'lead') {
 title = id ? 'Editar Prospecto' : 'Nuevo Prospecto';
 if (id) item = leads.find(l => l.id === id);
 fields = [
  {label:'Nombre / Empresa', key:'nombre', type:'text', required:true},
  {label:'Nombre Contacto (persona)', key:'contacto_nombre', type:'text', placeholder:'Ej: Juan Pérez'},
  {label:'Teléfono', key:'telefono', type:'text', placeholder:'+573001234567'},
  {label:'Email', key:'email', type:'text', placeholder:'contacto@ejemplo.com'},
  {label:'Sitio Web', key:'url', type:'text', placeholder:'https://ejemplo.com'},
  {label:'Contacto (legacy)', key:'contacto', type:'text', placeholder:'Teléfono, email o red social'},
 {label:'Segmento', key:'segmento', type:'segment'},
 {label:'Línea de Interés', key:'linea_interes', type:'select', options:['automatizacion','iot','mantenimiento','cargadores','varios']},
 {label:'Estado', key:'estado', type:'select', options:['nuevo','contactado','cotizado','negociacion','ganado','perdido']},
 {label:'Fuente', key:'fuente', type:'select', options:['Facebook','web','referido','llamada','feria','alianza','directorio','otro']},
 {label:'Valor Estimado (COP)', key:'valor_estimado', type:'number'},
 {label:'Próximo Seguimiento', key:'proximo_seguimiento', type:'date'},
 {label:'Notas', key:'notas', type:'textarea'}
 ];
 }

 let formHTML = fields.map(f => {
 let val = item ? (item[f.key] || '') : '';
 return formField(f, val);
 }).join('');

 setModal(title, formHTML,
 `<button class="btn btn-htk" onclick="saveModal('${type}','${id||''}')"><i class="bi bi-check-lg"></i> Guardar</button>`
 );
 modalInstance.show();
}

function formField(f, val) {
 if (f.type === 'textarea') {
 return `<div class="mb-3">
 <label class="form-label">${f.label}${f.required?' <span class="text-danger">*</span>':''}</label>
 <textarea class="form-control" id="f_${f.key}" rows="3" ${f.required?'required':''} placeholder="${f.placeholder||''}">${escHtml(String(val||''))}</textarea>
 </div>`;
 }
 if (f.type === 'segment') {
 const opts = segmentOptionsHtml(val);
 return `<div class="mb-3">
 <label class="form-label">${f.label}</label>
 <select class="form-select" id="f_${f.key}">${opts}</select>
 </div>`;
 }
 if (f.type === 'select') {
 const opts = f.options.map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('');
 return `<div class="mb-3">
 <label class="form-label">${f.label}</label>
 <select class="form-select" id="f_${f.key}">${opts}</select>
 </div>`;
 }
 return `<div class="mb-3">
 <label class="form-label">${f.label}${f.required?' <span class="text-danger">*</span>':''}</label>
 <input class="form-control" id="f_${f.key}" type="${f.type}" value="${escHtml(String(val||''))}" ${f.required?'required':''} placeholder="${f.placeholder||''}">
 </div>`;
}

function fillClientData() {
 // This is now handled by searchWOClient — kept for backward compat
}

var woClientSearchTimer = null;
function searchWOClient() {
  clearTimeout(woClientSearchTimer);
  var q = document.getElementById('f_clientSearch').value.trim();
  var dropdown = document.getElementById('f_clientDropdown');
  if (!q || q.length < 2) { dropdown.style.display = 'none'; return; }
  woClientSearchTimer = setTimeout(async function() {
    try {
      var resp = await fetch('/api/clients?search=' + encodeURIComponent(q));
      var results = await resp.json();
      if (!results || !results.length) {
        dropdown.innerHTML = '<div style="padding:8px 12px;color:rgba(255,255,255,0.4);font-size:0.85rem;">Sin resultados — llena los datos manualmente</div>';
        dropdown.style.display = '';
        return;
      }
      var html = '';
      for (var i = 0; i < Math.min(results.length, 8); i++) {
        var c = results[i];
        var doc = c.documento ? (c.tipo_documento||'CC') + ': ' + c.documento : '';
        var safeName = (c.nombre||'').replace(/'/g, "\\'");
        html += '<div class="client-search-item" onclick="selectWOClient(\'' + c.id + '\', \'' + safeName + '\', \'' + (c.telefono||'').replace(/'/g,"\\'") + '\')" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);">';
        html += '<div style="font-weight:600;">' + escHtml(c.nombre||c.id) + '</div>';
        html += '<div style="font-size:0.8rem;color:rgba(255,255,255,0.5);">' + escHtml(c.telefono||'') + (doc ? ' · ' + escHtml(doc) : '') + '</div>';
        html += '</div>';
      }
      dropdown.innerHTML = html;
      dropdown.style.display = '';
    } catch(e) {}
  }, 200);
}

function selectWOClient(id, name, phone) {
  document.getElementById('f_clientId').value = id;
  document.getElementById('f_clientSearch').value = name;
  document.getElementById('f_clientDropdown').style.display = 'none';
  document.getElementById('f_cliente_nombre').value = name;
  document.getElementById('f_cliente_telefono').value = phone;
}

function onTipoChange() {
 const tipo = document.getElementById('f_tipo')?.value || 'reparacion';
 document.getElementById('woFieldsReparacion').style.display = tipo === 'reparacion' ? '' : 'none';
 document.getElementById('woFieldsFabricacion').style.display = tipo === 'fabricacion' ? '' : 'none';
 document.getElementById('woFieldsInstalacion').style.display = tipo === 'instalacion' ? '' : 'none';
}

async function saveModal(type, id) {
 const isEdit = !!id;

 let data = {};
 if (type === 'client') {
 data = {
 nombre: document.getElementById('f_nombre')?.value,
 tipo_persona: document.getElementById('f_tipo_persona')?.value,
 tipo_documento: document.getElementById('f_tipo_documento')?.value,
 documento: document.getElementById('f_documento')?.value,
 nombre_comercial: document.getElementById('f_nombre_comercial')?.value,
 telefono: document.getElementById('f_telefono')?.value,
 email: document.getElementById('f_email')?.value,
 direccion: document.getElementById('f_direccion')?.value,
 ciudad: document.getElementById('f_ciudad')?.value,
 fuente: document.getElementById('f_fuente')?.value,
 estado: document.getElementById('f_estado')?.value,
 segmento: document.getElementById('f_segmento')?.value,
 linea_interes: document.getElementById('f_linea_interes')?.value,
 notas: document.getElementById('f_notas')?.value
 };
 if (!data.nombre) { showToast('El nombre es requerido', 'danger'); return; }

 try {
 if (isEdit) {
 await fetch(`/api/clients/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
 } else {
 await fetch('/api/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
 }
 modalInstance.hide();
 flashSave();
 showToast(isEdit ? 'Cliente actualizado' : 'Cliente creado');
 await loadClients();
 } catch(e) { showToast('Error al guardar cliente', 'danger'); }

 } else if (type === 'workorder') {
 const clienteNombre = document.getElementById('f_cliente_nombre')?.value;
 if (!clienteNombre) { showToast('El nombre del cliente es requerido', 'danger'); return; }

 const tipo = document.getElementById('f_tipo')?.value || 'reparacion';
 
 // Recolectar campos_extra según el tipo
 const camposExtra = {};
 if (tipo === 'fabricacion') {
 ['tipo_producto','capacidad','voltaje_entrada','voltaje_salida','fases','nucleo','refrigeracion','operario','fecha_inicio','fecha_estimada'].forEach(k => {
 const el = document.getElementById('f_' + k);
 if (el && el.value) camposExtra[k] = el.value;
 });
 } else if (tipo === 'instalacion') {
 ['direccion_instalacion','tipo_cargador','potencia','requiere_obra_civil','fecha_agendada','tecnico_asignado'].forEach(k => {
 const el = document.getElementById('f_' + k);
 if (el && el.value) camposExtra[k] = el.value;
 });
 }

 data = {
 tipo: tipo,
 campos_extra: camposExtra,
 client_id: document.getElementById('f_clientId')?.value || null,
 cliente: {
 nombre: clienteNombre,
 telefono: document.getElementById('f_cliente_telefono')?.value || ''
 },
 equipo: {
 tipo: document.getElementById('f_equipo_tipo')?.value || 'otro',
 marca: document.getElementById('f_equipo_marca')?.value || '',
 modelo: document.getElementById('f_equipo_modelo')?.value || ''
 },
 falla_reportada: document.getElementById('f_falla_reportada')?.value || '',
 presupuesto: document.getElementById('f_presupuesto')?.value ? parseFloat(document.getElementById('f_presupuesto').value) : null,
 notas_internas: document.getElementById('f_notas_internas')?.value || ''
 };

 try {
 let resp;
 if (isEdit) {
 resp = await fetch(`/api/work_orders/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
 } else {
 resp = await fetch('/api/work_orders', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
 }
 if (!resp.ok) {
 const err = await resp.json().catch(()=>({}));
 throw new Error(err.error || err.message || `Error del servidor (${resp.status})`);
 }
 modalInstance.hide();
 flashSave();
 showToast(isEdit ? 'Orden actualizada' : 'Orden creada');
 try { await loadWorkOrders(); } catch(e) {}
 try { await loadClients(); } catch(e) {}
 try { await loadDashboard(); } catch(e) {}
 } catch(e) { showToast(e.message || 'Error al guardar orden', 'danger'); }
  setTimeout(loadPipeline, 1000);

 } else if (type === 'lead') {
 data = {
 nombre: document.getElementById('f_nombre')?.value,
 contacto_nombre: document.getElementById('f_contacto_nombre')?.value || '',
 telefono: document.getElementById('f_telefono')?.value || '',
 email: document.getElementById('f_email')?.value || '',
 url: document.getElementById('f_url')?.value || '',
 contacto: document.getElementById('f_contacto')?.value,
 segmento: document.getElementById('f_segmento')?.value,
 linea_interes: document.getElementById('f_linea_interes')?.value,
 estado: document.getElementById('f_estado')?.value,
 fuente: document.getElementById('f_fuente')?.value,
 valor_estimado: document.getElementById('f_valor_estimado')?.value ? parseFloat(document.getElementById('f_valor_estimado').value) : null,
 proximo_seguimiento: document.getElementById('f_proximo_seguimiento')?.value || null,
 notas: document.getElementById('f_notas')?.value
 };
 if (!data.nombre) { showToast('El nombre es requerido', 'danger'); return; }

 try {
 if (isEdit) {
 await fetch(`/api/leads/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
 } else {
 await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
 }
 modalInstance.hide();
 flashSave();
 showToast(isEdit ? 'Prospecto actualizado' : 'Prospecto creado');
 await loadLeads();
 } catch(e) { showToast('Error al guardar prospecto', 'danger'); }
 }
}

// DELETE 
async function deleteItem(endpoint, id, name) {
 if (!confirm(`¿Eliminar ${endpoint==='work_orders'?'orden':endpoint==='leads'?'prospecto':'cliente'} "${name||id}"?`)) return;
 
 // Esperar confirmacion del servidor primero
 try {
 const resp = await fetch(`/api/${endpoint}/${id}`, { method:'DELETE' });
 if (resp.redirected || resp.url.includes('/login')) {
 showToast('Sesión expirada, recarga la página', 'danger');
 return;
 }
 if (!resp.ok) throw new Error('HTTP ' + resp.status);
 } catch(e) {
 showToast('Error al eliminar: ' + e.message, 'danger');
 return;
 }
 
 // Servidor confirmó → eliminar local y re-renderizar
 if (endpoint === 'leads') {
 const idx = leads.findIndex(x => x.id === id);
 if (idx > -1) leads.splice(idx, 1);
 renderLeadsDT();
 } else if (endpoint === 'clients') {
 const idx = clients.findIndex(x => x.id === id);
 if (idx > -1) { clients.splice(idx, 1); renderClientsDT(); }
 } else if (endpoint === 'work_orders') {
 const idx = workOrders.findIndex(x => x.id === id);
 if (idx > -1) { workOrders.splice(idx, 1); renderWOsDT(); }
 }
 
 flashSave();
 showToast(`${name||id} eliminado correctamente`);
 updateNotifications();
}

// 
