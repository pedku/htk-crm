// ============================================
// HTK CRM — Segments Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

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

// ============================================
// Config Panel — Segments CRUD
// ============================================

async function loadSegmentsList() {
  try {
    const data = await fetchJSON('/api/segments');
    window._segmentList = data || [];
    renderSegmentsTable();
  } catch(e) {
    const tb = document.getElementById('segmentTableBody');
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${e.message}</td></tr>`;
  }
}

function renderSegmentsTable() {
  const tbody = document.getElementById('segmentTableBody');
  if (!tbody) return;
  const segs = window._segmentList || [];
  if (!segs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-inbox"></i> No hay segmentos creados</td></tr>';
    return;
  }
  tbody.innerHTML = segs.map(s => `
    <tr>
      <td><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:${s.color||'#6f42c1'};border:2px solid rgba(255,255,255,0.2)"></span></td>
      <td>${escHtml(s.label||s.key)}</td>
      <td><code>${escHtml(s.key)}</code></td>
      <td>${s.orden||'-'}</td>
      <td>${s.activo ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
      <td>
        <button class="btn btn-sm btn-outline-htk me-1" onclick="showSegmentModal('${s.key}')" title="Editar"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteSegment('${s.key}')" title="Eliminar"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

async function showSegmentModal(key) {
  const segs = window._segmentList || [];
  const modal = new bootstrap.Modal(document.getElementById('segmentModal'));
  if (key) {
    const seg = segs.find(s => s.key === key);
    if (!seg) return;
    document.getElementById('segmentModalTitle').textContent = 'Editar Segmento';
    document.getElementById('seg_key').value = seg.key;
    document.getElementById('seg_key').disabled = true;
    document.getElementById('seg_label').value = seg.label || '';
    document.getElementById('seg_color').value = seg.color || '#6f42c1';
  } else {
    document.getElementById('segmentModalTitle').textContent = 'Nuevo Segmento';
    document.getElementById('seg_key').value = '';
    document.getElementById('seg_key').disabled = false;
    document.getElementById('seg_label').value = '';
    document.getElementById('seg_color').value = '#6f42c1';
  }
  modal.show();
}

async function saveSegment() {
  const key = document.getElementById('seg_key').value.trim().toLowerCase().replace(/\s+/g, '_');
  const label = document.getElementById('seg_label').value.trim();
  const color = document.getElementById('seg_color').value;
  if (!key) { showToast('La clave es requerida', 'danger'); return; }
  const segs = window._segmentList || [];
  const existing = segs.find(s => s.key === key);
  try {
    if (existing) {
      await fetch('/api/segments/' + key, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({label, color}) });
    } else {
      await fetch('/api/segments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key, label, color}) });
    }
    bootstrap.Modal.getInstance(document.getElementById('segmentModal')).hide();
    showToast(existing ? 'Segmento actualizado' : 'Segmento creado');
    _segmentsCache = null;
    await loadSegmentsList();
    await populateSegmentSelects();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function deleteSegment(key) {
  if (!confirm('¿Eliminar segmento "' + key + '"?')) return;
  try {
    await fetch('/api/segments/' + key, { method:'DELETE' });
    showToast('Segmento eliminado');
    _segmentsCache = null;
    await loadSegmentsList();
    await populateSegmentSelects();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}
