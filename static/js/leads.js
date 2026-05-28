// ============================================
// HTK CRM — LEADS Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// ─── LEADS ────────────────────────────────────────────
async function loadLeads() {
 showLoading('leadsLoading','leadsContent');
 try {
 const data = await fetchJSON('/api/leads');
 if (Array.isArray(data)) leads = data;
 } catch(e) {}
 renderLeadsDT();
 updateNotifications();
}

function getLeadActions(l) {
  const canConvert = l.estado !== 'cliente' && l.estado !== 'perdido';
  const stages = ['nuevo','contactado','cotizado','negociacion','ganado','perdido','cliente'];
  const stageIdx = stages.indexOf(l.estado || 'nuevo');
  let btns = '';
  btns += `<button class="action-btn primary" onclick="showLeadDetail('${l.id}')" title="Ver perfil"><i class="bi bi-eye"></i></button>`;
  let p = (l.telefono||l.contacto||'').replace(/[^\d+]/g,'');
  if(p&&!p.startsWith('+'))p='+57'+p.replace(/^57/,'');
  if(p&&p!=='+57') btns += `<button class="action-btn" style="color:#25D366;" onclick="window.open('https://wa.me/${p.replace(/\+/g,'')}','_blank')" title="WhatsApp"><i class="bi bi-whatsapp"></i></button>`;
  if(l.email&&l.email.includes('@')) btns += `<button class="action-btn" style="color:#0dcaf0;" onclick="window.open('mailto:${l.email}','_blank')" title="Email"><i class="bi bi-envelope"></i></button>`;
  btns += `<button class="action-btn" style="color:var(--htk-primary);" onclick="showModal('lead','${l.id}')" title="Editar"><i class="bi bi-pencil"></i></button>`;
  if(canConvert) btns += `<button class="action-btn" style="color:#ffc107;" onclick="convertLead('${l.id}')" title="Convertir"><i class="bi bi-person-plus"></i></button>`;
  btns += `<button class="action-btn danger" onclick="deleteItem('leads','${l.id}','${escHtml(l.nombre||'')}')" title="Eliminar"><i class="bi bi-trash"></i></button>`;
  if(stageIdx > 0 && l.estado !== 'cliente' && l.estado !== 'perdido') btns += `<button class="action-btn" onclick="changeLeadStage('${l.id}','prev')" title="Anterior"><i class="bi bi-chevron-left"></i></button>`;
  if(stageIdx < stages.length - 1 && l.estado !== 'cliente' && l.estado !== 'perdido') btns += `<button class="action-btn" onclick="changeLeadStage('${l.id}','next')" title="Siguiente"><i class="bi bi-chevron-right"></i></button>`;
  return `<div class="d-flex gap-1 flex-wrap" style="max-width:200px;">${btns}</div>`;
}

function filterLeadsDT() {
  _ensureDTFilters();
  if (dtLeads) dtLeads.draw();
}

function renderLeadsDT() {
  _ensureDTFilters();
  const cols = [
    { data:'id', render: function(d,t,r) { return `<strong>${d}${r.estado==='cliente'?' <span class="badge bg-success" style="font-size:0.6em;">✓ Cliente</span>':''}</strong>`; }},
    { data:'nombre', render: function(d,t,r) { return `<strong><a href="/leads/${r.id}" style="color:var(--htk-primary);text-decoration:none;">${escHtml(d||'-')}</a></strong>`; }},
    { data:'contacto', render: function(d) { return escHtml(d||'-'); }},
    { data:'segmento', render: function(d) { return escHtml(d||'-'); }},
    { data:'linea_interes', render: function(d) { return escHtml(d||'-'); }},
    { data:'estado', render: function(d) {
      const es = ESTADOS_LEAD[d] || {label:d||'nuevo', class:'bg-secondary'};
      return `<span class="badge ${es.class}">${es.label}</span>`;
    }},
    { data:'valor_estimado', render: function(d) { return formatCurrency(d); }},
    { data:'fecha_creacion', render: function(d) { return `<small>${formatDate(d)}</small>`; }},
    { data:null, render: function(d,t,r) { return getLeadActions(r); }}
  ];
  dtLeads = initDT('tableLeads', leads, cols, {
    drawCallback: function() {
      hideLoading('leadsLoading','leadsContent');
      emptyState(null, 'leadsEmpty', this.api().rows({filter:'applied'}).count());
    }
  });
  // Connect filter dropdowns to DataTables search
  $('#leadEstadoFilter, #leadServicioFilter, #leadSegmentFilter').off('change.dt').on('change.dt', filterLeadsDT);
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
 renderLeadsDT();
 
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
 renderLeadsDT();
 showToast('Error al cambiar etapa, revertido', 'danger'); 
 }
}

// INTERACCIONES 
