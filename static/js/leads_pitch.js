// ============================================
// HTK CRM — LEADS PITCH DELIVERY Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

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
