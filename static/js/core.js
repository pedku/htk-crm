// ============================================
// HTK CRM — Core Utilities Module
// Extracted from crm.js (improve-codebase-architecture)
// Load order: core.js → segments.js → pitches.js → [domain modules] → crm.js
// ============================================

// ── DataTables ──────────────────────────────────────────
function dtAvailable() {
  return typeof window.$ !== 'undefined' && window.$.fn && window.$.fn.dataTable;
}

function initDT(tableId, data, columns, opts) {
  const $t = document.getElementById(tableId);
  if (!$t) return null;
  
  // Fallback: build HTML directly if DataTables not available
  if (!dtAvailable()) {
    const tbody = $t.querySelector('tbody');
    if (!tbody) return null;
    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="99" class="text-center py-4" style="color:rgba(255,255,255,0.3);">Sin datos</td></tr>';
      return null;
    }
    let html = '';
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      html += '<tr>';
      for (var j = 0; j < columns.length; j++) {
        var col = columns[j];
        var val = row[col.data];
        var rendered = col.render ? col.render((col.data ? row[col.data] : null), 'display', row) : (val != null ? escHtml(String(val)) : '');
        html += '<td>' + rendered + '</td>';
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
    return null;
  }
  
  const $j = $('#' + tableId);
  if ($.fn.dataTable.isDataTable('#' + tableId)) {
    $j.DataTable().destroy();
    $j.find('tbody').empty();
  }
  const dt = $j.DataTable(Object.assign({
    data: data,
    columns: columns,
    paging: true,
    pageLength: 25,
    lengthMenu: [[10,25,50,100,-1],[10,25,50,100,'Todos']],
    ordering: true,
    info: true,
    searching: true,
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json',
      emptyTable: 'Sin datos',
      zeroRecords: 'Sin resultados'
    },
    dom: '<"dt-toolbar d-flex justify-content-between align-items-center mb-2"<"dt-length"l><"dt-search"f>>rt<"dt-bottom d-flex justify-content-between align-items-center mt-2"<"dt-info"i><"dt-paginate"p>>',
    columnDefs: [{ orderable: false, targets: -1 }],
    initComplete: function() {
      var $f = $('#' + tableId + '_filter');
      if ($f.length) {
        $f.find('label').contents().filter(function(){ return this.nodeType===3; }).remove();
        $f.find('input').addClass('form-control form-control-sm').attr('placeholder','Buscar…').css({width:'220px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',color:'inherit',borderRadius:'8px',padding:'6px 12px'});
      }
    }
  }, opts || {}));
  return dt;
}

// ── Status Order ──────────────────────────────────────
function getWOStatusOrder(tipo) {
 if (tipo && TIPOS_OT[tipo] && TIPOS_OT[tipo].estados) {
 return TIPOS_OT[tipo].estados;
 }
 return WO_STATUS_ORDER_DEFAULT;
}

// ── Notifications ─────────────────────────────────────
function flashSave() {
 const el = document.getElementById('saveFlash');
 el.classList.add('show');
 setTimeout(() => el.classList.remove('show'), 1500);
}

function showToast(msg, type='success') {
 const t = document.getElementById('toastMsg');
 document.getElementById('toastBody').textContent = msg;
 t.querySelector('.toast-header i').className = type==='success' ? 'bi bi-check-circle-fill text-success me-2' : 'bi bi-exclamation-triangle-fill text-danger me-2';
 const bs = new bootstrap.Toast(t);
 bs.show();
}

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

// ── Data Loading ──────────────────────────────────────
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

// ── String Helpers ────────────────────────────────────
function escapeHtml(text) {
 const d = document.createElement('div');
 d.textContent = text;
 return d.innerHTML;
}

function escHtml(s) {
 if (!s) return '';
 return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Date & Currency Formatters ────────────────────────
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
