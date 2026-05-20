// Globals 
const API = window.location.origin;
let clients = [], workOrders = [], leads = [], interactions = [];
let modalInstance = null;
let currentKanbanView = 'kanban'; // 'kanban' or 'table'
let currentKanbanSub = 'wo'; // 'wo' or 'leads'

let TIPOS_OT = {};

const ESTADOS_WO = {
 recibido: {label:'Recibido', class:'bg-secondary', icon:'bi-inbox'},
 diagnosticando: {label:' Diagnosticando', class:'bg-info', icon:'bi-search'},
 presupuestado: {label:' Presupuestado', class:'bg-warning text-dark', icon:'bi-cash-stack'},
 aprobado: {label:' Aprobado', class:'bg-success', icon:'bi-check-circle'},
 reparando: {label:' Reparando', class:'bg-primary', icon:'bi-tools'},
 esperando_repuestos: {label:' Esperando Repuestos', class:'bg-secondary', icon:'bi-box'},
 completado: {label:' Completado', class:'bg-success', icon:'bi-check2-all'},
 entregado: {label:' Entregado', class:'bg-success', icon:'bi-truck'},
 cancelado: {label:' Cancelado', class:'bg-danger', icon:'bi-x-circle'},
 // Fabricación
 cotizando: {label:'Cotizando', class:'bg-warning text-dark', icon:'bi-calculator'},
 diseno_aprobado: {label:'Diseño Aprobado', class:'bg-info', icon:'bi-check-circle'},
 materiales: {label:'Materiales', class:'bg-secondary', icon:'bi-box-seam'},
 bobinado: {label:'Bobinado', class:'bg-primary', icon:'bi-tools'},
 ensamble: {label:'Ensamble', class:'bg-info', icon:'bi-gear'},
 pruebas: {label:'Pruebas', class:'bg-warning text-dark', icon:'bi-lightning-charge'},
 control_calidad: {label:'Control Calidad', class:'bg-info', icon:'bi-clipboard-check'},
 finalizado: {label:'Finalizado', class:'bg-success', icon:'bi-check2-all'},
 // Instalación
 agendado: {label:'Agendado', class:'bg-secondary', icon:'bi-calendar-check'},
 en_sitio: {label:'En Sitio', class:'bg-info', icon:'bi-geo-alt'},
 instalando: {label:'Instalando', class:'bg-primary', icon:'bi-plug'},
 facturado: {label:'Facturado', class:'bg-success', icon:'bi-receipt'}
};

const ESTADOS_LEAD = {
 nuevo: {label:'Nuevo', class:'bg-secondary', icon:'bi-star'},
 contactado: {label:'Contactado', class:'bg-info', icon:'bi-chat'},
 cotizado: {label:'Cotizado', class:'bg-warning text-dark', icon:'bi-calculator'},
 negociacion: {label:'Negociación', class:'bg-primary', icon:'bi-handshake'},
 ganado: {label:'Ganado', class:'bg-success', icon:'bi-trophy'},
 perdido: {label:'Perdido', class:'bg-danger', icon:'bi-x-circle'},
 cliente: {label:'Cliente', class:'bg-success', icon:'bi-person-check'}
};

const ESTADOS_CLIENTE = {
 lead: {label:'Lead', class:'bg-secondary'},
 contacto: {label:'Contacto', class:'bg-info'},
 cliente: {label:'Cliente', class:'bg-success'},
 inactivo: {label:'Inactivo', class:'bg-danger'}
};

const WO_STATUS_ORDER_DEFAULT = ['recibido','diagnosticando','presupuestado','aprobado','reparando','esperando_repuestos','completado','entregado','cancelado'];
const LEAD_STATUS_ORDER = ['nuevo','contactado','cotizado','negociacion','ganado','perdido','cliente'];

function getWOStatusOrder(tipo) {
 if (tipo && TIPOS_OT[tipo] && TIPOS_OT[tipo].estados) {
 return TIPOS_OT[tipo].estados;
 }
 return WO_STATUS_ORDER_DEFAULT;
}

// Save Flash 
// ── Segmentos dinámicos desde DB ─────────────
let _segmentsCache = null;

async function loadSegments() {
 if (_segmentsCache) return _segmentsCache;
 try {
 const resp = await fetch('/api/segments');
 _segmentsCache = await resp.json();
 return _segmentsCache;
 } catch(e) {
 console.error('Error loading segments:', e);
 return [];
 }
}

function segmentOptionsHtml(selectedKey) {
 if (!window._segments) return '<option value="">— Sin segmento —</option>';
 let html = '<option value="">— Sin segmento —</option>';
 window._segments.forEach(s => {
 const sel = s.key === selectedKey ? 'selected' : '';
 html += `<option value="${s.key}" ${sel}>${s.label}</option>`;
 });
 return html;
}

async function populateSegmentSelects() {
 const segs = await loadSegments();
 window._segments = segs;
 document.querySelectorAll('[data-segments="true"]').forEach(sel => {
 const currentVal = sel.value;
 const placeholder = sel.getAttribute('data-placeholder') || 'Todos';
 const isLeadEdit = sel.hasAttribute('data-lead-edit');
 const currentLeadId = sel.getAttribute('data-lead-id');
 
 // Save selected value before clearing
 let selectedVal = currentVal;
 if (isLeadEdit && currentLeadId && window.leads) {
 const lead = window.leads.find(l => l.id === currentLeadId);
 if (lead) selectedVal = lead.segmento || '';
 }
 
 sel.innerHTML = `<option value="">${placeholder}</option>`;
 segs.forEach(s => {
 const opt = document.createElement('option');
 opt.value = s.key;
 opt.textContent = s.label;
 opt.style.color = s.color;
 if (s.key === selectedVal) opt.selected = true;
 sel.appendChild(opt);
 });
 });
}

function flashSave() {
 const el = document.getElementById('saveFlash');
 el.classList.add('show');
 setTimeout(() => el.classList.remove('show'), 1500);
}

// Toast 
function showToast(msg, type='success') {
 const t = document.getElementById('toastMsg');
 document.getElementById('toastBody').textContent = msg;
 t.querySelector('.toast-header i').className = type==='success' ? 'bi bi-check-circle-fill text-success me-2' : 'bi bi-exclamation-triangle-fill text-danger me-2';
 const bs = new bootstrap.Toast(t);
 bs.show();
}

// Loading Helpers 
function showLoading(loaderId, contentId) {
 document.getElementById(loaderId).style.display = 'flex';
 if (contentId) document.getElementById(contentId).style.display = 'none';
}
function hideLoading(loaderId, contentId) {
 document.getElementById(loaderId).style.display = 'none';
 if (contentId) document.getElementById(contentId).style.display = '';
}
function emptyState(contentId, emptyId, dataLength) {
 if (dataLength === 0) {
 if (contentId) document.getElementById(contentId).style.display = 'none';
 document.getElementById(emptyId).style.display = '';
 } else {
 if (contentId) document.getElementById(contentId).style.display = '';
 document.getElementById(emptyId).style.display = 'none';
 }
}

// ── Tab Navigation ──────────────────────────────────────────────────
document.querySelectorAll('.sidebar .nav-link[data-tab]').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    this.classList.add('active');
    const tab = this.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'kanban') loadKanban();
    if (tab === 'clients') loadClients();
    if (tab === 'workorders') loadWorkOrders();
    if (tab === 'leads') loadLeads();
    if (tab === 'interactions') loadInteractions();
    if (tab === 'inventario') loadInventario();
    if (tab === 'config') { switchConfigTab('general'); }
  });
});
document.querySelectorAll('.mobile-nav-link[data-tab]').forEach(link => {
 link.addEventListener('click', function(e) {
 e.preventDefault();
 document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
 document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
 this.classList.add('active');
 const sidebarCounterpart = document.querySelector(`.sidebar .nav-link[data-tab="${this.dataset.tab}"]`);
 if (sidebarCounterpart) sidebarCounterpart.classList.add('active');
 const tab = this.dataset.tab;
 document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
 document.getElementById('tab-' + tab).classList.add('active');
 if (tab === 'dashboard') loadDashboard();
 if (tab === 'kanban') loadKanban();
 if (tab === 'clients') loadClients();
 if (tab === 'workorders') loadWorkOrders();
 if (tab === 'leads') loadLeads();
 if (tab === 'interactions') loadInteractions();
 if (tab === 'inventario') loadInventario();
 if (tab === 'config') { switchConfigTab('general'); }
 });
});

// Global Search Keyboard Shortcut 
document.addEventListener('keydown', function(e) {
 if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
 e.preventDefault();
 document.getElementById('globalSearch').focus();
 }
});

// Global Search 
let globalSearchTimer = null;
function globalSearchDebounce() {
 clearTimeout(globalSearchTimer);
 globalSearchTimer = setTimeout(globalSearch, 200);
}

function globalSearch() {
 const q = document.getElementById('globalSearch').value.trim().toLowerCase();
 const dropdown = document.getElementById('searchDropdown');
 if (!q) { dropdown.classList.remove('show'); return; }
 
 let results = [];
 
 // Search leads
 leads.forEach(l => {
 if ((l.nombre||'').toLowerCase().includes(q) || (l.contacto||'').toLowerCase().includes(q) || (l.id||'').toLowerCase().includes(q))
 results.push({type:'lead', id:l.id, name:l.nombre||l.id, meta:l.contacto||'', estado:l.estado, badge:ESTADOS_LEAD[l.estado]?.class||'bg-secondary', label:ESTADOS_LEAD[l.estado]?.label||l.estado});
 });
 
 // Search clients
 clients.forEach(c => {
 if ((c.nombre||'').toLowerCase().includes(q) || (c.telefono||'').toLowerCase().includes(q) || (c.id||'').toLowerCase().includes(q))
 results.push({type:'client', id:c.id, name:c.nombre||c.id, meta:c.telefono||'', estado:c.estado, badge:ESTADOS_CLIENTE[c.estado]?.class||'bg-secondary', label:ESTADOS_CLIENTE[c.estado]?.label||c.estado});
 });
 
 // Search work orders
 workOrders.forEach(o => {
 if ((o.id||'').toLowerCase().includes(q) || (o.cliente?.nombre||'').toLowerCase().includes(q) || (o.equipo?.marca||'').toLowerCase().includes(q) || (o.equipo?.modelo||'').toLowerCase().includes(q))
 results.push({type:'wo', id:o.id, name:o.id, meta:(o.cliente?.nombre||'')+' — '+(o.equipo?.marca||'')+' '+(o.equipo?.modelo||''), estado:o.estado, badge:ESTADOS_WO[o.estado]?.class||'bg-secondary', label:ESTADOS_WO[o.estado]?.label||o.estado});
 });
 
 results = results.slice(0, 12);
 
 if (results.length === 0) {
 dropdown.innerHTML = '<div class="p-3 text-center" style="color:rgba(255,255,255,0.3);">Sin resultados para "<strong>'+escHtml(q)+'</strong>"</div>';
 } else {
 const icons = {lead:'bi-graph-up-arrow', client:'bi-people', wo:'bi-tools'};
 dropdown.innerHTML = results.map(r => `
 <div class="search-result-item" onclick="navigateToResult('${r.type}','${r.id}')">
 <div class="sr-icon" style="color:var(--htk-primary);"><i class="bi ${icons[r.type]}"></i></div>
 <div class="sr-info">
 <strong>${escHtml(r.name)}</strong>
 <small>${escHtml(r.meta)}</small>
 </div>
 <span class="badge ${r.badge} sr-badge">${r.label}</span>
 </div>
 `).join('');
 }
 dropdown.classList.add('show');
}

function navigateToResult(type, id) {
 document.getElementById('searchDropdown').classList.remove('show');
 document.getElementById('globalSearch').value = '';
 document.getElementById('globalSearch').blur();
 
 if (type === 'lead') {
 // Navigate to leads tab and show lead detail
 navigateToTab('leads');
 setTimeout(() => showLeadDetail(id), 300);
 } else if (type === 'client') {
 navigateToTab('clients');
 setTimeout(() => showClientDetail(id), 300);
 } else if (type === 'wo') {
 navigateToTab('workorders');
 setTimeout(() => showWODetail(id), 300);
 }
}

function navigateToTab(tabName) {
 document.querySelectorAll('.sidebar .nav-link.active').forEach(l => l.classList.remove('active'));
 document.querySelectorAll('.mobile-nav-link.active').forEach(l => l.classList.remove('active'));
 const target = document.querySelector(`.sidebar .nav-link[data-tab="${tabName}"]`);
 const mobileTarget = document.querySelector(`.mobile-nav-link[data-tab="${tabName}"]`);
 if (target) {
 target.classList.add('active');
 if (mobileTarget) mobileTarget.classList.add('active');
 document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
 document.getElementById('tab-' + tabName).classList.add('active');
 if (tabName === 'leads') loadLeads();
 if (tabName === 'clients') loadClients();
 if (tabName === 'workorders') loadWorkOrders();
 }
}

function handleGlobalSearchFocus() {
 const q = document.getElementById('globalSearch').value.trim();
 if (q) document.getElementById('searchDropdown').classList.add('show');
}
function handleGlobalSearchBlur() {
 setTimeout(() => document.getElementById('searchDropdown').classList.remove('show'), 200);
}

// Notifications 
function updateNotifications() {
 const newLeads = leads.filter(l => l.estado === 'nuevo').length;
 // Update kanban badge with active OTs
 loadOTNotifBadges();
 
 // Top bar notification indicators
 const topNotifs = document.getElementById('topNotifications');
 let notifHTML = '';
 if (newLeads > 0) {
 notifHTML += `<div class="badge bg-danger" style="font-size:0.75em;" title="${newLeads} prospecto(s) nuevo(s) sin contactar">
 <i class="bi bi-person-plus"></i> ${newLeads} nuevo(s)
 </div>`;
 }
 const activeWO = workOrders.filter(o => o.estado !== 'cancelado' && o.estado !== 'entregado').length;
 if (activeWO > 0) {
 notifHTML += `<div class="badge bg-info" style="font-size:0.75em;" title="${activeWO} órdenes activas en taller">
 <i class="bi bi-tools"></i> ${activeWO} en taller
 </div>`;
 }
 topNotifs.innerHTML = notifHTML;
}

async function loadOTNotifBadges() {
  try {
    const resp = await fetch('/api/work_orders/kanban');
    const data = await resp.json();
    const todas = Object.values(data.tarjetas || {}).flat();
    const totalActivas = todas.filter(
      t => !['entregado','cancelado','finalizado','facturado'].includes(t.estado)
    ).length;
    
    const badge = document.getElementById('kanbanNotif');
    if (badge) {
      if (totalActivas > 0) {
        badge.classList.remove('d-none');
        badge.textContent = totalActivas;
      } else {
        badge.classList.add('d-none');
      }
    }
  } catch(e) { /* silencioso */ }
}

// Data Loading 
async function fetchJSON(url, options) { 
 try {
  if (options) { const r = await fetch(url, options); return r.json(); }
  const r = await fetch(url); return r.json();
 } catch(e) {
  console.error('fetchJSON failed:', url, e.message);
  return {error: 'Error de conexión'};
 }
}
function getVal(id) { return document.getElementById(id).value; }

// Automation Tools 
async function runAuto(action, params) {
 const resultDiv = document.getElementById('auto' + action.charAt(0).toUpperCase() + action.slice(1) + 'Result');
 const status = document.getElementById('autoStatus');
 const output = document.getElementById('autoOutput');
 const pre = document.getElementById('autoOutputPre');
 
 if (resultDiv) resultDiv.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
 if (status) { status.style.display = 'block'; status.innerHTML = '<i class="bi bi-arrow-repeat spinner"></i> Ejecutando ' + action + '...'; status.className = 'alert alert-info mb-3'; }
 
 try {
 let resp;
 if (action === 'score') {
 const qs = new URLSearchParams(params).toString();
 resp = await fetch('/api/auto/score?' + qs);
 } else {
 resp = await fetch('/api/auto/' + action, {
 method: 'POST',
 headers: {'Content-Type': 'application/json'},
 body: JSON.stringify(params)
 });
 }
 const data = await resp.json();
 
 if (status) {
 if (data.ok) {
 status.innerHTML = '<i class="bi bi-check-circle-fill"></i> Completo';
 status.className = 'alert alert-success mb-3';
 } else {
 status.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Error: ' + (data.error || 'desconocido');
 status.className = 'alert alert-danger mb-3';
 }
 }
 
 // Show output
 if (resultDiv) {
 if (data.output) {
 // Parse output - highlight key metrics
 const lines = data.output.split('\n').filter(l => l.trim());
 let html = '<div class="mt-1">';
 let count = 0;
 for (const line of lines) {
 if (line.includes('OK') || line.includes('')) {
 html += '<div style="color:var(--htk-primary)">' + escapeHtml(line) + '</div>';
 count++;
 } else if (line.includes('X ') || line.includes('') || line.includes('Error')) {
 html += '<div style="color:#ff6b6b">' + escapeHtml(line) + '</div>';
 count++;
 } else if (line.includes('Resumen') || line.includes('Completo') || line.includes('Total') || line.includes('Leads')) {
 html += '<div style="color:rgba(255,255,255,0.7)"><strong>' + escapeHtml(line) + '</strong></div>';
 count++;
 } else if (count < 30) {
 html += '<div style="color:rgba(255,255,255,0.5)">' + escapeHtml(line) + '</div>';
 count++;
 }
 }
 html += '</div>';
 resultDiv.innerHTML = html;
 
 // Also show full output
 pre.textContent = data.output;
 output.style.display = 'block';
 } else if (data.error) {
 resultDiv.innerHTML = '<div style="color:#ff6b6b">Error: ' + escapeHtml(data.error) + '</div>';
 } else {
 resultDiv.innerHTML = '<div style="color:var(--htk-primary)">Completado sin salida</div>';
 }
 }
 
 showToast(action + ' completado', data.ok ? 'success' : 'danger');
 } catch(e) {
 if (resultDiv) resultDiv.innerHTML = '<div style="color:#ff6b6b">Error de conexión: ' + e.message + '</div>';
 if (status) { status.innerHTML = '<i class="bi bi-x-circle-fill"></i> Error de conexión'; status.className = 'alert alert-danger mb-3'; }
 showToast('Error: ' + e.message, 'danger');
 }
}

async function showBackupList() {
 try {
 const resp = await fetch('/api/auto/backup', {method:'POST'});
 const data = await resp.json();
 const pre = document.getElementById('autoOutputPre');
 const output = document.getElementById('autoOutput');
 if (data.output) {
 pre.textContent = data.output;
 output.style.display = 'block';
 } else if (data.error) {
 pre.textContent = 'Error: ' + data.error;
 output.style.display = 'block';
 }
 } catch(e) {
 showToast('Error: ' + e.message, 'danger');
 }
}

function escapeHtml(text) {
 const d = document.createElement('div');
 d.textContent = text;
 return d.innerHTML;
}


// ─── PIPELINE FUNNEL (Dashboard) ───────────────────────
async function loadPipeline() {
  const container = document.getElementById('pipelineFunnel');
  if (!container) return;
  try {
    const data = await fetchJSON('/api/pipeline');
    const funnel = data.funnel || [];
    let html = '<div class="d-flex align-items-end gap-2" style="height:150px;">';
    funnel.forEach(f => {
      const maxCount = Math.max(...funnel.map(x=>x.count), 1);
      const h = f.count > 0 ? Math.max(15, (f.count / maxCount) * 130) : 8;
      html += `<div class="flex-fill text-center" style="cursor:pointer;" onclick="loadLeadsTab();setLeadFilter('estado','${f.clave}')" title="${f.nombre}: ${f.count} leads (${f.pct}%)">
        <div style="font-size:0.75em;font-weight:600;color:#fff;">${f.count}</div>
        <div class="funnel-bar mx-auto" style="height:${h}px;background:${f.color};border-radius:6px 6px 0 0;width:80%;min-width:40px;"></div>
        <div style="font-size:0.65em;color:rgba(255,255,255,0.5);margin-top:4px;">${f.nombre}</div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) {}
}

// Load kanban when tab clicked
document.querySelector('[data-tab="kanban"]')?.addEventListener('click', loadKanban);


async function loadDashboard() {
 showLoading('dashboardLoading','dashboardContent');
 try {
 const stats = await fetchJSON('/api/stats');
 document.getElementById('statTotalLeads').textContent = stats.total_leads;
 document.getElementById('statClients').textContent = stats.total_clients;
 document.getElementById('statActiveWO').textContent = stats.active_work_orders;
 document.getElementById('statCompletedWO').textContent = stats.completed_work_orders;

 // WO by status
 const wc = document.getElementById('woByStatusChart');
 const statusMap = stats.wo_by_status || {};
 const allWOStatuses = [...new Set([...WO_STATUS_ORDER_DEFAULT, ...Object.values(TIPOS_OT).flatMap(t => t.estados||[])])];
 wc.innerHTML = allWOStatuses.map(s => {
 const count = statusMap[s] || 0;
 const pct = stats.total_work_orders > 0 ? (count / stats.total_work_orders * 100) : 0;
 if (count === 0) return '';
 return `<div class="mb-2">
 <div class="d-flex justify-content-between">
 <small>${ESTADOS_WO[s].label}</small>
 <small>${count}</small>
 </div>
 <div class="progress" style="height:6px;">
 <div class="progress-bar progress-bar-htk" style="width:${pct}%"></div>
 </div>
 </div>`;
 }).join('');

 // Leads by linea
 const lc = document.getElementById('leadsByLineaChart');
 const lineaMap = stats.leads_by_linea || {};
 const colorMap = { automatizacion:'#00d4aa', iot:'#0dcaf0', mantenimiento:'#ffc107', cargadores:'#dc3545', varios:'#6c757d' };
 lc.innerHTML = Object.entries(lineaMap).map(([linea, count]) => {
 const pct = stats.total_leads > 0 ? (count / stats.total_leads * 100) : 0;
 const color = colorMap[linea] || '#6c757d';
 return `<div class="mb-2">
 <div class="d-flex justify-content-between">
 <small>${linea.charAt(0).toUpperCase() + linea.slice(1)}</small>
 <small>${count}</small>
 </div>
 <div class="progress" style="height:6px;">
 <div class="progress-bar" style="width:${pct}%;background:${color}"></div>
 </div>
 </div>`;
 }).join('');

 // Recent WO
 const orders = await fetchJSON('/api/work_orders');
 workOrders = orders;
 const recent = orders.slice(-10).reverse();
 document.getElementById('recentWOBody').innerHTML = recent.map(o => {
 const es = ESTADOS_WO[o.estado] || {label:o.estado, class:'bg-secondary'};
 return `<tr>
 <td><strong>${o.id}</strong></td>
 <td>${escHtml(o.cliente?.nombre || '-')}</td>
 <td>${escHtml(o.equipo?.marca || '')} ${escHtml(o.equipo?.modelo || '')}</td>
 <td><span class="badge ${es.class}">${es.label}</span></td>
 <td>${formatDate(o.fechas?.recibido)}</td>
 </tr>`;
 }).join('');
 
 // Render upcoming followups from leads data
 renderUpcomingFollowups();
 
 // OT Financial Stats
 loadOTFinancialStats(orders);
 
 hideLoading('dashboardLoading','dashboardContent');
 } catch(e) { showToast('Error al cargar dashboard', 'danger'); hideLoading('dashboardLoading','dashboardContent'); }
};

function loadOTFinancialStats(orders) {
  const todas = orders || [];
  const activas = todas.filter(o => !['entregado','cancelado','finalizado','facturado'].includes(o.estado)).length;
  const totalPresupuestado = todas.reduce((s, o) => s + (o.presupuesto || 0), 0);
  const totalAbonado = todas.reduce((s, o) => s + (o.total_abonado || 0), 0);
  const totalPendiente = todas.reduce((s, o) => s + (o.saldo_pendiente || 0), 0);
  
  const elActivas = document.getElementById('statsOtActivas');
  const elPresup = document.getElementById('statsPresupuestado');
  const elAbonado = document.getElementById('statsAbonado');
  const elPendiente = document.getElementById('statsPendiente');
  
  if (elActivas) elActivas.textContent = activas;
  if (elPresup) elPresup.textContent = '$' + totalPresupuestado.toLocaleString('es-CO');
  if (elAbonado) elAbonado.textContent = '$' + totalAbonado.toLocaleString('es-CO');
  if (elPendiente) elPendiente.textContent = '$' + totalPendiente.toLocaleString('es-CO');
}

function escHtml(s) {
 if (!s) return '';
 return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(iso) {
 if (!iso) return '-';
 try { const d = new Date(iso); return d.toLocaleDateString('es-CO'); }
 catch(e) { return iso; }
}

function formatCurrency(n) {
 if (!n && n !== 0) return '-';
 return '$' + Number(n).toLocaleString('es-CO');
}

function formatDateTime(iso) {
 if (!iso) return '-';
 try { const d = new Date(iso); return d.toLocaleString('es-CO'); }
 catch(e) { return iso; }
}

// CLIENTES 
async function loadClients() {
 showLoading('clientsLoading','clientsContent');
 try {
 const data = await fetchJSON('/api/clients');
 if (Array.isArray(data)) clients = data;
 } catch(e) {}
 renderClients();
 updateNotifications();
}

function renderClients() {
 const q = (document.getElementById('clientSearch')?.value || '').toLowerCase();
 const filtered = clients.filter(c =>
 (c.nombre || '').toLowerCase().includes(q) || (c.telefono || '').includes(q) || (c.id || '').toLowerCase().includes(q)
 );
 document.getElementById('clientsBody').innerHTML = filtered.map(c => {
 const es = ESTADOS_CLIENTE[c.estado] || {label:c.estado||'nuevo', class:'bg-secondary'};
 return `<tr>
 <td><strong>${c.id}</strong>${c.lead_id?` <small style="color:var(--htk-primary);font-size:0.7em;">← ${c.lead_id}</small>`:''}</td>
 <td><strong>${escHtml(c.nombre || '-')}</strong></td>
 <td>${escHtml(c.telefono || '-')}</td>
 <td><span class="badge ${es.class}">${es.label}</span></td>
 <td>${escHtml(c.segmento || '-')}</td>
 <td>${escHtml(c.linea_interes || '-')}</td>
 <td><span class="badge bg-info">${(c.ordenes||[]).length}</span></td>
 <td><small>${formatDate(c.ultimo_contacto)}</small></td>
 <td>
 <button class="action-btn primary" onclick="showModal('client','${c.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
 <button class="action-btn primary" onclick="showClientDetail('${c.id}')" title="Ver detalle"><i class="bi bi-eye"></i></button>
 <button class="action-btn danger" onclick="deleteItem('clients','${c.id}','${escHtml(c.nombre||'')}')" title="Eliminar"><i class="bi bi-trash"></i></button>
 </td>
 </tr>`;
 }).join('');
 emptyState(null, 'clientsEmpty', filtered.length);
 hideLoading('clientsLoading','clientsContent');
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
async function loadWorkOrders() {
 showLoading('woLoading','woContent');
 try {
 const data = await fetchJSON('/api/work_orders');
 if (Array.isArray(data)) workOrders = data;
 } catch(e) {}
 renderWorkOrders();
 updateNotifications();
}

function renderWorkOrders() {
 const q = (document.getElementById('woSearch')?.value || '').toLowerCase();
 const st = document.getElementById('woStatusFilter')?.value || '';
 const filtered = workOrders.filter(o => {
 if (st && o.estado !== st) return false;
 return (o.cliente?.nombre || '').toLowerCase().includes(q) ||
 (o.id || '').toLowerCase().includes(q) ||
 (o.equipo?.marca || '').toLowerCase().includes(q) ||
 (o.falla_reportada || '').toLowerCase().includes(q);
 });
 document.getElementById('woBody').innerHTML = filtered.map(o => {
 const es = ESTADOS_WO[o.estado] || {label:o.estado, class:'bg-secondary'};
 const tipoInfo = TIPOS_OT[o.tipo] || {};
 return `<tr>
 <td><strong><a href="/ordenes/${o.id}" style="color:var(--htk-primary);text-decoration:none;">${o.id}</a></strong></td>
 <td><span class="badge" style="background:${tipoInfo.color||'#f97316'};color:#fff;font-size:0.75em;">${tipoInfo.icono||'🔧'} ${tipoInfo.label||'Reparación'}</span></td>
 <td><a href="/ordenes/${o.id}" style="color:#fff;text-decoration:none;"><span title="${tipoInfo.label||o.tipo||'Reparación'}">${tipoInfo.icono||'🔧'}</span> ${escHtml(o.cliente?.nombre || '-')}</a></td>
 <td>${escHtml(o.cliente?.telefono || '-')}</td>
 <td>${escHtml(o.equipo?.marca || '')} ${escHtml(o.equipo?.modelo || '')} <small class="text-secondary">(${escHtml(o.equipo?.tipo||'')})</small></td>
 <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(o.falla_reportada||'')}">${escHtml(o.falla_reportada||'-')}</td>
 <td>${formatCurrency(o.presupuesto)}</td>
 <td><span class="badge ${es.class}">${es.label}</span></td>
 <td><small>${formatDate(o.fechas?.recibido)}</small></td>
 <td>
 <button class="action-btn primary" onclick="showModal('workorder','${o.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
 <button class="action-btn primary" onclick="showWODetail('${o.id}')" title="Ver detalle + historial"><i class="bi bi-eye"></i></button>
 <button class="action-btn primary" onclick="showStatusModal('${o.id}')" title="Cambiar estado"><i class="bi bi-arrow-right-circle"></i></button>
 <button class="action-btn danger" onclick="deleteItem('work_orders','${o.id}','${o.id}')" title="Eliminar"><i class="bi bi-trash"></i></button>
 </td>
 </tr>`;
 }).join('');
 emptyState(null, 'woEmpty', filtered.length);
 hideLoading('woLoading','woContent');
}

async function showWODetail(id) {
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

 detailHTML += `<button class="btn btn-sm btn-htk mt-2" onclick="showPaymentModal('${o.id}')"><i class="bi bi-plus-lg"></i> Registrar abono</button>
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
 `<button class="btn btn-htk" onclick="updateStatus('${id}')"><i class="bi bi-check-lg"></i> Actualizar Estado</button>`
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
  
  const html = `
  <p><strong>Orden:</strong> ${o.id} — ${escHtml(o.cliente?.nombre||'')}</p>
  <p><strong>Presupuesto:</strong> ${formatCurrency(o.presupuesto)} · <strong>Pendiente:</strong> ${formatCurrency(o.saldo_pendiente !== null ? o.saldo_pendiente : (o.presupuesto||0)-(o.total_abonado||0))}</p>
  <div class="mb-3">
    <label class="form-label">Monto <span class="text-danger">*</span></label>
    <input class="form-control" id="payMonto" type="number" placeholder="Ej: 150000" min="1" step="1">
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
    `<button class="btn btn-htk" onclick="savePayment('${woId}')"><i class="bi bi-check-lg"></i> Registrar</button>`
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
// LEADS 
async function loadLeads() {
 showLoading('leadsLoading','leadsContent');
 try {
 const data = await fetchJSON('/api/leads');
 if (Array.isArray(data)) leads = data;
 } catch(e) {}
 renderLeads();
 updateNotifications();
}

function renderLeads() {
 const q = (document.getElementById('leadSearch')?.value || '').toLowerCase();
 const seg = document.getElementById('leadSegmentFilter')?.value || '';
 const est = document.getElementById('leadEstadoFilter')?.value || '';
 const svc = document.getElementById('leadServicioFilter')?.value || '';
 const filtered = leads.filter(l => {
 if (seg && l.segmento !== seg) return false;
 if (est && (l.estado || 'nuevo') !== est) return false;
 if (svc && (l.linea_interes || '') !== svc) return false;
 return (l.nombre || '').toLowerCase().includes(q) || (l.contacto || '').toLowerCase().includes(q) || (l.id || '').toLowerCase().includes(q);
 });
 document.getElementById('leadsBody').innerHTML = filtered.map(l => {
 const es = ESTADOS_LEAD[l.estado] || {label:l.estado||'nuevo', class:'bg-secondary'};
 const canConvert = l.estado !== 'cliente' && l.estado !== 'perdido';
 const stages = ['nuevo','contactado','cotizado','negociacion','ganado','perdido','cliente'];
 const stageIdx = stages.indexOf(l.estado || 'nuevo');
 let stageBtns = '';
 if (stageIdx > 0 && l.estado !== 'cliente' && l.estado !== 'perdido') {
 stageBtns += '<button class="action-btn" onclick="changeLeadStage(\''+l.id+'\',\'prev\')" title="Etapa anterior"><i class="bi bi-chevron-left"></i></button>';
 }
 if (stageIdx < stages.length - 1 && l.estado !== 'cliente' && l.estado !== 'perdido') {
 stageBtns += '<button class="action-btn" onclick="changeLeadStage(\''+l.id+'\',\'next\')" title="Siguiente etapa"><i class="bi bi-chevron-right"></i></button>';
 }
 return `<tr>
 <td><strong>${l.id}${l.estado==='cliente'?' <span class="badge bg-success" style="font-size:0.6em;">✓ Cliente</span>':''}</strong></td>
 <td><strong><a href="/leads/${l.id}" style="color:var(--htk-primary);text-decoration:none;">${escHtml(l.nombre || '-')}</a></strong></td>
 <td>${escHtml(l.contacto || '-')}</td>
 <td>${escHtml(l.segmento || '-')}</td>
 <td>${escHtml(l.linea_interes || '-')}</td>
 <td><span class="badge ${es.class}">${es.label}</span></td>
 <td>${formatCurrency(l.valor_estimado)}</td>
 <td><small>${formatDate(l.fecha_creacion)}</small></td>
 <td>
 <div class="d-flex gap-1 flex-wrap" style="max-width:200px;">
 <button class="action-btn primary" onclick="showLeadDetail('${l.id}')" title="Ver perfil"><i class="bi bi-eye"></i></button>
 ${(()=>{let p=(l.telefono||l.contacto||'').replace(/[^\d+]/g,'');if(p&&!p.startsWith('+'))p='+57'+p.replace(/^57/,'');return p&&p!=='+57'?`<button class="action-btn" style="color:#25D366;" onclick="window.open('https://wa.me/${p.replace(/\+/g,'')}','_blank')" title="WhatsApp rápido"><i class="bi bi-whatsapp"></i></button>`:'';})()}
 ${l.email&&l.email.includes('@')?`<button class="action-btn" style="color:#0dcaf0;" onclick="window.open('mailto:${l.email}','_blank')" title="Enviar email"><i class="bi bi-envelope"></i></button>`:''}
 <button class="action-btn" style="color:var(--htk-primary);" onclick="showModal('lead','${l.id}')" title="Editar lead"><i class="bi bi-pencil"></i></button>
 ${canConvert ? `<button class="action-btn" style="color:#ffc107;" onclick="convertLead('${l.id}')" title="Convertir a Cliente"><i class="bi bi-person-plus"></i></button>` : ''}
 <button class="action-btn danger" onclick="deleteItem('leads','${l.id}','${escHtml(l.nombre||'')}')" title="Eliminar"><i class="bi bi-trash"></i></button>
 ${stageBtns}
 </div>
 </td>
 </tr>`;
 }).join('');
 emptyState(null, 'leadsEmpty', filtered.length);
 hideLoading('leadsLoading','leadsContent');
}

async function showLeadDetail(id) {
 const l = leads.find(x => x.id === id);
 if (!l) return;

 // Parse contact info for action buttons — prefer new fields, fall back to contacto
 const contactoStr = l.contacto || '';
 let phoneClean = l.telefono || '';
 let hasEmail = !!(l.email && l.email.includes('@'));
 let emailAddr = l.email || '';
 let hasWeb = !!(l.url && l.url.trim());
 let webUrl = l.url || '';
 if (webUrl && !webUrl.startsWith('http')) webUrl = 'https://' + webUrl;
 let hasFb = false;
 let fbUser = '';

 // Fallback: parse from contacto if new fields empty
 if (!phoneClean && contactoStr) {
 phoneClean = contactoStr.replace(/[^\d+]/g, '');
 }
 if (!hasEmail && contactoStr.includes('@')) {
 hasEmail = true;
 emailAddr = contactoStr;
 }
 if (!hasWeb && contactoStr) {
 if (contactoStr.toLowerCase().includes('http') || contactoStr.toLowerCase().includes('www.') || contactoStr.toLowerCase().includes('.com')) {
 hasWeb = true; webUrl = contactoStr.startsWith('http') ? contactoStr : 'https://' + contactoStr;
 }
 }
 if (contactoStr.toLowerCase().includes('facebook')) {
 hasFb = true;
 fbUser = contactoStr.replace(/facebook:?\s*@?/i, '').trim();
 }
 // Clean phone
 if (phoneClean) {
 phoneClean = phoneClean.replace(/[^\d+]/g, '');
 if (phoneClean && !phoneClean.startsWith('+')) phoneClean = '+57' + phoneClean.replace(/^57/,'');
 if (phoneClean === '+57') phoneClean = '';
 }

 const initials = (l.nombre || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

 // Contact profile card
 let contactCardHTML = `<div class="contact-profile-card">
 <div class="d-flex align-items-center gap-3 mb-3">
 <div class="contact-avatar">${initials}</div>
 <div>
 <h5 style="color:#fff;margin:0;">${escHtml(l.nombre || '-')}</h5>
 <small style="color:rgba(255,255,255,0.4);">${escHtml(l.segmento || '')}</small>
 </div>
 </div>
 <div class="row g-2">
 `;

 if (phoneClean) {
 contactCardHTML += `
 <div class="col-md-6">
 <button class="contact-action-btn" id="copyPhoneLead_${id}" onclick="copyToClipboard('${phoneClean}','copyPhoneLead_${id}')" title="Copiar teléfono">
 <i class="bi bi-telephone-fill" style="color:var(--htk-primary);"></i> ${phoneClean}
 </button>
 </div>
 <div class="col-md-6">
 <a class="contact-action-btn" href="https://wa.me/${phoneClean.replace(/\+/g,'')}?text=Hola%20${encodeURIComponent(l.nombre||'')}%2C%20te%20escribimos%20de%20HTK%20INGENIERIA" target="_blank" title="Abrir chat de WhatsApp">
 <i class="bi bi-whatsapp" style="color:#25D366;"></i> WhatsApp
 </a>
 </div>`;
 }
 if (hasEmail) {
 contactCardHTML += `
 <div class="col-md-6">
 <a class="contact-action-btn" href="mailto:${emailAddr}" target="_blank" title="Enviar correo">
 <i class="bi bi-envelope-fill" style="color:#0dcaf0;"></i> ${emailAddr}
 </a>
 </div>`;
 }
 if (hasWeb) {
 contactCardHTML += `
 <div class="col-md-6">
 <a class="contact-action-btn" href="${webUrl}" target="_blank" title="Visitar sitio web">
 <i class="bi bi-globe2" style="color:var(--htk-primary);"></i> Visitar web
 </a>
 </div>`;
 }
 if (hasFb) {
 contactCardHTML += `
 <div class="col-md-6">
 <a class="contact-action-btn" href="https://facebook.com/${fbUser}" target="_blank" title="Ver perfil de Facebook">
 <i class="bi bi-facebook" style="color:#1877F2;"></i> Facebook
 </a>
 </div>`;
 }

 contactCardHTML += `
 </div>
 <div class="row mt-2">
 <div class="col-12">
 <small style="color:rgba(255,255,255,0.35);">
 <span class="badge ${ESTADOS_LEAD[l.estado]?.class||'bg-secondary'} me-2">${ESTADOS_LEAD[l.estado]?.label||l.estado}</span>
 ${l.linea_interes ? '<span class="me-2"> '+escHtml(l.linea_interes)+'</span>' : ''}
 <span>Creado: ${formatDate(l.fecha_creacion)||'—'}</span>
 </small>
 </div>
 </div>
 </div>`;

 // Stage navigation
 const stageNames = ['nuevo','contactado','cotizado','negociacion','ganado','perdido','cliente'];
 const sIdx = stageNames.indexOf(l.estado);
 const stageProgress = sIdx >= 0 ? Math.round((sIdx / (stageNames.length - 1)) * 100) : 0;
 const stageNavHTML = `
 <div class="stage-navigation mt-3 mb-2">
 <div class="d-flex justify-content-between align-items-center">
 <button class="btn btn-sm btn-outline-htk" onclick="changeLeadStage('${id}','prev')" title="Etapa anterior"><i class="bi bi-chevron-left"></i> Anterior</button>
 <span class="badge ${ESTADOS_LEAD[l.estado]?.class||'bg-secondary'} fs-6">${ESTADOS_LEAD[l.estado]?.label||l.estado}</span>
 <button class="btn btn-sm btn-htk" onclick="changeLeadStage('${id}','next')" title="Siguiente etapa">Siguiente <i class="bi bi-chevron-right"></i></button>
 </div>
 <div class="progress mt-2" style="height:4px;">
 <div class="progress-bar progress-bar-htk" style="width:${stageProgress}%"></div>
 </div>
 </div>`;

 let html = contactCardHTML + stageNavHTML;

 // If lead is a converted client, show mini client profile
 if (l.estado === 'cliente') {
   try {
     const fullLead = await fetchJSON('/api/leads/' + id);
     const cv = fullLead.cliente_vinculado;
     if (cv) {
       html += `<div class="client-mini-card">
         <div class="d-flex justify-content-between align-items-start">
           <div>
             <div class="cli-name">👤 Cliente: ${escHtml(cv.nombre||'')}</div>
             <div class="cli-meta">
               ${cv.telefono?'📞 '+escHtml(cv.telefono)+' · ':''}
               ${cv.empresa?'🏢 '+escHtml(cv.empresa)+' · ':''}
               ${cv.ciudad?'📍 '+escHtml(cv.ciudad)+' · ':''}
               🔧 ${cv.ordenes_count||0} órdenes activas
             </div>
           </div>
           <button class="btn btn-sm btn-outline-htk" onclick="showClientDetail('${cv.id}')" title="Ver perfil completo">
             <i class="bi bi-person-badge"></i> Ver perfil →
           </button>
         </div>
       </div>`;
     }
   } catch(e) {}
 }

 html += `
 <div class="row">
 <div class="col-md-6">
 <p><strong>ID:</strong> ${l.id}</p>
 <p><strong>Nombre Contacto:</strong> <span id="leadContactPerson_${id}">${escHtml(l.contacto_nombre || '-')}</span>
 <button class="btn btn-sm btn-link p-0 ms-1" onclick="editContactPerson('lead','${id}')" title="Editar nombre de contacto" style="font-size:0.75em;color:var(--htk-primary);"><i class="bi bi-pencil"></i></button>
 </p>
 <p><strong>Segmento:</strong>
 <select class="form-select form-select-sm d-inline-block" style="width:auto;max-width:250px;" id="leadSegmento_${id}" onchange="updateLeadField('${id}','segmento',this.value)">
 ${segmentOptionsHtml(l.segmento)}
 </select>
 <button class="btn btn-sm btn-link p-0 ms-1" onclick="document.getElementById('leadSegmento_${id}').dispatchEvent(new Event('change'))" title="Guardar segmento"><i class="bi bi-check2" style="color:var(--htk-primary);"></i></button>
 </p>
 <p><strong>Teléfono:</strong> <input type="text" class="form-control form-control-sm d-inline-block" style="width:auto;max-width:200px;" id="leadTel_${id}" value="${escHtml(l.telefono||'')}" placeholder="+573001234567" onchange="updateLeadField('${id}','telefono',this.value)">
 <button class="btn btn-sm btn-link p-0 ms-1" onclick="document.getElementById('leadTel_${id}').dispatchEvent(new Event('change'))" title="Guardar teléfono"><i class="bi bi-check2" style="color:var(--htk-primary);"></i></button>
 </p>
 <p><strong>Email:</strong> <input type="email" class="form-control form-control-sm d-inline-block" style="width:auto;max-width:250px;" id="leadEmail_${id}" value="${escHtml(l.email||'')}" placeholder="correo@ejemplo.com" onchange="updateLeadField('${id}','email',this.value)">
 <button class="btn btn-sm btn-link p-0 ms-1" onclick="document.getElementById('leadEmail_${id}').dispatchEvent(new Event('change'))" title="Guardar email"><i class="bi bi-check2" style="color:var(--htk-primary);"></i></button>
 </p>
 <p><strong>Web:</strong> <input type="url" class="form-control form-control-sm d-inline-block" style="width:auto;max-width:300px;" id="leadWeb_${id}" value="${escHtml(l.url||'')}" placeholder="https://ejemplo.com" onchange="updateLeadField('${id}','url',this.value)">
 <button class="btn btn-sm btn-link p-0 ms-1" onclick="document.getElementById('leadWeb_${id}').dispatchEvent(new Event('change'))" title="Guardar web"><i class="bi bi-check2" style="color:var(--htk-primary);"></i></button>
 </p>
 <p><strong>Contacto Original:</strong> <span style="color:rgba(255,255,255,0.4);">${escHtml(l.contacto || '-')}</span></p>
 <p><strong>Línea de Interés:</strong> ${escHtml(l.linea_interes || '-')}</p>
 </div>
 <div class="col-md-6">
 <p><strong>Fuente:</strong> ${escHtml(l.fuente || '-')}</p>
 <p><strong>Valor Estimado:</strong> ${formatCurrency(l.valor_estimado)}</p>
 <p><strong>Fecha Creación:</strong> ${formatDate(l.fecha_creacion)}</p>
 <p><strong>Próximo Seguimiento:</strong> ${l.proximo_seguimiento ? formatDate(l.proximo_seguimiento) : 'No programado'}</p>
 </div>
 </div>`;
 // Sección 3: Timeline de Interacciones
 html += `<hr>
 <div class="d-flex justify-content-between align-items-center mb-3">
 <h6 style="color:var(--htk-primary);margin:0;"><i class="bi bi-chat-dots"></i> Interacciones</h6>
 <button class="btn btn-sm btn-htk" onclick="showAddInteraction('${id}')"><i class="bi bi-plus-lg"></i> Nueva</button>
 </div>
 <div id="leadInteractionsContainer" class="interactions-timeline">
 <div class="text-center py-4"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>
 </div>`;

 // Sección 4: Notas Editables In-Place
 html += `<hr>
 <div class="d-flex justify-content-between align-items-center mb-2">
 <h6 style="color:var(--htk-primary);margin:0;"><i class="bi bi-sticky"></i> Notas</h6>
 <button class="btn btn-sm btn-outline-htk" onclick="toggleEditNotes('lead','${id}')" id="editNotesBtn_${id}"><i class="bi bi-pencil"></i> Editar</button>
 </div>
 <div id="notesDisplay_${id}" class="notes-display">
 ${l.notas ? escHtml(l.notas) : '<em style="color:rgba(255,255,255,0.3);">Sin notas</em>'}
 </div>
 <div id="notesEdit_${id}" style="display:none;">
 <textarea class="form-control" id="notesTextarea_${id}" rows="3">${escHtml(l.notas||'')}</textarea>
 <div class="mt-2 d-flex gap-2">
 <button class="btn btn-sm btn-htk" onclick="saveNotes('lead','${id}')"><i class="bi bi-check"></i> Guardar</button>
 <button class="btn btn-sm btn-outline-secondary" onclick="cancelEditNotes('lead','${id}')">Cancelar</button>
 </div>
 </div>`;

 // Sección 5: Pitch Multichannel
 html += `<hr>
 <div id="pitchSection_${id}">
 <div class="d-flex justify-content-between align-items-center mb-2">
 <h6 style="color:var(--htk-primary);margin:0;"><i class="bi bi-megaphone"></i> Mensajes</h6>
 <button class="btn btn-sm btn-outline-htk" onclick="loadPitchTemplates('${id}')" id="loadPitchBtn_${id}"><i class="bi bi-arrow-repeat"></i> Cargar</button>
 </div>
 <div id="pitchContent_${id}">
 <em style="color:rgba(255,255,255,0.3);">Los mensajes se cargan automáticamente según el segmento del lead</em>
 </div>
 </div>`;

 setModal('Detalle: ' + (l.nombre || l.id), html, '<a href="/leads/'+id+'" class="btn btn-sm btn-htk"><i class="bi bi-box-arrow-up-right"></i> Ver perfil</a>');
 modalInstance.show();
 
 // Load interactions after modal is shown
 setTimeout(() => loadLeadInteractions(id), 200);
}

// Copy to Clipboard 
async function copyToClipboard(text, btnId) {
 try {
 await navigator.clipboard.writeText(text);
 const btn = document.getElementById(btnId);
 if (btn) {
 btn.classList.add('copied');
 const icon = btn.querySelector('i');
 if (icon) { const orig = icon.className; icon.className = 'bi bi-check-lg'; setTimeout(() => icon.className = orig, 1500); }
 setTimeout(() => btn.classList.remove('copied'), 1500);
 }
 showToast('Copiado al portapapeles');
 } catch(e) { showToast('Error al copiar', 'danger'); }
}

// Convert Lead 
async function convertLead(id) {
 if (!confirm('¿Convertir este lead en cliente?')) return;
 try {
 const res = await fetch(`/api/leads/${id}/convert`, { method:'POST' });
 if (!res.ok) throw new Error();
 flashSave();
 showToast('Lead convertido a cliente exitosamente');
 await loadLeads();
 await loadClients();
 updateNotifications();
 } catch(e) { showToast('Error al convertir lead', 'danger'); }
}

// Change Lead Stage 
async function changeLeadStage(id, direction) {
 const l = leads.find(x => x.id === id);
 if (!l) return;
 const stages = ['nuevo','contactado','cotizado','negociacion','ganado','perdido','cliente'];
 const idx = stages.indexOf(l.estado);
 if (idx === -1) return;
 const newIdx = direction === 'next' ? Math.min(idx + 1, stages.length - 1) : Math.max(idx - 1, 0);
 if (newIdx === idx) return;
 // Actualizar local y re-renderizar tabla
 l.estado = stages[newIdx];
 renderLeads();
 
 // Refrescar modal si está abierto
 try {
 const modalEl = document.getElementById('genericModal');
 if (modalEl && modalEl.classList.contains('show')) {
 showLeadDetail(id);
 }
 } catch(e) {}
 
 showToast('Lead avanzado a: ' + stages[newIdx]);
 try {
 await fetch(`/api/leads/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado: stages[newIdx]}) });
 } catch(e) { 
 // Revertir en caso de error
 l.estado = stages[idx];
 renderLeads();
 showToast('Error al cambiar etapa, revertido', 'danger'); 
 }
}

// INTERACCIONES 
async function loadInteractions() {
 showLoading('interactionsLoading','interactionsContent');
 interactions = await fetchJSON('/api/interactions');
 renderInteractions();
}

function renderInteractions() {
 document.getElementById('interactionsBody').innerHTML = interactions.slice().reverse().map(int => `
 <tr>
 <td><strong>${int.id}</strong></td>
 <td>${escHtml(int.lead_nombre || int.cliente?.nombre || '-')}</td>
 <td><span class="badge ${int.direccion==='recibido'?'bg-info':'bg-success'}">${escHtml(int.direccion||'-')}</span></td>
 <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(int.resumen||'')}">${escHtml(int.resumen||'-')}</td>
 <td><span class="badge bg-secondary">${escHtml(int.estado||'-')}</span></td>
 <td><small>${formatDateTime(int.fecha)}</small></td>
 <td>
 <button class="action-btn primary" onclick='showInteractionDetail(${JSON.stringify(int).replace(/'/g,"&#39;")})' title="Ver"><i class="bi bi-eye"></i></button>
 </td>
 </tr>
 `).join('');
 emptyState(null, 'interactionsEmpty', interactions.length);
 hideLoading('interactionsLoading','interactionsContent');
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
 {label:'Teléfono', key:'telefono', type:'text', placeholder:'+573001234567'},
 {label:'Fuente', key:'fuente', type:'select', options:['whatsapp','prospeccion','referido','web','otro']},
 {label:'Estado', key:'estado', type:'select', options:['lead','contacto','cliente','inactivo']},
 {label:'Segmento', key:'segmento', type:'segment'},
 {label:'Línea de Interés', key:'linea_interes', type:'select', options:['automatizacion','iot','mantenimiento','cargadores','varios']},
 {label:'Notas', key:'notas', type:'textarea'}
 ];
 } else if (type === 'workorder') {
 title = id ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo';
 if (id) item = workOrders.find(o => o.id === id);
 const clientOpts = clients.map(c => `<option value="${escHtml(c.nombre)}|${escHtml(c.telefono||'')}">${escHtml(c.nombre)} (${escHtml(c.telefono||'sin tel')})</option>`).join('');
 const clientSelect = id ? '' : `<div class="mb-3"><label class="form-label">Cliente existente (opcional)</label>
 <select class="form-select" id="f_existingClient" onchange="fillClientData()">
 <option value="">— Seleccionar existente —</option>
 ${clientOpts}
 </select></div>`;
 
 // Tipo selector
 const tiposOT = TIPOS_OT || {};
 const currentTipo = (item && item.tipo) ? item.tipo : 'reparacion';
 const tipoOptions = Object.entries(tiposOT).map(([k,v]) => 
 `<option value="${k}" ${k===currentTipo?'selected':''}>${v.icono||''} ${v.label}</option>`
 ).join('');
 
 let formHTML = clientSelect;
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
 const sel = document.getElementById('f_existingClient');
 if (!sel.value) return;
 const parts = sel.value.split('|');
 document.getElementById('f_cliente_nombre').value = parts[0];
 document.getElementById('f_cliente_telefono').value = parts[1] || '';
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
 telefono: document.getElementById('f_telefono')?.value,
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
 renderLeads();
 } else if (endpoint === 'clients') {
 const idx = clients.findIndex(x => x.id === id);
 if (idx > -1) { clients.splice(idx, 1); renderClients(); }
 } else if (endpoint === 'work_orders') {
 const idx = workOrders.findIndex(x => x.id === id);
 if (idx > -1) { workOrders.splice(idx, 1); renderWorkOrders(); }
 }
 
 flashSave();
 showToast(`${name||id} eliminado correctamente`);
 updateNotifications();
}

// 
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

// ─── Quick segment update from leads table ───
async function updateLeadSegmentQuick(id, segmento) {
 const l = leads.find(x => x.id === id);
 if (!l) return;
 try {
 await fetchJSON('/api/leads/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({segmento}) });
 l.segmento = segmento;
 showToast('✅ Segmento actualizado', 'success');
 } catch(e) {
 showToast('❌ Error: ' + e.message, 'danger');
 }
}

// ─── Update a single lead field via API ───
async function updateLeadField(id, field, value) {
 const l = leads.find(x => x.id === id);
 if (!l) return;
 
 try {
 const resp = await fetch('/api/leads/' + id, {
 method: 'PUT',
 headers: {'Content-Type': 'application/json'},
 body: JSON.stringify({[field]: value})
 });
 const updated = await resp.json();
 if (updated && !updated.error) {
 l[field] = value;
 showToast('✅ ' + field + ' actualizado', 'success');
 // Re-load pitches if segment changed
 if (field === 'segmento' && document.getElementById('pitchContent_' + id)) {
 loadPitchTemplates(id);
 }
 // Refrescar modal si está abierto
 try {
 const modalEl = document.getElementById('genericModal');
 if (modalEl && modalEl.classList.contains('show')) {
 showLeadDetail(id);
 }
 } catch(e) {}
 } else {
 showToast('❌ Error: ' + (updated.error || 'desconocido'), 'danger');
 }
 } catch (e) {
 showToast('❌ Error de red: ' + e.message, 'danger');
 }
}


// Main: load and show pitch templates for a lead
async function loadPitchTemplates(leadId) {
 const l = leads.find(x => x.id === leadId);
 if (!l) return;

 const container = document.getElementById(`pitchContent_${leadId}`);
 const btn = document.getElementById(`loadPitchBtn_${leadId}`);
 if (!container) return;

 container.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span> Cargando plantillas...</div>';
 if (btn) btn.disabled = true;

 try {
 const data = await fetchPitches();
 const templates = data.plantillas_cuerpo || [];
 const canales = data.canales || {};

 if (templates.length === 0) {
 container.innerHTML = '<em style="color:rgba(255,255,255,0.3);">No hay plantillas de mensajes disponibles</em>';
 if (btn) { btn.disabled = false; btn.style.display = ''; }
 return;
 }

 const scored = scoreTemplates(templates, l);
 const best = scored[0];
 const bestId = best && best.score > 0 ? best.id : templates[0].id;

 // Set default channel based on lead contact info
 const hasEmail = (l.contacto || '').includes('@');
 const defaultChannel = hasEmail ? 'email' : 'whatsapp';
 currentPitchChannel[leadId] = currentPitchChannel[leadId] || defaultChannel;
 currentPitchTemplate[leadId] = currentPitchTemplate[leadId] || bestId;

 renderPitchUI(leadId, l, scored, canales);
 if (btn) { btn.style.display = 'none'; }
 } catch (e) {
 console.error('Error loading pitches:', e);
 container.innerHTML = '<em style="color:#dc3545;">Error al cargar plantillas</em>';
 if (btn) { btn.disabled = false; btn.style.display = ''; }
 }
}

// Render the full multichannel pitch UI
function renderPitchUI(leadId, lead, templates, canales) {
 const container = document.getElementById(`pitchContent_${leadId}`);
 if (!container) return;

 const activeChannel = currentPitchChannel[leadId] || 'whatsapp';
 const activeTplId = currentPitchTemplate[leadId] || (templates[0]?.id || '');
 const activeTpl = templates.find(t => t.id === activeTplId) || templates[0];
 if (!activeTpl) return;

 const rawText = activeTpl[activeChannel] || '(Sin plantilla para este canal)';
 const personalized = personalizar(rawText, lead);

 // Detect auto-matched template vs others
 const isAuto = activeTpl.score >= 5;

 let html = '';

 // Channel selector buttons
 html += '<div class="channel-selector">';
 Object.entries(canales).forEach(([key, ch]) => {
 const active = key === activeChannel ? ' active ' + key : '';
 const icon = ch.icono || 'bi-chat';
 html += `<button class="channel-btn ${active}" onclick="switchPitchChannel('${leadId}','${key}')" title="${escHtml(ch.nombre)}">
 <i class="bi ${icon}"></i> ${escHtml(ch.nombre)}
 </button>`;
 });
 html += '</div>';

 // Template selector
 html += '<div class="d-flex align-items-center gap-2 mb-2">';
 html += '<small style="color:rgba(255,255,255,0.4);">Plantilla:</small>';
 html += '<select class="template-select flex-grow-1" onchange="switchPitchTemplate(\'' + leadId + '\',this.value)">';
 templates.forEach(t => {
 const sel = t.id === activeTplId ? ' selected' : '';
 const badge = t.score >= 5 ? ' ' : '';
 html += `<option value="${t.id}"${sel}>${badge}${escHtml(t.nombre)}</option>`;
 });
 html += '</select>';
 html += '</div>';

 // Preview
 html += `<div class="pitch-preview" id="pitchPreview_${leadId}">${escHtml(personalized)}</div>`;

 // Variable help (only show non-empty variables)
 const vars = activeTpl.variables || [];
 if (vars.length > 0) {
 html += '<div class="mt-2">';
 html += '<small style="color:rgba(255,255,255,0.3);">Variables: </small>';
 vars.forEach(v => {
 html += `<span class="pitch-var-tag" title="Se reemplaza con datos del lead">[${escHtml(v)}]</span>`;
 });
 html += '</div>';
 }

 // Detonante
 if (activeTpl.detonante) {
 html += `<div class="pitch-detonante mt-2"><strong> Detonante:</strong> ${escHtml(activeTpl.detonante)}</div>`;
 }

 // Action buttons
 const hasPhone = (lead.contacto || '').replace(/[^\d+]/g, '').length > 5;
 const hasEmail = (lead.contacto || '').includes('@');

 html += '<div class="pitch-actions">';
 if (activeChannel === 'whatsapp' && hasPhone) {
 html += `<button class="btn btn-sm btn-success" onclick="sendPitch('${leadId}','whatsapp')" title="Abrir chat de WhatsApp con el mensaje">
 <i class="bi bi-whatsapp"></i> Enviar por WhatsApp
 </button>`;
 }
 if (activeChannel === 'email' && hasEmail) {
 html += `<button class="btn btn-sm btn-info" onclick="sendPitch('${leadId}','email')" title="Abrir cliente de correo con el mensaje">
 <i class="bi bi-envelope-fill"></i> Enviar por Email
 </button>`;
 }
 html += `<button class="btn btn-sm btn-outline-htk" onclick="copyPitchText('${leadId}')" title="Copiar texto al portapapeles">
 <i class="bi bi-clipboard"></i> Copiar
 </button>`;
 html += `<button class="btn btn-sm btn-outline-secondary" onclick="editPitchTemplate('${leadId}')" title="Editar esta plantilla">
 <i class="bi bi-pencil"></i> Editar
 </button>`;
 html += '</div>';

 container.innerHTML = html;
}

// Switch active channel for a lead
async function switchPitchChannel(leadId, channel) {
 currentPitchChannel[leadId] = channel;
 const l = leads.find(x => x.id === leadId);
 if (!l) return;
 const data = await fetchPitches();
 const templates = data.plantillas_cuerpo || [];
 const canales = data.canales || {};
 renderPitchUI(leadId, l, scoreTemplates(templates, l), canales);
}

// Switch active template
async function switchPitchTemplate(leadId, templateId) {
 currentPitchTemplate[leadId] = templateId;
 const l = leads.find(x => x.id === leadId);
 if (!l) return;
 const data = await fetchPitches();
 const canales = data.canales || {};
 const templates = data.plantillas_cuerpo || [];
 renderPitchUI(leadId, l, scoreTemplates(templates, l), canales);
}

// Copy personalized text to clipboard
function copyPitchText(leadId) {
 const preview = document.getElementById(`pitchPreview_${leadId}`);
 if (!preview) return;
 const text = preview.textContent || preview.innerText;
 navigator.clipboard.writeText(text).then(() => {
 showToast(' Texto copiado al portapapeles');
 }).catch(() => {
 showToast('Error al copiar', 'danger');
 });
}

// Send pitch via WhatsApp or Email
async function sendPitch(leadId, channel) {
 const l = leads.find(x => x.id === leadId);
 if (!l) return;

 const preview = document.getElementById(`pitchPreview_${leadId}`);
 if (!preview) return;
 const text = preview.textContent || preview.innerText || '';

 if (channel === 'whatsapp') {
 let phone = (l.telefono || l.contacto || '').replace(/[^\d+]/g, '');
 if (phone && !phone.startsWith('+')) phone = '+57' + phone;
 if (phone === '+57' || !phone) {
 showToast('No se pudo extraer número de teléfono', 'danger');
 return;
 }
 const url = `https://wa.me/${phone.replace(/\+/g, '')}?text=${encodeURIComponent(text)}`;
 window.open(url, '_blank');
 } else if (channel === 'email') {
 const emailAddr = l.email || l.contacto || '';
 if (!emailAddr.includes('@')) {
 showToast('No se encontró dirección de email', 'danger');
 return;
 }
 const lines = text.split('\n');
 const subject = lines[0].startsWith('Asunto:') ? lines[0].replace('Asunto:', '').trim() : 'HTK INGENIERIA';
 const body = lines[0].startsWith('Asunto:') ? lines.slice(1).join('\n') : text;
 const mailto = `mailto:${emailAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 window.open(mailto, '_blank');
 }

 // Register interaction
 const interactionData = {
 tipo: channel === 'whatsapp' ? 'whatsapp' : 'email',
 direccion: 'saliente',
 resumen: channel === 'whatsapp' ? 'Mensaje WhatsApp enviado' : 'Email enviado',
 detalle: text.substring(0, 500),
 proximo_paso: 'Esperar respuesta del lead'
 };
 try {
 await fetch(`/api/leads/${leadId}/interactions`, {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(interactionData)
 });
 loadLeadInteractions(leadId);
 showToast(' Mensaje enviado e interacción registrada');
 } catch (e) {
 showToast(' Mensaje abierto pero no se registró interacción', 'danger');
 }
}

// Edit pitch template (modal)
async function editPitchTemplate(leadId) {
 const l = leads.find(x => x.id === leadId);
 if (!l) return;

 const data = await fetchPitches();
 const tplId = currentPitchTemplate[leadId] || '';
 const tpl = data.plantillas_cuerpo.find(t => t.id === tplId);
 if (!tpl) return;

 const channel = currentPitchChannel[leadId] || 'whatsapp';
 const rawText = tpl[channel] || '';
 const channelName = data.canales[channel]?.nombre || channel;

 const vars = (tpl.variables || []).map(v => `<span class="pitch-var-tag" onclick="insertVar('pitchEditTextarea_${leadId}','[${escHtml(v)}]')">[${escHtml(v)}]</span>`).join(' ');

 const html = `
 <div class="pitch-editor-modal">
 <div class="d-flex justify-content-between align-items-center mb-2">
 <span class="channel-badge ${channel === 'whatsapp' ? 'whatsapp' : 'email'}">
 <i class="bi ${data.canales[channel]?.icono || 'bi-chat'}"></i> ${escHtml(channelName)}
 </span>
 <strong>${escHtml(tpl.nombre)}</strong>
 </div>
 ${vars ? `<div class="mb-2">${vars}</div>` : ''}
 <textarea id="pitchEditTextarea_${leadId}" oninput="updatePitchCharCount('${leadId}')">${escHtml(rawText)}</textarea>
 <div class="d-flex justify-content-between align-items-center mt-1">
 <small style="color:rgba(255,255,255,0.3);">Variables: [Nombre] [Empresa] [Contacto] [Telefono] — Haz clic para insertar</small>
 <small id="pitchCharCount_${leadId}" style="color:rgba(255,255,255,0.4);">${rawText.length} caracteres</small>
 </div>
 </div>
 `;

 const footerHTML = `
 <button class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
 <button class="btn btn-sm btn-htk" onclick="savePitchTemplate('${leadId}')"><i class="bi bi-check"></i> Guardar Cambios</button>
 `;

 setModal(' Editar Plantilla: ' + escHtml(tpl.nombre), html, footerHTML);
 modalInstance.show();
}

function insertVar(textareaId, varName) {
 const ta = document.getElementById(textareaId);
 if (!ta) return;
 const start = ta.selectionStart;
 const end = ta.selectionEnd;
 ta.value = ta.value.substring(0, start) + varName + ta.value.substring(end);
 ta.focus();
 ta.selectionStart = ta.selectionEnd = start + varName.length;
 updatePitchCharCount(textareaId.replace('pitchEditTextarea_', ''));
}

function updatePitchCharCount(leadId) {
 const ta = document.getElementById(`pitchEditTextarea_${leadId}`);
 const counter = document.getElementById(`pitchCharCount_${leadId}`);
 if (ta && counter) counter.textContent = `${ta.value.length} caracteres`;
}

async function savePitchTemplate(leadId) {
 const ta = document.getElementById(`pitchEditTextarea_${leadId}`);
 if (!ta) return;

 const newText = ta.value;
 const tplId = currentPitchTemplate[leadId];
 const channel = currentPitchChannel[leadId];

 try {
 const res = await fetch('/api/pitches', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ id: tplId, canal: channel, texto: newText })
 });
 if (!res.ok) throw new Error('Save failed');

 // Invalidate cache
 pitchesData = null;

 flashSave();
 showToast(' Plantilla guardada');
 modalInstance.hide();

 // Reload pitch UI
 await loadPitchTemplates(leadId);
 } catch (e) {
 showToast('Error al guardar plantilla', 'danger');
 }
}


// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN: Plantillas OT
// ═══════════════════════════════════════════════════════════════

let woTemplates = [];
const templateEditorModal = new bootstrap.Modal(document.getElementById('templateEditorModal'));

// Placeholder definitions per tipo
const PLACEHOLDERS = {
  comun: [
    {key:'{id}', label:'ID Orden'},
    {key:'{cliente}', label:'Nombre Cliente'},
    {key:'{equipo}', label:'Equipo'},
    {key:'{estado}', label:'Estado Actual'},
    {key:'{presupuesto}', label:'Presupuesto'},
    {key:'{fecha}', label:'Fecha Actual'}
  ],
  reparacion: [
    {key:'{diagnostico}', label:'Diagnóstico'}
  ],
  fabricacion: [
    {key:'{tipo_producto}', label:'Tipo Producto'},
    {key:'{capacidad}', label:'Capacidad'},
    {key:'{fecha_estimada}', label:'Fecha Estimada'}
  ],
  instalacion: [
    {key:'{tipo_cargador}', label:'Tipo Cargador'},
    {key:'{potencia}', label:'Potencia'},
    {key:'{fecha_agendada}', label:'Fecha Agendada'},
    {key:'{tecnico_asignado}', label:'Técnico Asignado'}
  ]
};

function switchConfigTab(tab) {
  const validTabs = ['general','bot','templates','prices','segments','usuarios'];
  if (!validTabs.includes(tab)) tab = 'general';

  document.querySelectorAll('#configSubtabs .client-profile-tab').forEach(b => b.classList.remove('active'));
  const tabBtn = document.querySelector(`[data-config-tab="${tab}"]`);
  if (tabBtn) tabBtn.classList.add('active');

  document.querySelectorAll('.config-subtab').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });
  const tabDiv = document.getElementById('config-tab-' + tab);
  if (tabDiv) {
    tabDiv.style.display = 'block';
    tabDiv.classList.add('active');
  }

  if (tab === 'general') loadGeneralConfig();
  else if (tab === 'bot') loadBotConfig();
  else if (tab === 'templates') loadTemplates();
  else if (tab === 'prices') loadPricesTab();
  else if (tab === 'segments') loadSegmentsTab();
  else if (tab === 'usuarios') { /* placeholder */ }
}

window.switchConfigTab = switchConfigTab;

function initConfigSubtabs() {
  // Config subtabs use inline onclick — no extra handler needed
}

// ══════════════════════════════════════════════════
// CONFIGURACIÓN: Bot WhatsApp
// ══════════════════════════════════════════════════

const BOT_CONFIG_KEYS = [
  'horario_semana_inicio','horario_semana_fin','horario_sabado_inicio','horario_sabado_fin',
  'reset_timeout_ms','max_auto_mensajes','silenciar_lead_minutos','silenciar_pitch_dias',
  'auto_respuesta_activa','derivar_sin_respuesta','consulta_ot_activa',
  'mensaje_presentacion','mensaje_bienvenida','mensaje_fuera_horario','mensaje_derivar','mensaje_despedida',
  'crm_api_url'
];

const BOT_TOGGLE_KEYS = ['auto_respuesta_activa','derivar_sin_respuesta','consulta_ot_activa'];

async function loadBotConfig() {
  const loadingEl = document.getElementById('botCfgLoading');
  const formEl = document.getElementById('botCfgForm');
  if (!loadingEl || !formEl) return;
  loadingEl.style.display = 'block';
  formEl.style.display = 'none';
  try {
    const config = await fetchJSON('/api/bot/config?verbose=1');
    if (config.error) {
      loadingEl.innerHTML = '<div class="alert alert-warning">⚠️ ' + config.error + '. Por favor, inicia sesión.</div>';
      return;
    }
    // Fill form fields
    for (const key of BOT_CONFIG_KEYS) {
      const val = config[key];
      if (!val) continue;
      const el = document.getElementById('cfg_' + key);
      if (!el) continue;
      if (BOT_TOGGLE_KEYS.includes(key)) {
        el.checked = val.value === 'true';
      } else {
        el.value = val.value;
      }
    }
    // Initialize message previews
    document.querySelectorAll('.cfg-msg').forEach(ta => updateMsgPreview(ta));
    // Check bot status
    checkBotStatus();
    loadBotLog();
    loadingEl.style.display = 'none';
    formEl.style.display = 'block';
  } catch (e) {
    loadingEl.innerHTML =
      '<div class="alert alert-warning">⚠️ No se pudo cargar la configuración: ' + e.message + '</div>';
  }
}

function updateMsgPreview(el) {
  const previewId = el.id.replace('cfg_mensaje_', 'preview_');
  const preview = document.getElementById(previewId);
  if (preview) {
    preview.textContent = el.value.substring(0, 300) || '(vacío)';
  }
  updateWaPreview();
}

function updateWaPreview() {
  const wa = document.getElementById('waPreview');
  if (!wa) return;
  const msgs = document.querySelectorAll('.cfg-msg');
  let html = '';
  msgs.forEach(ta => {
    if (!ta.value.trim()) return;
    const label = ta.closest('.col-md-6')?.querySelector('.form-label')?.textContent || '';
    html += `<div style="margin-bottom:8px;"><small style="color:rgba(255,255,255,0.3);">${label}</small><div style="background:rgba(0,212,170,0.12);padding:8px 12px;border-radius:0 10px 10px 10px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(ta.value.substring(0,200))}</div></div>`;
  });
  wa.innerHTML = html || '<small class="text-muted">Escribe en los mensajes para ver el preview aquí...</small>';
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function guardarConfigBot() {
  const payload = {};
  let hasChanges = false;
  for (const key of BOT_CONFIG_KEYS) {
    const el = document.getElementById('cfg_' + key);
    if (!el) continue;
    let val;
    if (BOT_TOGGLE_KEYS.includes(key)) {
      val = el.checked ? 'true' : 'false';
    } else {
      val = el.value;
    }
    payload[key] = val;
    hasChanges = true;
  }
  if (!hasChanges) {
    showToast('No hay cambios para guardar', 'warning');
    return;
  }
  try {
    const resp = await fetch('/api/bot/config', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const result = await resp.json();
    if (result.ok) {
      document.getElementById('cfgSaveResult').innerHTML =
        '<div class="alert alert-success py-2">✅ Configuración guardada (' + result.updated + ' claves)</div>';
      showToast('Configuración guardada ✅', 'success');
      // Auto-recargar en el bot
      setTimeout(() => recargarConfigBot(), 500);
    } else {
      document.getElementById('cfgSaveResult').innerHTML =
        '<div class="alert alert-danger py-2">❌ ' + (result.error || 'Error desconocido') + '</div>';
    }
  } catch (e) {
    showToast('Error guardando: ' + e.message, 'danger');
  }
}

async function recargarConfigBot() {
  const resultDiv = document.getElementById('cfgSaveResult');
  resultDiv.innerHTML = '<div class="alert alert-info py-2">🔄 Recargando configuración en el bot...</div>';
  try {
    const resp = await fetch('/api/bot/config/reload', {method: 'POST'});
    const result = await resp.json();
    if (result.ok) {
      resultDiv.innerHTML = '<div class="alert alert-success py-2">✅ ' + result.message + '</div>';
      showToast(result.message, 'success');
    } else {
      resultDiv.innerHTML = '<div class="alert alert-warning py-2">⚠️ ' + (result.error || result.message || 'Error') + '</div>';
      showToast('Recarga falló: ' + (result.error || result.message), 'warning');
    }
  } catch (e) {
    resultDiv.innerHTML = '<div class="alert alert-danger py-2">❌ No se pudo contactar al bot: ' + e.message + '</div>';
    showToast('Bot no disponible', 'danger');
  }
}

async function checkBotStatus() {
  const badge = document.getElementById('cfgBotStatus');
  const headerBadge = document.getElementById('botStatusIndicator');
  const restartBtn = document.getElementById('cfgRestartBotBtn');
  const startBtn = document.getElementById('cfgStartBotBtn');
  const stopBtn = document.getElementById('cfgStopBotBtn');
  const qrBtn = document.getElementById('cfgQrBtn');
  const numberSpan = document.getElementById('cfgBotNumber');
  try {
    const resp = await fetch('/api/bot/status');
    const data = await resp.json();
    if (data.error || resp.status === 401) {
      setBotStatus('secondary', '🔒 Inicia sesión', '🔒 Inicia sesión');
      hideAll(restartBtn, startBtn, stopBtn, qrBtn);
      return;
    }
    
    // Show/hide buttons based on state
    if (data.ok && data.connected) {
      setBotStatus('success', '🟢 Conectado', '🟢 Bot conectado');
      hideAll(startBtn, qrBtn);
      showAll(restartBtn, stopBtn);
      if (numberSpan) numberSpan.textContent = data.botNumber || '—';
    } else if (data.ok && data.status === 'on') {
      setBotStatus('warning', '🟡 Sin WhatsApp', '🟡 Bot sin WhatsApp');
      hideAll(startBtn);
      showAll(restartBtn, stopBtn, qrBtn);
      if (numberSpan) numberSpan.textContent = '—';
    } else if (data.status === 'off') {
      setBotStatus('warning', '🟡 Apagado', '🟡 Bot apagado');
      hideAll(restartBtn, stopBtn, qrBtn);
      showAll(startBtn);
      if (numberSpan) numberSpan.textContent = '—';
    } else {
      setBotStatus('danger', '🔴 Offline', '🔴 Bot offline');
      hideAll(restartBtn, stopBtn, qrBtn);
      showAll(startBtn);
      if (numberSpan) numberSpan.textContent = '—';
    }
  } catch (e) {
    setBotStatus('danger', '🔴 Error', '🔴 Error');
    hideAll(restartBtn, stopBtn, qrBtn);
    showAll(startBtn);
    if (numberSpan) numberSpan.textContent = '—';
  }
}

function setBotStatus(cls, text, headerText) {
  const badge = document.getElementById('cfgBotStatus');
  const headerBadge = document.getElementById('botStatusIndicator');
  if (badge) { badge.className = 'badge bg-' + cls; badge.textContent = text; }
  if (headerBadge) { headerBadge.className = 'badge bg-' + cls; headerBadge.innerHTML = headerText; }
}

function hideAll(...els) { els.forEach(el => { if(el) el.style.display = 'none'; }); }
function showAll(...els) { els.forEach(el => { if(el) el.style.display = 'inline-block'; }); }

async function restartBot() {
  const btn = document.getElementById('cfgRestartBotBtn');
  const resultDiv = document.getElementById('cfgSaveResult');
  return _botAction(btn, resultDiv, '/api/bot/restart', 'Reiniciar Bot', 'Bot reiniciado ✅');
}

async function startBot() {
  const btn = document.getElementById('cfgStartBotBtn');
  const resultDiv = document.getElementById('cfgSaveResult');
  return _botAction(btn, resultDiv, '/api/bot/start', 'Iniciar Bot', 'Bot iniciado ✅');
}

async function stopBot() {
  const btn = document.getElementById('cfgStopBotBtn');
  const resultDiv = document.getElementById('cfgSaveResult');
  return _botAction(btn, resultDiv, '/api/bot/stop', 'Detener Bot', 'Bot detenido');
}

async function _botAction(btn, resultDiv, url, btnLabel, successMsg) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando...';
  }
  try {
    const resp = await fetch(url, { method: 'POST' });
    const data = await resp.json();
    if (data.ok) {
      if (resultDiv) resultDiv.innerHTML = '<div class="alert alert-success py-2">✅ ' + data.message + '</div>';
      showToast(successMsg, 'success');
      setTimeout(checkBotStatus, 3000);
      setTimeout(checkBotStatus, 8000);
    } else {
      if (resultDiv) resultDiv.innerHTML = '<div class="alert alert-danger py-2">❌ ' + (data.error||'Error') + '</div>';
      showToast('Error: ' + (data.error||'Error'), 'danger');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> ' + btnLabel;
    }
  }
}

async function showBotQR() {
  const display = document.getElementById('cfgQrDisplay');
  const img = document.getElementById('cfgQrImage');
  const link = document.getElementById('cfgQrLink');
  const qrBtn = document.getElementById('cfgQrBtn');
  const resultDiv = document.getElementById('cfgSaveResult');
  
  if (qrBtn) { qrBtn.disabled = true; qrBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Iniciando...'; }
  if (display) { display.style.display = 'block'; display.innerHTML = '<div class="text-center py-4"><span class="spinner-border"></span><p class="mt-2">Preparando QR...</p></div>'; }
  
  // Helper to load QR image
  async function loadQR() {
    try {
      const resp = await fetch('/api/bot/qr');
      if (resp.status === 202) {
        // Still generating, retry in 2s
        setTimeout(loadQR, 2000);
        return;
      }
      if (resp.headers.get('content-type')?.includes('image/png')) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        if (display) {
          display.innerHTML = `
            <div class="card d-inline-block p-3" style="background:white;">
              <img id="cfgQrImage" src="${url}" alt="QR Code" style="width:280px;height:280px;">
            </div>
            <div class="mt-2">
              <small class="text-muted">Escanea con WhatsApp → Dispositivos vinculados</small>
            </div>
            <button class="btn btn-sm btn-outline-secondary mt-2" onclick="document.getElementById('cfgQrDisplay').style.display='none'; stopQRPoll()">
              <i class="bi bi-x"></i> Cerrar QR
            </button>
            <div id="qrStatusMsg" class="mt-2 small text-muted">⏳ Esperando escaneo...</div>
          `;
        }
        // Start polling for auth status
        if (resultDiv) resultDiv.innerHTML = '';
        startQRPoll();
      } else {
        const data = await resp.json();
        if (data.qr_url) {
          if (display) {
            display.innerHTML = `
              <img src="${data.qr_url}" alt="QR" style="width:280px;height:280px;">
              <div class="mt-2"><small class="text-muted">Escanea con WhatsApp</small></div>
            `;
          }
          startQRPoll();
        } else {
          if (display) display.innerHTML = '<div class="alert alert-warning">⚠️ No se pudo generar QR: ' + (data.error||'error') + '</div>';
        }
      }
    } catch(e) {
      if (display) display.innerHTML = '<div class="alert alert-danger">Error: ' + e.message + '</div>';
    } finally {
      if (qrBtn) { qrBtn.disabled = false; qrBtn.innerHTML = '<i class="bi bi-qr-code"></i> Escanear QR'; }
    }
  }
  
  // Auth polling
  let _qrPollInterval = null;
  window._stopQRPoll = function() {
    if (_qrPollInterval) { clearInterval(_qrPollInterval); _qrPollInterval = null; }
  };
  
  function startQRPoll() {
    _qrPollInterval = setInterval(async () => {
      try {
        const resp = await fetch('/api/bot/qr-status');
        const data = await resp.json();
        const msgEl = document.getElementById('qrStatusMsg');
        
        if (data.status === 'authenticated') {
          if (msgEl) msgEl.innerHTML = '✅ ¡WhatsApp vinculado! Iniciando bot...';
          clearInterval(_qrPollInterval);
          // Start the bot
          const startResp = await fetch('/api/bot/start', {method:'POST'});
          const startData = await startResp.json();
          if (resultDiv) resultDiv.innerHTML = '<div class="alert alert-success py-2">✅ Bot conectado y funcionando</div>';
          if (display) setTimeout(() => { display.style.display = 'none'; }, 2000);
          setTimeout(checkBotStatus, 3000);
        } else if (data.status === 'failed' || data.status === 'timeout') {
          if (msgEl) msgEl.innerHTML = '⚠️ ' + (data.error||'QR expirado. Genera uno nuevo.') + ' <a href="#" onclick="showBotQR()">Reintentar</a>';
          clearInterval(_qrPollInterval);
        } else if (data.status === 'ready') {
          if (msgEl) msgEl.innerHTML = '⏳ QR activo. Escanea con tu celular...';
        }
      } catch(e) { /* ignore poll errors */ }
    }, 3000);
  }
  
  await loadQR();
}

async function loadBotLog() {
  const pre = document.getElementById('cfgBotLog');
  if (!pre) return;
  pre.textContent = '⏳ Cargando logs...';
  try {
    const resp = await fetch('/api/bot/log');
    const data = await resp.json();
    if (data.ok) {
      const lines = data.log.split('\n');
      // Keep last 100 lines for UI
      const last = lines.slice(-100).join('\n');
      pre.textContent = last || '(sin logs)';
    } else {
      pre.textContent = 'Error: ' + (data.error || 'No se pudo cargar');
    }
  } catch (e) {
    pre.textContent = 'Error: ' + e.message;
  }
  pre.scrollTop = pre.scrollHeight;
}

async function loadTemplates() {
  try {
    const tipo = document.getElementById('templateFilterType').value;
    const url = tipo ? `/api/wo-templates?tipo_ot=${tipo}` : '/api/wo-templates';
    const response = await fetchJSON(url);
    if (response.error) {
      woTemplates = [];
      showToast('⚠️ ' + response.error + ' - Por favor, inicia sesión.', 'warning');
      return;
    }
    woTemplates = response;
    renderTemplatesTable();
  } catch (e) {
    woTemplates = [];
    showToast('Error cargando plantillas: ' + e.message, 'danger');
  }
}

function renderTemplatesTable() {
  const tbody = document.getElementById('templatesTableBody');
  if (!woTemplates.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay plantillas. ¡Crea la primera!</td></tr>';
    return;
  }
  const tipoIcons = {reparacion:'🔧', fabricacion:'🏭', instalacion:'🚗', '*':'🌐'};
  tbody.innerHTML = woTemplates.map(t => {
    const preview = (t.mensaje || '').replace(/\n/g, ' ').substring(0, 80) + ((t.mensaje||'').length > 80 ? '...' : '');
    return `
    <tr>
      <td><span class="badge bg-secondary">${tipoIcons[t.tipo_ot]||'🌐'} ${t.tipo_ot==='*'?'Todos':t.tipo_ot}</span></td>
      <td><span class="badge ${ESTADOS_WO[t.estado_origen]?.class||'bg-secondary'}">${ESTADOS_WO[t.estado_origen]?.label||t.estado_origen}</span></td>
      <td>${escHtml(t.nombre||'')}</td>
      <td><small style="color:rgba(255,255,255,0.6);">${escHtml(preview)}</small></td>
      <td>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" ${t.activo?'checked':''} onchange="toggleTemplate(${t.id}, this.checked)">
        </div>
      </td>
      <td>
        <button class="action-btn primary" onclick="editTemplate(${t.id})" title="Editar"><i class="bi bi-pencil"></i></button>
        <button class="action-btn danger" onclick="deleteTemplate(${t.id})" title="Eliminar"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function toggleTemplate(id, active) {
  try {
    await fetch(`/api/wo-templates/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({activo: active})
    });
    showToast(active ? 'Plantilla activada' : 'Plantilla desactivada');
  } catch (e) {
    showToast('Error: ' + e.message, 'danger');
    loadTemplates();
  }
}

async function deleteTemplate(id) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  try {
    await fetch(`/api/wo-templates/${id}`, {method: 'DELETE'});
    showToast('Plantilla eliminada');
    loadTemplates();
  } catch (e) {
    showToast('Error: ' + e.message, 'danger');
  }
}

function showTemplateEditor(tmplData) {
  const isEdit = !!tmplData;
  document.getElementById('templateEditorTitle').textContent = isEdit ? 'Editar Plantilla' : 'Nueva Plantilla';
  document.getElementById('tmplEditId').value = isEdit ? tmplData.id : '';
  document.getElementById('tmplEditName').value = isEdit ? (tmplData.nombre||'') : '';
  document.getElementById('tmplEditTipo').value = isEdit ? (tmplData.tipo_ot||'*') : '*';
  document.getElementById('tmplEditAsunto').value = isEdit ? (tmplData.asunto||'') : '';
  document.getElementById('tmplEditMensaje').value = isEdit ? (tmplData.mensaje||'') : '';
  document.getElementById('tmplEditCanal').value = isEdit ? (tmplData.canal||'whatsapp') : 'whatsapp';
  document.getElementById('tmplEditActivo').checked = isEdit ? !!tmplData.activo : true;
  
  onTmplTipoChange();
  if (isEdit) {
    // Set estado after populating dropdown
    setTimeout(() => {
      document.getElementById('tmplEditEstado').value = tmplData.estado_origen || '';
    }, 50);
  }
  updateTemplatePreview();
  updatePlaceholderChips();
  templateEditorModal.show();
}

function onTmplTipoChange() {
  const tipo = document.getElementById('tmplEditTipo').value;
  const estados = getWOStatusOrder(tipo === '*' ? 'reparacion' : tipo);
  const sel = document.getElementById('tmplEditEstado');
  sel.innerHTML = estados.map(s => `<option value="${s}">${ESTADOS_WO[s]?.label||s}</option>`).join('');
  updatePlaceholderChips();
}

function updatePlaceholderChips() {
  const tipo = document.getElementById('tmplEditTipo').value;
  let chips = [...PLACEHOLDERS.comun];
  if (tipo !== '*' && PLACEHOLDERS[tipo]) {
    chips = chips.concat(PLACEHOLDERS[tipo]);
  } else if (tipo === '*') {
    // Include all type-specific placeholders for wildcard
    ['reparacion','fabricacion','instalacion'].forEach(t => {
      chips = chips.concat(PLACEHOLDERS[t] || []);
    });
  }
  
  document.getElementById('tmplPlaceholderChips').innerHTML = chips.map(p =>
    `<span class="badge" style="background:rgba(0,212,170,0.15);color:var(--htk-primary);cursor:pointer;font-size:0.8em;padding:4px 8px;border-radius:12px;" onclick="insertPlaceholder('${p.key}')" title="${p.label}">${p.key}</span>`
  ).join('');
}

function insertPlaceholder(key) {
  const textarea = document.getElementById('tmplEditMensaje');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + key + text.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + key.length, start + key.length);
  updateTemplatePreview();
}

function updateTemplatePreview() {
  const mensaje = document.getElementById('tmplEditMensaje').value;
  const preview = document.getElementById('tmplPreviewContent');
  
  // Replace placeholders with sample data for preview
  const samples = {
    '{id}': 'HTK-042',
    '{cliente}': 'Juan Pérez',
    '{equipo}': 'Elevador 5kVA Siemens',
    '{estado}': 'bobinado',
    '{presupuesto}': '450.000',
    '{fecha}': new Date().toLocaleDateString('es-CO'),
    '{diagnostico}': 'Falla en bobinado primario',
    '{tipo_producto}': 'Elevador',
    '{capacidad}': '5kVA',
    '{fecha_estimada}': '20/05/2026',
    '{tipo_cargador}': 'Nivel 2',
    '{potencia}': '7.4kW',
    '{fecha_agendada}': '20/05/2026',
    '{tecnico_asignado}': 'Pedro'
  };
  
  let previewText = mensaje || 'Escribe un mensaje para ver la vista previa...';
  Object.entries(samples).forEach(([k, v]) => {
    previewText = previewText.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v);
  });
  preview.textContent = previewText;
}

function editTemplate(id) {
  const tmpl = woTemplates.find(t => t.id === id);
  if (tmpl) showTemplateEditor(tmpl);
}

async function saveTemplate() {
  const id = document.getElementById('tmplEditId').value;
  const data = {
    nombre: document.getElementById('tmplEditName').value,
    tipo_ot: document.getElementById('tmplEditTipo').value,
    estado_origen: document.getElementById('tmplEditEstado').value,
    asunto: document.getElementById('tmplEditAsunto').value,
    mensaje: document.getElementById('tmplEditMensaje').value,
    canal: document.getElementById('tmplEditCanal').value,
    activo: document.getElementById('tmplEditActivo').checked
  };
  
  if (!data.nombre || !data.mensaje) {
    showToast('Nombre y mensaje son requeridos', 'danger');
    return;
  }
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/wo-templates/${id}` : '/api/wo-templates';
    await fetch(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    showToast(id ? 'Plantilla actualizada' : 'Plantilla creada');
    templateEditorModal.hide();
    loadTemplates();
  } catch (e) {
    showToast('Error: ' + e.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICAR CLIENTE
// ═══════════════════════════════════════════════════════════════

function showNotifyModal(woId) {
  const o = workOrders.find(x => x.id === woId);
  if (!o) return showToast('Orden no encontrada', 'danger');
  
  const phone = o.cliente?.telefono || '(sin teléfono)';
  let detailHTML = `
    <p><strong>Orden:</strong> ${o.id} — ${escHtml(o.cliente?.nombre||'Sin nombre')}</p>
    <p><strong>Teléfono:</strong> ${escHtml(phone)}</p>
    <p><strong>Estado actual:</strong> <span class="badge ${ESTADOS_WO[o.estado]?.class||'bg-secondary'}">${ESTADOS_WO[o.estado]?.label||o.estado}</span></p>
    <hr>
    <p class="text-muted">Se usará la plantilla configurada para <strong>${o.tipo} / ${o.estado}</strong>.</p>
    <p class="text-muted small">El mensaje se enviará vía WhatsApp al número del cliente.</p>
  `;
  
  setModal('📨 Notificar Cliente — ' + o.id, detailHTML,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
     <button class="btn btn-htk" onclick="sendNotification('${woId}')"><i class="bi bi-send"></i> Enviar notificación</button>`
  );
  modalInstance.show();
}

async function sendNotification(woId) {
  try {
    const btn = modalInstance._element.querySelector('.btn-htk');
    if (btn) btn.disabled = true;
    
    const resp = await fetch(`/api/work_orders/${woId}/notify`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({})
    });
    const result = await resp.json();
    
    if (result.ok) {
      showToast(`✅ Notificación enviada — ${result.plantilla || 'OK'}`, 'success');
      modalInstance.hide();
      // Refresh WO detail
      const updated = await fetchJSON(`/api/work_orders/${woId}`);
      const idx = workOrders.findIndex(o => o.id === woId);
      if (idx >= 0) workOrders[idx] = updated;
    } else {
      showToast(`❌ ${result.error || 'Error al enviar'}`, 'danger');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'danger');
  }
}

// ═══════════════════════════════════════════════════════════════
// PRICES TAB (placeholder)
// ═══════════════════════════════════════════════════════════════

async function loadSegmentsTab() {
  const container = document.getElementById('config-tab-segments');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-5"><span class="spinner-border spinner-border-sm"></span> Cargando segmentos...</div>';
  try {
    const segs = await loadSegments();
    if (!segs.length) {
      container.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-diagram-3" style="font-size:3em;"></i><p class="mt-3">No hay segmentos configurados.</p><button class="btn btn-htk btn-sm" onclick="showModal(\'lead\',null)"><i class="bi bi-plus-lg"></i> Crear un lead con segmento</button></div>';
      return;
    }
    let html = '<div class="table-container mt-3"><table class="table table-hover mb-0"><thead><tr><th>Key</th><th>Label</th><th>Prioridad</th><th>Color</th><th>Leads</th></tr></thead><tbody>';
    segs.forEach(s => {
      html += `<tr><td><code>${escHtml(s.key||'')}</code></td><td><strong>${escHtml(s.label||'')}</strong></td><td><span class="badge bg-${s.prioridad==='alta'?'danger':s.prioridad==='media'?'warning text-dark':'secondary'}">${s.prioridad||'-'}</span></td><td><span class="badge" style="background:${s.color||'#888'};color:#fff;">${escHtml(s.color||'')}</span></td><td>${s.leads_count||0}</td></tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div class="alert alert-warning">Error al cargar segmentos: ' + e.message + '</div>';
  }
}

async function loadGeneralConfig() {
  // Load system stats
  try {
    const stats = await fetchJSON('/api/stats');
    const statsEl = document.getElementById('cfgSystemStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <tr><td class="text-muted">Total Leads</td><td><strong>${stats.total_leads||0}</strong></td></tr>
        <tr><td class="text-muted">Clientes</td><td><strong>${stats.total_clients||0}</strong></td></tr>
        <tr><td class="text-muted">Órdenes activas</td><td><strong>${stats.active_work_orders||0}</strong></td></tr>
        <tr><td class="text-muted">Órdenes completadas</td><td><strong>${stats.completed_work_orders||0}</strong></td></tr>`;
    }
    // Update db info
    const dbEl = document.getElementById('dbInfoPath');
    if (dbEl && stats.db_size) {
      dbEl.textContent = stats.db_path + ' (' + stats.db_size + ')';
    }
  } catch(e) {
    console.warn('Could not load stats for general config:', e);
  }
  
  // Load last backup info
  try {
    const resp = await fetch('/api/auto/backup', {method:'POST'});
    const data = await resp.json();
    const el = document.getElementById('cfgLastBackup');
    if (el && data.output) {
      // Extract date from backup list if possible
      const lines = data.output.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        el.textContent = lines[lines.length-1].substring(0, 60);
      } else {
        el.textContent = 'No disponible';
      }
    } else if (el) {
      el.textContent = 'No disponible';
    }
  } catch(e) {
    const el = document.getElementById('cfgLastBackup');
    if (el) el.textContent = 'Error al cargar';
  }
  // Check bot status for the General tab too
  checkBotStatus();
}

async function loadPricesTab() {
  try {
    const prices = await fetchJSON('/api/prices');
    const container = document.getElementById('pricesTabContent');
    if (prices.error) {
      container.innerHTML = '<div class="alert alert-warning">⚠️ ' + prices.error + ' - Por favor, inicia sesión.</div>';
      return;
    }
    if (!prices.length) {
      container.innerHTML = '<div class="text-center text-muted py-4">No hay precios registrados.</div>';
      return;
    }
    container.innerHTML = `
      <div class="table-container mt-3">
        <table class="table table-hover mb-0">
          <thead><tr><th>Categoría</th><th>Producto</th><th>Capacidad</th><th>Base</th><th>Venta</th></tr></thead>
          <tbody>
            ${prices.map(p => `
              <tr>
                <td>${escHtml(p.categoria||'')}</td>
                <td>${escHtml(p.producto||'')}</td>
                <td>${escHtml(p.capacidad||'')}</td>
                <td>${formatCurrency(p.precio_base)}</td>
                <td>${formatCurrency(p.precio_venta)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    console.error('Error loading prices:', e);
    const container = document.getElementById('pricesTabContent');
    container.innerHTML = '<div class="alert alert-danger">Error al cargar precios: ' + e.message + '</div>';
  }
}

// INIT 
document.addEventListener('DOMContentLoaded', async function() {
 applyTheme();
 // Cargar tipos de OT desde el backend
 try {
 const tiposResp = await fetch('/api/work_orders/tipos');
 TIPOS_OT = await tiposResp.json();
 } catch(e) { console.warn('No se pudieron cargar tipos OT, usando defaults'); }
 await populateSegmentSelects();
 initConfigSubtabs();
 loadDashboard();
 loadClients();
 loadWorkOrders();
 loadLeads();
 // Load URL parameters for back navigation
 const params = new URLSearchParams(window.location.search);
 const tabParam = params.get('tab');
 if (tabParam) {
 const sidebarLink = document.querySelector(`.sidebar .nav-link[data-tab="${tabParam}"]`);
 const mobileLink = document.querySelector(`.mobile-nav-link[data-tab="${tabParam}"]`);
 if (sidebarLink || mobileLink) {
 document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
 document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
 if (sidebarLink) sidebarLink.classList.add('active');
 if (mobileLink) mobileLink.classList.add('active');
 document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
 document.getElementById('tab-' + tabParam).classList.add('active');
 if (tabParam === 'dashboard') loadDashboard();
 else if (tabParam === 'leads') loadLeads();
 else if (tabParam === 'clients') loadClients();
 else if (tabParam === 'workorders') loadWorkOrders();
 else if (tabParam === 'kanban') loadKanban();
 else if (tabParam === 'interactions') loadInteractions();
 else if (tabParam === 'config') { switchConfigTab('general'); }
 // Limpiar URL para evitar que el tab quede "linkeado" al recargar
 window.history.replaceState({}, '', '/');
 }
 }
 loadInteractions();
  // Iniciar verificación periódica del bot
  checkBotStatus();
  setInterval(checkBotStatus, 60000);
  // Iniciar actualización periódica de notificaciones
  setInterval(loadOTNotifBadges, 60000);
});

// Mobile Menu Toggle 
function toggleMobileMenu() {
 const menu = document.getElementById('mobileMenu');
 if (menu.style.display === 'block') {
 menu.style.display = 'none';
 } else {
 menu.style.display = 'block';
 }
}

// 
// THEME TOGGLE — Dark/Light mode with localStorage
// 

function getTheme() {
 return localStorage.getItem('htk-theme') || 'dark';
}

function applyTheme() {
 const theme = getTheme();
 document.documentElement.setAttribute('data-bs-theme', theme);
 updateThemeButton(theme);
}

function toggleTheme() {
 const current = getTheme();
 const next = current === 'dark' ? 'light' : 'dark';
 localStorage.setItem('htk-theme', next);
 document.documentElement.setAttribute('data-bs-theme', next);
 updateThemeButton(next);
}

function updateThemeButton(theme) {
 const btn = document.getElementById('themeToggleBtn');
 if (btn) {
 if (theme === 'light') {
 btn.innerHTML = '<i class="bi bi-sun-fill"></i>';
 btn.title = 'Cambiar a modo oscuro';
 } else {
 btn.innerHTML = '<i class="bi bi-moon-fill"></i>';
 btn.title = 'Cambiar a modo claro';
 }
 }
 // Update mobile theme icon
 const mobileIcon = document.getElementById('themeIconMobile');
 if (mobileIcon) {
 mobileIcon.className = theme === 'light' ? 'bi bi-sun-fill' : 'bi bi-moon-stars';
 }
}

// 
// LOGOUT (placeholder — auth will be added later)
// 

function handleLogout() {
 window.location.href = '/logout';
}

// ── INVENTARIO ──────────────────────────────────────────────────────
let inventarioData = [];

async function loadInventario() {
  const cat = document.getElementById('invCategoriaFilter')?.value || '';
  const search = document.getElementById('invSearch')?.value || '';
  const params = new URLSearchParams();
  if (cat) params.set('categoria', cat);
  if (search) params.set('search', search);
  
  try {
    const resp = await fetch('/api/inventario?' + params.toString());
    inventarioData = await resp.json();
    
    // Cargar categorias para el filtro
    const catResp = await fetch('/api/inventario/categorias');
    const categorias = await catResp.json();
    const catSelect = document.getElementById('invCategoriaFilter');
    const currentVal = catSelect.value;
    catSelect.innerHTML = '<option value="">Todas categorias</option>' + 
      categorias.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
    
    // Badge bajo stock
    const bajoStock = inventarioData.filter(i => i.cantidad < i.stock_minimo);
    const badge = document.getElementById('invBajoStockBadge');
    if (bajoStock.length > 0) {
      badge.style.display = 'inline-block';
      badge.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${bajoStock.length} item(s) bajo stock minimo`;
    } else {
      badge.style.display = 'none';
    }
    
    // Renderizar tabla
    const tbody = document.getElementById('invTableBody');
    if (inventarioData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4" style="color:rgba(255,255,255,0.3);"><i class="bi bi-inbox"></i><p class="mt-1">No hay items en inventario</p></td></tr>';
      return;
    }
    
    tbody.innerHTML = inventarioData.map(item => {
      const stockClass = item.cantidad < item.stock_minimo ? 'text-danger fw-bold' : 
                        (item.cantidad > item.stock_minimo * 2 ? 'text-success' : '');
      const stockIcon = item.cantidad < item.stock_minimo ? ' \u{1f534}' : 
                       (item.cantidad > item.stock_minimo * 2 ? ' \u{1f7e2}' : '');
      return `
      <tr>
        <td><code>${escHtml(item.codigo)}</code></td>
        <td>${escHtml(item.nombre)}</td>
        <td><span class="badge bg-secondary">${escHtml(item.categoria || '-')}</span></td>
        <td class="${stockClass}">${item.cantidad} ${escHtml(item.unidad)}${stockIcon}</td>
        <td>${item.stock_minimo} ${escHtml(item.unidad)}</td>
        <td>${escHtml(item.proveedor || '-')}</td>
        <td>${formatCurrency(item.costo_unitario)}</td>
        <td>${escHtml(item.ubicacion || '-')}</td>
        <td>
          <button class="action-btn primary" title="Entrada stock" onclick="showAjusteStockModal(${item.id}, 'entrada')"><i class="bi bi-plus-circle"></i></button>
          <button class="action-btn danger" title="Salida stock" onclick="showAjusteStockModal(${item.id}, 'salida')"><i class="bi bi-dash-circle"></i></button>
          <button class="action-btn primary" title="Editar" onclick="showInventarioModal(${item.id})"><i class="bi bi-pencil"></i></button>
          <button class="action-btn danger" title="Eliminar" onclick="deleteInventarioItem(${item.id})"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('loadInventario:', e);
    document.getElementById('invTableBody').innerHTML = '<tr><td colspan="9" class="text-center text-danger py-3">Error al cargar inventario</td></tr>';
  }
}

function showInventarioModal(itemId) {
  const item = itemId ? inventarioData.find(i => i.id === itemId) : null;
  const isEdit = !!item;
  
  document.getElementById('modalTitle').innerHTML = `<i class="bi bi-box-seam"></i> ${isEdit ? 'Editar' : 'Nuevo'} Item`;
  
  document.getElementById('modalBody').innerHTML = `
    <form id="invItemForm" onsubmit="saveInventarioItem(event, ${itemId || 0})">
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label">Codigo *</label>
          <input type="text" class="form-control" id="invCodigo" value="${escHtml(item?.codigo || '')}" required>
        </div>
        <div class="col-md-8">
          <label class="form-label">Nombre *</label>
          <input type="text" class="form-control" id="invNombre" value="${escHtml(item?.nombre || '')}" required>
        </div>
        <div class="col-md-4">
          <label class="form-label">Categoria</label>
          <input type="text" class="form-control" id="invCategoria" value="${escHtml(item?.categoria || '')}" list="invCatList">
          <datalist id="invCatList">
            ${[...new Set(inventarioData.map(i => i.categoria).filter(Boolean))].map(c => `<option value="${c}">`).join('')}
          </datalist>
        </div>
        <div class="col-md-3">
          <label class="form-label">Unidad</label>
          <input type="text" class="form-control" id="invUnidad" value="${escHtml(item?.unidad || 'unidad')}">
        </div>
        <div class="col-md-2">
          <label class="form-label">Stock inicial</label>
          <input type="number" class="form-control" id="invCantidad" value="${item?.cantidad || 0}" step="0.01">
        </div>
        <div class="col-md-3">
          <label class="form-label">Stock minimo</label>
          <input type="number" class="form-control" id="invStockMin" value="${item?.stock_minimo || 0}" step="0.01">
        </div>
        <div class="col-md-6">
          <label class="form-label">Proveedor</label>
          <input type="text" class="form-control" id="invProveedor" value="${escHtml(item?.proveedor || '')}">
        </div>
        <div class="col-md-3">
          <label class="form-label">Costo unitario</label>
          <input type="number" class="form-control" id="invCosto" value="${item?.costo_unitario || 0}" step="0.01">
        </div>
        <div class="col-md-3">
          <label class="form-label">Ubicacion</label>
          <input type="text" class="form-control" id="invUbicacion" value="${escHtml(item?.ubicacion || '')}">
        </div>
      </div>
    </form>
  `;
  
  document.getElementById('modalFooter').innerHTML = `
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button type="button" class="btn btn-htk" onclick="document.getElementById('invItemForm').requestSubmit()">${isEdit ? 'Guardar cambios' : 'Crear item'}</button>
  `;
  
  new bootstrap.Modal(document.getElementById('genericModal')).show();
}

async function saveInventarioItem(event, itemId) {
  event.preventDefault();
  const data = {
    codigo: document.getElementById('invCodigo').value.trim(),
    nombre: document.getElementById('invNombre').value.trim(),
    categoria: document.getElementById('invCategoria').value.trim(),
    unidad: document.getElementById('invUnidad').value.trim(),
    cantidad: parseFloat(document.getElementById('invCantidad').value) || 0,
    stock_minimo: parseFloat(document.getElementById('invStockMin').value) || 0,
    proveedor: document.getElementById('invProveedor').value.trim(),
    costo_unitario: parseFloat(document.getElementById('invCosto').value) || 0,
    ubicacion: document.getElementById('invUbicacion').value.trim()
  };
  
  try {
    const url = itemId ? `/api/inventario/${itemId}` : '/api/inventario';
    const method = itemId ? 'PUT' : 'POST';
    const resp = await fetch(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Error al guardar');
    }
    bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide();
    loadInventario();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function deleteInventarioItem(itemId) {
  const item = inventarioData.find(i => i.id === itemId);
  if (!confirm(`Eliminar "${item?.codigo} - ${item?.nombre}"?\nEsta accion no se puede deshacer.`)) return;
  try {
    const resp = await fetch(`/api/inventario/${itemId}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Error al eliminar');
    loadInventario();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function showAjusteStockModal(itemId, tipoPre) {
  const item = inventarioData.find(i => i.id === itemId);
  if (!item) return;
  
  document.getElementById('modalTitle').innerHTML = `<i class="bi bi-arrow-left-right"></i> Ajustar Stock: ${escHtml(item.codigo)}`;
  
  document.getElementById('modalBody').innerHTML = `
    <div class="alert alert-secondary">
      <strong>${escHtml(item.nombre)}</strong><br>
      Stock actual: <strong>${item.cantidad} ${escHtml(item.unidad)}</strong> | Stock minimo: ${item.stock_minimo} ${escHtml(item.unidad)}
    </div>
    <form id="invAjusteForm" onsubmit="ajustarStock(event, ${itemId})">
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label">Tipo *</label>
          <select class="form-select" id="ajusteTipo" required>
            <option value="entrada" ${tipoPre === 'entrada' ? 'selected' : ''}>&#x1f4e5; Entrada (+)</option>
            <option value="salida" ${tipoPre === 'salida' ? 'selected' : ''}>&#x1f4e4; Salida (-)</option>
            <option value="ajuste">&#x1f504; Ajuste</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Cantidad *</label>
          <input type="number" class="form-control" id="ajusteCantidad" required step="0.01" min="0.01" value="1">
          <small class="text-muted">${escHtml(item.unidad)}</small>
        </div>
        <div class="col-md-5">
          <label class="form-label">Motivo</label>
          <input type="text" class="form-control" id="ajusteMotivo" placeholder="Ej: Compra proveedor / OT HTK-042">
        </div>
      </div>
    </form>
  `;
  
  document.getElementById('modalFooter').innerHTML = `
    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button type="button" class="btn btn-htk" onclick="document.getElementById('invAjusteForm').requestSubmit()">Ajustar stock</button>
  `;
  
  new bootstrap.Modal(document.getElementById('genericModal')).show();
}

async function ajustarStock(event, itemId) {
  event.preventDefault();
  const data = {
    tipo: document.getElementById('ajusteTipo').value,
    cantidad: parseFloat(document.getElementById('ajusteCantidad').value),
    motivo: document.getElementById('ajusteMotivo').value.trim()
  };
  
  try {
    const resp = await fetch(`/api/inventario/${itemId}/ajustar`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Error al ajustar stock');
    }
    bootstrap.Modal.getInstance(document.getElementById('genericModal')).hide();
    loadInventario();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

