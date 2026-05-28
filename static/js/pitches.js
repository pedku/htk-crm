// ============================================
// HTK CRM — Pitches Module (Config Panel)
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

async function loadPitchesList() {
  try {
    const data = await fetchJSON('/api/pitches');
    window._pitchList = (data && data.plantillas_cuerpo) ? data.plantillas_cuerpo : [];
    renderPitchesTable();
  } catch(e) {
    const tb = document.getElementById('pitchTableBody');
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error: ${e.message}</td></tr>`;
  }
}

function renderPitchesTable() {
  const tbody = document.getElementById('pitchTableBody');
  if (!tbody) return;
  const pitchList = window._pitchList || [];
  if (!pitchList.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-inbox"></i> No hay plantillas. Crea la primera.</td></tr>';
    return;
  }
  tbody.innerHTML = pitchList.map(p => `
    <tr>
      <td><strong>${escHtml(p.titulo||'Sin título')}</strong></td>
      <td>${(p.segmentos||[]).map(s => `<span class="badge bg-secondary me-1">${escHtml(s)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
      <td>${p.whatsapp ? '<span class="text-success"><i class="bi bi-check-lg"></i> Sí</span>' : '<span class="text-muted">—</span>'}</td>
      <td>${p.email ? '<span class="text-success"><i class="bi bi-check-lg"></i> Sí</span>' : '<span class="text-muted">—</span>'}</td>
      <td>
        <button class="btn btn-sm btn-outline-htk" onclick="showPitchModal('${escHtml(p.id)}')" title="Editar"><i class="bi bi-pencil"></i></button>
      </td>
    </tr>
  `).join('');
}

async function showPitchModal(id) {
  const container = document.getElementById('pitch_segmentos_container');
  if (!container) return;
  const segs = window._segmentList || [];
  const pitchList = window._pitchList || [];
  const pitch = id ? pitchList.find(p => p.id === id) : null;
  
  document.getElementById('pitchModalTitle').textContent = id ? 'Editar Plantilla' : 'Nueva Plantilla';
  document.getElementById('pitchDeleteBtn').style.display = id ? 'block' : 'none';
  
  const selectedSegs = (pitch && pitch.segmentos) || [];
  container.innerHTML = (segs||[]).map(s => {
    const checked = selectedSegs.includes(s.key) ? 'checked' : '';
    return `<label class="btn btn-sm ${checked?'btn-htk':'btn-outline-secondary'}" style="cursor:pointer" onclick="this.classList.toggle('btn-htk');this.classList.toggle('btn-outline-secondary');">
      <input type="checkbox" value="${escHtml(s.key)}" ${checked} style="display:none"> ${escHtml(s.label||s.key)}
    </label>`;
  }).join('') || '<p class="text-muted">Crea segmentos primero</p>';
  
  document.getElementById('pitch_titulo').value = (pitch && pitch.titulo) || '';
  document.getElementById('pitch_whatsapp').value = (pitch && pitch.whatsapp) || '';
  document.getElementById('pitch_email').value = (pitch && pitch.email) || '';
  document.getElementById('pitch_asunto_email').value = (pitch && pitch.asunto_email) || '';
  container.dataset.pitchId = id || '';
  
  new bootstrap.Modal(document.getElementById('pitchModal')).show();
}

async function savePitch() {
  const container = document.getElementById('pitch_segmentos_container');
  const checkboxes = container.querySelectorAll('input[type=checkbox]:checked');
  const segmentos = Array.from(checkboxes).map(cb => cb.value);
  const data = {
    titulo: document.getElementById('pitch_titulo').value.trim(),
    segmentos,
    whatsapp: document.getElementById('pitch_whatsapp').value,
    email: document.getElementById('pitch_email').value,
    asunto_email: document.getElementById('pitch_asunto_email').value
  };
  const existingId = container.dataset.pitchId;
  try {
    if (existingId) {
      data.id = existingId;
      await fetch('/api/pitches', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      showToast('Plantilla actualizada');
    } else {
      data.id = 'pitch_' + Date.now();
      await fetch('/api/pitches', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      showToast('Plantilla creada');
    }
    bootstrap.Modal.getInstance(document.getElementById('pitchModal')).hide();
    await loadPitchesList();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function deletePitch() {
  const container = document.getElementById('pitch_segmentos_container');
  const id = container.dataset.pitchId;
  if (!id || !confirm('¿Eliminar esta plantilla?')) return;
  try {
    await fetch('/api/pitches', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
    bootstrap.Modal.getInstance(document.getElementById('pitchModal')).hide();
    showToast('Plantilla eliminada');
    await loadPitchesList();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}
