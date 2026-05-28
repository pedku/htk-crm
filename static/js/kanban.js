// ============================================
// HTK CRM — KANBAN Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// KANBAN — DRAG & DROP SYSTEM
// 

let draggedItemId = null;
let draggedItemType = null; // 'wo' or 'lead'

// Kanban Tab Entry Point 



async function loadKanban() {
 if (currentKanbanSub === 'wo') loadKanbanWO();
 else loadKanbanLeads();
}

// Kanban View Toggle 
document.getElementById('kanbanViewToggle').addEventListener('click', function(e) {
 if (e.target.closest('button')) {
 const btn = e.target.closest('button');
 const view = btn.dataset.kanbanView;
 currentKanbanView = view;
 document.querySelectorAll('#kanbanViewToggle.btn').forEach(b => b.classList.remove('active'));
 btn.classList.add('active');
 // Re-render current sub-tab
 if (currentKanbanSub === 'wo') loadKanbanWO();
 else loadKanbanLeads();
 }
});

// Kanban Sub-Tabs 
document.getElementById('kanbanSubTabs').addEventListener('click', function(e) {
 if (e.target.closest('.nav-link')) {
 e.preventDefault();
 const link = e.target.closest('.nav-link');
 currentKanbanSub = link.dataset.kanbanSub;
 document.querySelectorAll('#kanbanSubTabs.nav-link').forEach(l => l.classList.remove('active'));
 link.classList.add('active');
 // Show/hide sub views
 document.querySelectorAll('.kanban-sub-view').forEach(v => v.style.display = 'none');
 document.getElementById('kanban-' + currentKanbanSub + '-view').style.display = '';
 loadKanban();
 }
});

// Kanban: Work Orders
let kanbanWOData = null; // { columnas, tarjetas } from API
let kanbanWOTipoActual = ''; // '' = todos, or 'reparacion', 'fabricacion', 'instalacion'

async function loadKanbanWO() {
 document.getElementById('kanbanWOLoading').style.display = 'flex';
 document.getElementById('kanbanWOBoard').style.display = 'none';
 document.getElementById('kanbanWOEmpty').style.display = 'none';
 
 try {
 const qs = kanbanWOTipoActual ? `?tipo=${kanbanWOTipoActual}` : '';
 kanbanWOData = await fetchJSON(`/api/work_orders/kanban${qs}`);
 
 // Build tipo selector buttons if not already built
 const tipoSelector = document.getElementById('kanbanWOTipoSelector');
 if (tipoSelector && tipoSelector.querySelectorAll('button').length <= 1) {
 const tiposResp = await fetchJSON('/api/work_orders/tipos');
 let btnsHTML = '<button class="btn btn-sm kanban-tipo-btn active" data-tipo="" onclick="switchKanbanWOTipo(\'\')">📋 Todos</button>';
 Object.entries(tiposResp).forEach(([k, v]) => {
 btnsHTML += `<button class="btn btn-sm kanban-tipo-btn" data-tipo="${k}" onclick="switchKanbanWOTipo('${k}')">${v.icono||''} ${v.label}</button>`;
 });
 tipoSelector.innerHTML = btnsHTML;
 // Re-activate current tipo
 const activeBtn = tipoSelector.querySelector(`[data-tipo="${kanbanWOTipoActual}"]`);
 if (activeBtn) {
 tipoSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
 activeBtn.classList.add('active');
 }
 }
 
 document.getElementById('kanbanWOLoading').style.display = 'none';
 
 if (currentKanbanView === 'kanban') renderKanbanWO();
 else renderKanbanWOTable();
 } catch(e) {
 document.getElementById('kanbanWOLoading').innerHTML = '<div class="text-danger">Error al cargar Kanban</div>';
 console.error('Kanban WO error:', e);
 }
}

async function switchKanbanWOTipo(tipo) {
 kanbanWOTipoActual = tipo;
 // Update button active states
 document.querySelectorAll('.kanban-tipo-btn').forEach(b => {
 b.classList.toggle('active', b.dataset.tipo === tipo);
 });
 await loadKanbanWO();
}

function renderKanbanWO() {
 document.getElementById('kanbanWOBoard').style.display = '';
 document.getElementById('kanbanWOTable').style.display = 'none';
 document.getElementById('kanbanWOLoading').style.display = 'none';

 if (!kanbanWOData || !kanbanWOData.columnas || kanbanWOData.columnas.length === 0) {
 document.getElementById('kanbanWOBoard').style.display = 'none';
 document.getElementById('kanbanWOEmpty').style.display = '';
 document.getElementById('kanbanWOLoading').style.display = 'none';
 return;
 }
 
 const totalCards = Object.values(kanbanWOData.tarjetas || {}).flat().length;
 if (totalCards === 0) {
 document.getElementById('kanbanWOBoard').style.display = 'none';
 document.getElementById('kanbanWOEmpty').style.display = '';
 document.getElementById('kanbanWOLoading').style.display = 'none';
 return;
 }
 document.getElementById('kanbanWOEmpty').style.display = 'none';
 
 // Show tipo selector
 document.getElementById('kanbanWOTipoSelector').style.display = '';

 let html = '';
 kanbanWOData.columnas.forEach(col => {
 const items = kanbanWOData.tarjetas[col.estado] || [];
 const headerBorderColor = col.color || '#f97316';
 html += `
 <div class="kanban-column" data-status="${col.estado}" 
 ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDropWO(event)">
 <div class="kanban-column-header" style="border-bottom: 2px solid ${headerBorderColor};">
 <span>${col.icono||''} ${col.label}</span>
 <span class="count">${items.length}</span>
 </div>
 <div class="kanban-cards">
 ${items.map(o => kanbanWOCard(o)).join('')}
 </div>
 </div>`;
 });
 
 document.getElementById('kanbanWOBoard').innerHTML = html;
 document.getElementById('kanbanWOLoading').style.display = 'none';
 // Attach dragstart listeners
 document.querySelectorAll('#kanbanWOBoard .kanban-card').forEach(card => {
 card.addEventListener('dragstart', handleDragStartWO);
 card.addEventListener('dragend', handleDragEnd);
 });
}

function kanbanWOCard(o) {
 const tipoInfo = TIPOS_OT[o.tipo] || {};
 const tipoLabel = tipoInfo.label || o.tipo || 'Reparación';
 const tipoIcono = tipoInfo.icono || '🔧';
 const tipoColor = tipoInfo.color || '#f97316';
 
 // Payment bar
 let paymentBar = '';
 if (o.presupuesto > 0) {
 const pct = o.pct_pagado || 0;
 const barColor = pct >= 100 ? '#198754' : pct >= 50 ? '#ffc107' : 'var(--htk-primary)';
 paymentBar = `
 <div class="finance-bar" style="margin:6px 0 2px;height:5px;">
 <div class="finance-bar-fill" style="width:${Math.min(pct,100)}%;background:${barColor};"></div>
 </div>
 <div style="font-size:0.7em;color:rgba(255,255,255,0.35);display:flex;justify-content:space-between;">
 <span>💰 ${formatCurrency(o.presupuesto)}</span>
 <span>${formatCurrency(o.total_abonado)}</span>
 </div>`;
 } else if (o.presupuesto === 0) {
 paymentBar = `<div style="font-size:0.7em;color:rgba(255,255,255,0.25);margin-top:4px;">💰 Sin presupuesto</div>`;
 }

 // Days badge
 let diasBadge = '';
 if (o.dias_en_estado !== undefined && o.dias_en_estado >= 0) {
 let diasColor = 'rgba(255,255,255,0.3)';
 if (o.dias_en_estado > 7) diasColor = '#dc3545';
 else if (o.dias_en_estado > 3) diasColor = '#ffc107';
 diasBadge = `<span style="font-size:0.7em;color:${diasColor};">⏱ ${o.dias_en_estado}d</span>`;
 }

 // Color coding
 let borderColor = tipoColor;
 const completedStates = ['completado', 'entregado', 'finalizado', 'facturado'];
 if (completedStates.includes(o.estado)) {
 borderColor = '#198754'; // verde
 } else if (o.dias_en_estado > 7) {
 borderColor = '#dc3545'; // rojo SLA
 } else if (o.estado === 'esperando_repuestos' || (o.saldo_pendiente && o.pct_pagado < 50)) {
 borderColor = '#f97316'; // naranja
 }

 return `
 <div class="kanban-card" draggable="true" data-id="${o.id}" data-status="${o.estado}" data-tipo="${o.tipo||'reparacion'}"
 onclick="showWODetail('${o.id}')" title="${o.id} — ${o.cliente_nombre||''}"
 style="border-left: 3px solid ${borderColor};">
 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
 <span class="kc-id" style="color:${tipoColor};">${o.id}</span>
 <span style="font-size:0.65em;padding:1px 6px;border-radius:8px;background:${tipoColor}22;color:${tipoColor};">${tipoIcono} ${tipoLabel}</span>
 </div>
 <div class="kc-client">${escHtml(o.cliente_nombre||'Sin nombre')}</div>
 <div class="kc-meta">${escHtml(o.equipo||'Sin equipo')}</div>
 ${paymentBar}
 <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
 ${diasBadge}
 <div style="display:flex;gap:2px;">
 <button class="action-btn primary" onclick="event.stopPropagation();showStatusModal('${o.id}')" title="Cambiar estado" style="font-size:0.7em;padding:2px 4px;"><i class="bi bi-arrow-right-circle"></i></button>
 <button class="action-btn primary" onclick="event.stopPropagation();showModal('workorder','${o.id}')" title="Editar" style="font-size:0.7em;padding:2px 4px;"><i class="bi bi-pencil"></i></button>
 </div>
 </div>
 </div>
 `;
}

// Kanban WO Table View 
function renderKanbanWOTable() {
 document.getElementById('kanbanWOBoard').style.display = 'none';
 document.getElementById('kanbanWOTable').style.display = '';
 document.getElementById('kanbanWOEmpty').style.display = 'none';
 document.getElementById('kanbanWOLoading').style.display = 'none';
 document.getElementById('kanbanWOTipoSelector').style.display = '';

 // Build all OTs from kanban data (flat)
 const allCards = kanbanWOData && kanbanWOData.tarjetas 
 ? Object.values(kanbanWOData.tarjetas).flat() 
 : [];
 
 // Dynamic status filter from columnas
 const statusFilter = document.getElementById('kanbanWOStatusFilter');
 if (statusFilter && kanbanWOData && kanbanWOData.columnas) {
 const currentVal = statusFilter.value;
 statusFilter.innerHTML = '<option value="">Todos los estados</option>' +
 kanbanWOData.columnas.map(c => `<option value="${c.estado}" ${c.estado===currentVal?'selected':''}>${c.icono||''} ${c.label}</option>`).join('');
 }

 const q = (document.getElementById('kanbanWOSearch')?.value || '').toLowerCase();
 const st = document.getElementById('kanbanWOStatusFilter')?.value || '';
 const filtered = allCards.filter(o => {
 if (st && o.estado !== st) return false;
 return (o.cliente_nombre || '').toLowerCase().includes(q) ||
 (o.id || '').toLowerCase().includes(q) ||
 (o.equipo || '').toLowerCase().includes(q);
 });

 document.getElementById('kanbanWOTableBody').innerHTML = filtered.map(o => {
 const tipoInfo = TIPOS_OT[o.tipo] || {};
 const estadoInfo = ESTADOS_WO[o.estado] || {label:o.estado, class:'bg-secondary'};
 return `<tr>
 <td><strong style="color:${tipoInfo.color||'var(--htk-primary)'};">${o.id}</strong></td>
 <td>${tipoInfo.icono||'🔧'} ${escHtml(o.cliente_nombre || '-')}</td>
 <td>—</td>
 <td>${escHtml(o.equipo || '-')}</td>
 <td>—</td>
 <td>${formatCurrency(o.presupuesto)}</td>
 <td><span class="badge ${estadoInfo.class}">${estadoInfo.label}</span></td>
 <td><small>${formatDate(o.fecha_recibido)}</small></td>
 <td>
 <button class="action-btn primary" onclick="showModal('workorder','${o.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
 <button class="action-btn primary" onclick="showWODetail('${o.id}')" title="Ver detalle"><i class="bi bi-eye"></i></button>
 <button class="action-btn primary" onclick="showStatusModal('${o.id}')" title="Cambiar estado"><i class="bi bi-arrow-right-circle"></i></button>
 </td>
 </tr>`;
 }).join('');

 if (filtered.length === 0 && q) {
 document.getElementById('kanbanWOTableBody').innerHTML = '<tr><td colspan="9" class="text-center text-muted">Sin resultados</td></tr>';
 }
}

// Kanban: Leads 
async function loadKanbanLeads() {
 leads = await fetchJSON('/api/leads');
 if (currentKanbanView === 'kanban') renderKanbanLeads();
 else renderKanbanLeadsTable();
}

function renderKanbanLeads() {
 const board = document.getElementById('kanbanLeadsBoard');
 const filters = document.getElementById('kanbanLeadsFilters');
 
 board.style.display = '';
 document.getElementById('kanbanLeadsTable').style.display = 'none';
 document.getElementById('kanbanLeadsLoading').style.display = 'none';

 if (leads.length === 0) {
 board.style.display = 'none';
 if (filters) filters.style.display = 'none';
 document.getElementById('kanbanLeadsEmpty').style.display = '';
 document.getElementById('kanbanLeadsLoading').style.display = 'none';
 return;
 }
 document.getElementById('kanbanLeadsEmpty').style.display = 'none';
 if (filters) filters.style.display = '';

 // Obtener valores de filtro
 const q = (document.getElementById('kanbanBoardSearch')?.value || '').toLowerCase();
 const seg = document.getElementById('kanbanBoardSegmentFilter')?.value || '';

 // Filtrar leads (sin modificar el array original)
 const filtered = leads.filter(l => {
 if (seg && l.segmento !== seg) return false;
 if (q) {
 const nombre = (l.nombre || '').toLowerCase();
 const contacto = (l.contacto || '').toLowerCase();
 const id = (l.id || '').toLowerCase();
 const tel = (l.telefono || '').toLowerCase();
 const segL = (l.segmento || '').toLowerCase();
 return nombre.includes(q) || contacto.includes(q) || id.includes(q) || tel.includes(q) || segL.includes(q);
 }
 return true;
 });

 // Actualizar contador
 const countEl = document.getElementById('kanbanBoardCount');
 if (countEl) {
 if (q || seg) countEl.textContent = `${filtered.length} de ${leads.length} leads`;
 else countEl.textContent = `${leads.length} leads`;
 }

 let html = '';
 LEAD_STATUS_ORDER.forEach(status => {
 const items = filtered.filter(l => l.estado === status);
 html += `
 <div class="kanban-column" data-status="${status}"
 ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDropLead(event)">
 <div class="kanban-column-header">
 <span>${ESTADOS_LEAD[status]?.label||status}</span>
 <span class="count">${items.length}</span>
 </div>
 <div class="kanban-cards">
 ${items.map(l => kanbanLeadCard(l)).join('')}
 </div>
 </div>`;
 });

 board.innerHTML = html;
 document.getElementById('kanbanLeadsLoading').style.display = 'none';
 // Attach dragstart listeners
 document.querySelectorAll('#kanbanLeadsBoard .kanban-card').forEach(card => {
 card.addEventListener('dragstart', handleDragStartLead);
 card.addEventListener('dragend', handleDragEnd);
 });
}

function kanbanLeadCard(l) {
 const budget = l.valor_estimado ? `<div class="kc-budget">${formatCurrency(l.valor_estimado)}</div>` : '';
 return `
 <div class="kanban-card" draggable="true" data-id="${l.id}" data-status="${l.estado}"
 onclick="showLeadDetail('${l.id}')" title="Ver detalle de ${l.nombre||l.id}">
 <div class="kc-id">${l.id}</div>
 <div class="kc-client"><a href="/leads/${l.id}" style="color:inherit;text-decoration:none;">${escHtml(l.nombre||'Sin nombre')}</a></div>
 <div class="kc-meta">${escHtml(l.contacto||'-')}</div>
 ${budget}
 </div>
 `;
}

// Kanban Leads Table View 
function renderKanbanLeadsTable() {
 document.getElementById('kanbanLeadsBoard').style.display = 'none';
 document.getElementById('kanbanLeadsTable').style.display = '';
 document.getElementById('kanbanLeadsEmpty').style.display = 'none';
 document.getElementById('kanbanLeadsLoading').style.display = 'none';

 const q = (document.getElementById('kanbanLeadSearch')?.value || '').toLowerCase();
 const st = document.getElementById('kanbanLeadStatusFilter')?.value || '';
 const filtered = leads.filter(l => {
 if (st && l.estado !== st) return false;
 return (l.nombre || '').toLowerCase().includes(q) || (l.contacto || '').toLowerCase().includes(q) || (l.id || '').toLowerCase().includes(q);
 });

 document.getElementById('kanbanLeadsTableBody').innerHTML = filtered.map(l => {
 const es = ESTADOS_LEAD[l.estado] || {label:l.estado||'nuevo', class:'bg-secondary'};
 return `<tr>
 <td><strong>${l.id}</strong></td>
 <td><strong><a href="/leads/${l.id}" style="color:var(--htk-primary);text-decoration:none;">${escHtml(l.nombre || '-')}</a></strong></td>
 <td>${escHtml(l.contacto || '-')}</td>
 <td>${escHtml(l.segmento || '-')}</td>
 <td>${escHtml(l.linea_interes || '-')}</td>
 <td><span class="badge ${es.class}">${es.label}</span></td>
 <td>${formatCurrency(l.valor_estimado)}</td>
 <td><small>${formatDate(l.fecha_creacion)}</small></td>
 <td>
 <button class="action-btn primary" onclick="showModal('lead','${l.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
 <button class="action-btn primary" onclick="showLeadDetail('${l.id}')" title="Ver"><i class="bi bi-eye"></i></button>
 </td>
 </tr>`;
 }).join('');

 if (filtered.length === 0 && q) {
 document.getElementById('kanbanLeadsTableBody').innerHTML = '<tr><td colspan="9" class="text-center text-muted">Sin resultados</td></tr>';
 }
}

// 
// HTML5 DRAG & DROP HANDLERS
// 

function handleDragStartWO(e) {
 draggedItemId = e.target.closest('.kanban-card').dataset.id;
 draggedItemType = 'wo';
 e.target.closest('.kanban-card').classList.add('dragging');
 e.dataTransfer.effectAllowed = 'move';
 e.dataTransfer.setData('text/plain', draggedItemId);
}

function handleDragStartLead(e) {
 draggedItemId = e.target.closest('.kanban-card').dataset.id;
 draggedItemType = 'lead';
 e.target.closest('.kanban-card').classList.add('dragging');
 e.dataTransfer.effectAllowed = 'move';
 e.dataTransfer.setData('text/plain', draggedItemId);
}

function handleDragEnd(e) {
 e.target.closest('.kanban-card')?.classList.remove('dragging');
 document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) {
 e.preventDefault();
 e.dataTransfer.dropEffect = 'move';
 e.target.closest('.kanban-column')?.classList.add('drag-over');
}

function handleDragLeave(e) {
 e.target.closest('.kanban-column')?.classList.remove('drag-over');
}

async function handleDropWO(e) {
 e.preventDefault();
 const col = e.target.closest('.kanban-column');
 if (!col) return;
 col.classList.remove('drag-over');
 const newStatus = col.dataset.status;
 if (!newStatus || !draggedItemId || draggedItemType !== 'wo') return;

 await updateWOStatusFromKanban(draggedItemId, newStatus);
 draggedItemId = null;
 draggedItemType = null;
}

async function handleDropLead(e) {
 e.preventDefault();
 const col = e.target.closest('.kanban-column');
 if (!col) return;
 col.classList.remove('drag-over');
 const newStatus = col.dataset.status;
 if (!newStatus || !draggedItemId || draggedItemType !== 'lead') return;

 await updateLeadStatusFromKanban(draggedItemId, newStatus);
 draggedItemId = null;
 draggedItemType = null;
}

async function updateWOStatusFromKanban(woId, newStatus) {
 // Get the card element to check tipo
 const card = document.querySelector(`.kanban-card[data-id="${woId}"]`);
 const tipo = card ? card.dataset.tipo : 'reparacion';
 
 // Validate estado is valid for this tipo
 if (TIPOS_OT[tipo] && !TIPOS_OT[tipo].estados.includes(newStatus)) {
 showToast(`❌ Estado "${newStatus}" no válido para tipo ${TIPOS_OT[tipo]?.label||tipo}`, 'danger');
 return;
 }
 
 try {
 const resp = await fetch(`/api/work_orders/${woId}/kanban`, {
 method: 'PATCH',
 headers: {'Content-Type': 'application/json'},
 body: JSON.stringify({ estado: newStatus, descripcion: `Movido a ${newStatus.replace(/_/g, ' ')} vía Kanban` })
 });
 if (!resp.ok) {
 const err = await resp.json();
 throw new Error(err.error || 'Error del servidor');
 }
 flashSave();
 showToast(`✅ ${woId} → ${newStatus.replace(/_/g, ' ')}`);
 // Reload kanban from API
 kanbanWOData = null;
 await loadKanbanWO();
 // Also refresh workOrders list
 workOrders = await fetchJSON('/api/work_orders');
 updateNotifications();
 } catch(e) { showToast('Error al mover: ' + e.message, 'danger'); }
}

async function updateLeadStatusFromKanban(leadId, newStatus) {
 const localLead = leads.find(x => x.id === leadId);
 if (!localLead) return;
 const oldStatus = localLead.estado;
 
 // 1. Enviar al servidor PRIMERO (esperar confirmación)
 try {
 const resp = await fetch(`/api/leads/${leadId}/etapa`, {
 method: 'PATCH',
 headers: {'Content-Type': 'application/json'},
 body: JSON.stringify({ etapa: newStatus })
 });
 if (!resp.ok) throw new Error('HTTP ' + resp.status);
 const text = await resp.text();
 const data = JSON.parse(text);
 if (!data.ok) throw new Error(data.error || 'Error desconocido');
 } catch(e) {
 showToast('Error: ' + e.message, 'danger');
 return;
 }
 
 // 2. Servidor confirmó → actualizar local y re-renderizar
 localLead.estado = newStatus;
 try { renderKanbanLeads(); } catch(e) { /* board oculta */ }
 flashSave();
 showToast(`Lead movido a ${ESTADOS_LEAD[newStatus]?.label||newStatus}`);
 updateNotifications();
}

// Upcoming Followups (Dashboard) 
function renderUpcomingFollowups() {
 const container = document.getElementById('upcomingFollowups');
 if (!container) return;
 
 const today = new Date();
 today.setHours(0,0,0,0);
 const tomorrow = new Date(today);
 tomorrow.setDate(tomorrow.getDate() + 1);
 const weekEnd = new Date(today);
 weekEnd.setDate(weekEnd.getDate() + 7);
 
 const withFollowup = leads.filter(l => l.proximo_seguimiento);
 
 if (withFollowup.length === 0) {
 container.innerHTML = '<div class="text-center py-3" style="color:rgba(255,255,255,0.3);"><i class="bi bi-inbox"></i><p class="mt-1">No hay seguimientos programados</p></div>';
 return;
 }
 
 const sorted = [...withFollowup].sort((a,b) => (a.proximo_seguimiento||'').localeCompare(b.proximo_seguimiento||''));
 
 container.innerHTML = sorted.map(l => {
 const followDate = new Date(l.proximo_seguimiento + 'T00:00:00');
 let cls = 'week';
 let label = '';
 if (followDate < today) {
 cls = 'urgent';
 label = '<span class="badge bg-danger me-2">Vencido</span>';
 } else if (followDate.getTime() === today.getTime()) {
 cls = 'today';
 label = '<span class="badge bg-warning text-dark me-2">Hoy</span>';
 } else if (followDate.getTime() === tomorrow.getTime()) {
 cls = 'today';
 label = '<span class="badge bg-warning text-dark me-2">Mañana</span>';
 }
 
 const es = ESTADOS_LEAD[l.estado] || {label:l.estado, class:'bg-secondary'};
 return `<div class="followup-card ${cls}" onclick="showLeadDetail('${l.id}')" style="cursor:pointer;">
 <div class="d-flex justify-content-between align-items-center">
 <div>
 ${label}
 <strong style="color:#fff;">${escHtml(l.nombre || l.id)}</strong>
 <small style="color:rgba(255,255,255,0.4);"> — ${escHtml(l.linea_interes || '')}</small>
 </div>
 <div>
 <span class="badge ${es.class} me-2">${es.label}</span>
 <small style="color:rgba(255,255,255,0.4);">${formatDate(l.proximo_seguimiento)}</small>
 </div>
 </div>
 </div>`;
 }).join('');
}

// Interactions Timeline 
async function loadLeadInteractions(leadId) {
 const container = document.getElementById('leadInteractionsContainer');
 if (!container) return;
 try {
 const interactions = await fetchJSON(`/api/leads/${leadId}/interactions`);
 if (interactions.length === 0) {
 container.innerHTML = '<div class="text-center py-4" style="color:rgba(255,255,255,0.3);"><i class="bi bi-inbox"></i><p class="mt-1">Sin interacciones registradas</p></div>';
 return;
 }
 const ICONOS = { whatsapp:'bi-whatsapp', llamada:'bi-telephone', email:'bi-envelope', presencial:'bi-person-badge', manual:'bi-chat-dots', otro:'bi-chat' };
 const COLORES = { whatsapp:'#25D366', llamada:'#0dcaf0', email:'#6f42c1', presencial:'#ffc107', manual:'var(--htk-primary)', otro:'#6c757d' };
 container.innerHTML = interactions.map(int => {
 const icono = ICONOS[int.tipo] || 'bi-chat-dots';
 const color = COLORES[int.tipo] || 'var(--htk-primary)';
 const dirLabel = int.direccion === 'entrante' ? '→ Entrante' : '← Saliente';
 return `<div class="interaction-item" onclick="showInteractionPreview(${JSON.stringify(int).replace(/"/g,"&quot;")})">
 <div class="d-flex align-items-start gap-2">
 <i class="bi ${icono}" style="color:${color};font-size:1.3em;margin-top:3px;"></i>
 <div class="flex-grow-1">
 <div class="d-flex justify-content-between">
 <small style="color:${color};font-weight:600;">${dirLabel}</small>
 <small style="color:rgba(255,255,255,0.35);">${formatDateTime(int.fecha)}</small>
 </div>
 <div style="color:rgba(255,255,255,0.8);">${escHtml(int.resumen || 'Sin resumen')}</div>
 ${int.proximo_paso ? `<small style="color:var(--htk-primary);"> ${escHtml(int.proximo_paso)}</small>` : ''}
 </div>
 </div>
 </div>`;
 }).join('');
 } catch(e) {
 container.innerHTML = '<div class="text-center py-4" style="color:#dc3545;">Error al cargar interacciones</div>';
 }
}

async function loadClientInteractions(leadId) {
 const container = document.getElementById('clientInteractionsContainer');
 if (!container) return;
 try {
 const interactions = await fetchJSON(`/api/leads/${leadId}/interactions`);
 if (interactions.length === 0) {
 container.innerHTML = '<div class="text-center py-4" style="color:rgba(255,255,255,0.3);"><i class="bi bi-inbox"></i><p class="mt-1">Sin interacciones registradas</p></div>';
 return;
 }
 const ICONOS = { whatsapp:'bi-whatsapp', llamada:'bi-telephone', email:'bi-envelope', presencial:'bi-person-badge', manual:'bi-chat-dots', otro:'bi-chat' };
 const COLORES = { whatsapp:'#25D366', llamada:'#0dcaf0', email:'#6f42c1', presencial:'#ffc107', manual:'var(--htk-primary)', otro:'#6c757d' };
 container.innerHTML = interactions.map(int => {
 const icono = ICONOS[int.tipo] || 'bi-chat-dots';
 const color = COLORES[int.tipo] || 'var(--htk-primary)';
 const dirLabel = int.direccion === 'entrante' ? '→ Entrante' : '← Saliente';
 return `<div class="interaction-item" onclick="showInteractionPreview(${JSON.stringify(int).replace(/"/g,"&quot;")})">
 <div class="d-flex align-items-start gap-2">
 <i class="bi ${icono}" style="color:${color};font-size:1.3em;margin-top:3px;"></i>
 <div class="flex-grow-1">
 <div class="d-flex justify-content-between">
 <small style="color:${color};font-weight:600;">${dirLabel}</small>
 <small style="color:rgba(255,255,255,0.35);">${formatDateTime(int.fecha)}</small>
 </div>
 <div style="color:rgba(255,255,255,0.8);">${escHtml(int.resumen || 'Sin resumen')}</div>
 ${int.proximo_paso ? `<small style="color:var(--htk-primary);"> ${escHtml(int.proximo_paso)}</small>` : ''}
 </div>
 </div>
 </div>`;
 }).join('');
 } catch(e) {
 container.innerHTML = '<div class="text-center py-4" style="color:#dc3545;">Error al cargar interacciones</div>';
 }
}

function showInteractionPreview(int) {
 const ICONOS = { whatsapp:'bi-whatsapp', llamada:'bi-telephone', email:'bi-envelope', presencial:'bi-person-badge', manual:'bi-chat-dots', otro:'bi-chat' };
 const COLORES = { whatsapp:'#25D366', llamada:'#0dcaf0', email:'#6f42c1', presencial:'#ffc107', manual:'var(--htk-primary)', otro:'#6c757d' };
 const icono = ICONOS[int.tipo] || 'bi-chat-dots';
 const color = COLORES[int.tipo] || 'var(--htk-primary)';
 const dirLabel = int.direccion === 'entrante' ? 'Entrante (ellos contactaron)' : 'Saliente (nosotros contactamos)';
 
 let html = `
 <div class="d-flex align-items-center gap-2 mb-3">
 <i class="bi ${icono}" style="color:${color};font-size:1.5em;"></i>
 <div>
 <strong style="color:${color};">${int.tipo?.toUpperCase()}</strong>
 <small style="color:rgba(255,255,255,0.4);"> — ${dirLabel}</small>
 </div>
 </div>
 <p><strong>ID:</strong> ${int.id}</p>
 <p><strong>Lead:</strong> ${escHtml(int.lead_nombre || '-')}</p>
 <p><strong>Fecha:</strong> ${formatDateTime(int.fecha)}</p>
 <p><strong>Resumen:</strong> ${escHtml(int.resumen || '-')}</p>
 <p><strong>Detalle:</strong></p>
 <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;white-space:pre-wrap;">${escHtml(int.detalle || '-')}</div>
 ${int.proximo_paso ? `<p class="mt-2"><strong>Próximo Paso:</strong> ${escHtml(int.proximo_paso)}</p>` : ''}
 <p><strong>Estado:</strong> <span class="badge bg-secondary">${escHtml(int.estado||'-')}</span></p>
 `;
 setModal(' Interacción: ' + int.id, html, '');
 modalInstance.show();
}

function showAddInteraction(leadId) {
 const html = `
 <div class="mb-3">
 <label class="form-label">Tipo</label>
 <select class="form-select" id="intType">
 <option value="whatsapp"> WhatsApp</option>
 <option value="llamada"> Llamada</option>
 <option value="email"> Email</option>
 <option value="presencial"> Presencial</option>
 <option value="otro"> Otro</option>
 </select>
 </div>
 <div class="mb-3">
 <label class="form-label">Dirección</label>
 <select class="form-select" id="intDirection">
 <option value="saliente">Saliente (nosotros contactamos)</option>
 <option value="entrante">Entrante (ellos contactaron)</option>
 </select>
 </div>
 <div class="mb-3">
 <label class="form-label">Resumen</label>
 <input class="form-control" id="intSummary" placeholder="Ej: Pitch enviado, cotización enviada...">
 </div>
 <div class="mb-3">
 <label class="form-label">Detalle</label>
 <textarea class="form-control" id="intDetail" rows="3" placeholder="Descripción detallada..."></textarea>
 </div>
 <div class="mb-3">
 <label class="form-label">Próximo paso</label>
 <input class="form-control" id="intNextStep" placeholder="Ej: Esperar respuesta, llamar el viernes...">
 </div>`;
 
 setModal(' Nueva Interacción', html,
 `<button class="btn btn-htk" onclick="saveInteraction('${leadId}')"><i class="bi bi-check-lg"></i> Guardar</button>`
 );
 modalInstance.show();
}

async function saveInteraction(leadId) {
 const data = {
 tipo: document.getElementById('intType').value,
 direccion: document.getElementById('intDirection').value,
 resumen: document.getElementById('intSummary').value,
 detalle: document.getElementById('intDetail').value,
 proximo_paso: document.getElementById('intNextStep').value
 };
 try {
 await fetch(`/api/leads/${leadId}/interactions`, {
 method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
 });
 modalInstance.hide();
 showToast('Interacción registrada ');
 loadLeadInteractions(leadId);
 } catch(e) { showToast('Error al guardar', 'danger'); }
}

// Contact Person In-Place 
function editContactPerson(type, id) {
 const span = document.getElementById('leadContactPerson_' + id);
 const current = span.textContent === '-' ? '' : span.textContent;
 const name = prompt('Nombre de la persona contacto:', current);
 if (name === null) return;
 const cleanName = name.trim();
 if (cleanName === '' || cleanName === current) {
 if (cleanName === '') {
 fetchJSON('/api/leads/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contacto_nombre:''})});
 span.textContent = '-';
 }
 return;
 }
 fetchJSON('/api/leads/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contacto_nombre:cleanName})})
.then(d => { span.textContent = cleanName; showToast('Nombre de contacto actualizado'); })
.catch(e => showToast('Error: ' + e.message, 'danger'));
}

// Notes In-Place 
function toggleEditNotes(type, id) {
 document.getElementById(`notesDisplay_${id}`).style.display = 'none';
 document.getElementById(`notesEdit_${id}`).style.display = 'block';
}

function cancelEditNotes(type, id) {
 document.getElementById(`notesDisplay_${id}`).style.display = 'block';
 document.getElementById(`notesEdit_${id}`).style.display = 'none';
}

async function saveNotes(type, id) {
 const notas = document.getElementById(`notesTextarea_${id}`).value;
 try {
 await fetch(`/api/${type === 'lead' ? 'leads' : 'clients'}/${id}/notes`, {
 method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({notas})
 });
 document.getElementById(`notesDisplay_${id}`).innerHTML = notas ? escHtml(notas) : '<em style="color:rgba(255,255,255,0.3);">Sin notas</em>';
 cancelEditNotes(type, id);
 showToast('Notas guardadas ');
 } catch(e) { showToast('Error al guardar notas', 'danger'); }
}

// Pitch Functions 
// 
// MULTICHANNEL PITCH SYSTEM
// 

let pitchesData = null; // cached {canales, plantillas_cuerpo}
let currentPitchChannel = {}; // per-lead active channel: {leadId: 'whatsapp'|'email'}
let currentPitchTemplate = {}; // per-lead selected template id

async function fetchPitches() {
 if (pitchesData) return pitchesData;
 pitchesData = await fetchJSON('/api/pitches');
 return pitchesData;
}

// Auto-personalize: replace [Variables] with lead data
function personalizar(texto, lead) {
 const nombre = lead.nombre || '';
 const empresa = lead.nombre || lead.segmento || '';
 const contacto = lead.contacto || '';
 const telefono = (lead.contacto || '').replace(/[^\d+]/g, '');
 return texto
.replace(/\[Nombre\]/g, nombre)
.replace(/\[Empresa\]/g, empresa)
.replace(/\[Contacto\]/g, nombre || 'señor/a')
.replace(/\[Telefono\]/g, telefono || '315 603 2940');
}

// Score + sort templates to find best match for a lead
function scoreTemplates(templates, lead) {
 const segment = lead.segmento || '';
 const linea = lead.linea_interes || '';
 return templates.map(t => {
 let score = 0;
 const segs = t.segmentos || [];
 if (segs.includes(segment)) score += 10;
 if (segs.some(s => segment.includes(s) || s.includes(segment))) score += 5;
 const lines = t.lineas_interes || [];
 if (lines.some(l2 => linea.includes(l2) || l2.includes(linea))) score += 3;
 return {...t, score };
 }).sort((a, b) => b.score - a.score);
}

