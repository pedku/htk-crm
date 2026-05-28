// Globals 
const API = window.location.origin;
let clients = [], workOrders = [], leads = [], interactions = [];
let modalInstance = null;
let currentKanbanView = 'kanban'; // 'kanban' or 'table'

// ─── Modal History (back button) ────────────────────
let modalHistory = [];
let lastWOId = null;

function setLastWO(id) { lastWOId = id; }

function backToWODetail() {
  if (lastWOId) {
    // Reload WO data first, then show modal
    loadWorkOrders().then(function() {
      showWODetail(lastWOId);
    });
  }
}

// ─── DataTables instances ────────────────────────────
let dtClients = null, dtWOs = null, dtLeads = null, dtInteractions = null, dtInv = null;

// ─── DataTables helper — safe init with fallback ─────
// core utilities in core.js
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

// getWOStatusOrder in core.js

// Save Flash 
// ── Segmentos dinámicos desde DB ─────────────
// segments module loaded from segments.js

// flashSave/showToast/showLoading/hideLoading/emptyState in core.js

// ── Tab Navigation ──────────────────────────────────────────────────
document.querySelectorAll('.sidebar .nav-link[data-tab]').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const tab = this.dataset.tab;
    window.location.hash = tab;
    navigateToTab(tab);
  });
});
document.querySelectorAll('.mobile-nav-link[data-tab]').forEach(link => {
 link.addEventListener('click', function(e) {
 e.preventDefault();
 const tab = this.dataset.tab;
 const sidebarCounterpart = document.querySelector(`.sidebar .nav-link[data-tab="${this.dataset.tab}"]`);
 if (sidebarCounterpart) sidebarCounterpart.classList.add('active');
 window.location.hash = tab;
 navigateToTab(tab);
 });
});

// Hash-based routing: restore tab on reload
function checkHash() {
  var hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) {
    navigateToTab(hash);
  }
}
window.addEventListener('hashchange', checkHash);
if (window.location.hash) { checkHash(); }

// Global Search Keyboard Shortcut 
document.addEventListener('keydown', function(e) {
 if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
 e.preventDefault();
 document.getElementById('globalSearch').focus();
 }
});

// Global Search 
// globalSearch/search/navigateToResult in search.js

function navigateToTab(tabName) {
 document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
 document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
 const target = document.querySelector(`.sidebar .nav-link[data-tab="${tabName}"]`);
 const mobileTarget = document.querySelector(`.mobile-nav-link[data-tab="${tabName}"]`);
 if (target) {
 target.classList.add('active');
 if (mobileTarget) mobileTarget.classList.add('active');
 document.querySelectorAll('.tab-content').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
 var tabEl = document.getElementById('tab-' + tabName);
 if (tabEl) { tabEl.style.display = 'block'; tabEl.classList.add('active'); }
 if (tabName === 'dashboard') loadDashboard();
 if (tabName === 'kanban') loadKanban();
 if (tabName === 'clients') loadClients();
 if (tabName === 'workorders') loadWorkOrders();
 if (tabName === 'leads') { _segmentsCache = null; populateSegmentSelects().then(() => loadLeads()); }
 if (tabName === 'interactions') loadInteractions();
 if (tabName === 'inventario') loadInventario();
 if (tabName === 'facturacion') loadFacturas();
 if (tabName === 'config') { switchConfigTab('general'); }
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
// updateNotifications/loadOTNotifBadges in notifications.js

// Data Loading 
// fetchJSON and getVal in core.js

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

// escapeHtml in core.js


// ─── PIPELINE FUNNEL (Dashboard) ───────────────────────
// escHtml/formatDate/formatCurrency/formatDateTime in core.js

// CLIENTES 
