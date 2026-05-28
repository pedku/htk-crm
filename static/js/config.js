// ============================================
// HTK CRM — CONFIGURACION Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

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
  const validTabs = ['general','bot','templates','prices','segments','company','usuarios'];
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
  else if (tab === 'company') loadCompanyConfig();
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
  'crm_api_url',
  'iva_default'
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
  const qrBtn = document.getElementById('cfgQrBtn');
  const resultDiv = document.getElementById('cfgSaveResult');
  
  if (qrBtn) { qrBtn.disabled = true; qrBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Iniciando...'; }
  if (display) { display.style.display = 'block'; display.innerHTML = '<div class="text-center py-4"><span class="spinner-border"></span><p class="mt-2">Reiniciando bot y generando QR...</p></div>'; }
  
  try {
    // Load QR image (endpoint stops bot, restarts it, waits for QR)
    const resp = await fetch('/api/bot/qr');
    
    if (resp.status === 202) {
      if (display) display.innerHTML = '<div class="alert alert-info py-3">⏳ QR generándose... <a href="#" onclick="showBotQR();return false">Reintentar</a></div>';
      if (qrBtn) { qrBtn.disabled = false; qrBtn.innerHTML = '<i class="bi bi-qr-code"></i> Escanear QR'; }
      return;
    }
    
    if (resp.headers.get('content-type')?.includes('image/png')) {
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (display) {
        display.innerHTML = `
          <div class="card d-inline-block p-3" style="background:white;">
            <img src="${url}" alt="QR Code" style="width:280px;height:280px;">
          </div>
          <div class="mt-2">
            <small class="text-muted">Escanea con WhatsApp → Dispositivos vinculados</small>
            <br><small class="text-muted" id="qrStatusMsg">⏳ Esperando escaneo...</small>
          </div>
          <button class="btn btn-sm btn-outline-secondary mt-2" onclick="document.getElementById('cfgQrDisplay').style.display='none';stopQRPoll()">
            <i class="bi bi-x"></i> Cerrar QR
          </button>
        `;
      }
      if (resultDiv) resultDiv.innerHTML = '<div class="alert alert-info py-2">📱 Escanea el QR con tu WhatsApp</div>';
      // Start polling bot status (bot is already running, will auto-connect when scanned)
      startQRPoll_connect();
    } else {
      const data = await resp.json();
      if (display) display.innerHTML = '<div class="alert alert-warning">⚠️ ' + (data.error||'Error generando QR') + '</div>';
    }
  } catch(e) {
    if (display) display.innerHTML = '<div class="alert alert-danger">Error: ' + e.message + '</div>';
  } finally {
    if (qrBtn) { qrBtn.disabled = false; qrBtn.innerHTML = '<i class="bi bi-qr-code"></i> Escanear QR'; }
  }
}

// Poll bot status until connected (when user scans QR)
let _qrPollId = null;
function startQRPoll_connect() {
  if (_qrPollId) clearInterval(_qrPollId);
  _qrPollId = setInterval(async () => {
    try {
      const resp = await fetch('/api/bot/status');
      const data = await resp.json();
      if (data.connected && data.botNumber) {
        clearInterval(_qrPollId);
        _qrPollId = null;
        const msgEl = document.getElementById('qrStatusMsg');
        if (msgEl) msgEl.innerHTML = '✅ ¡Conectado! ' + data.botNumber;
        const resultDiv = document.getElementById('cfgSaveResult');
        if (resultDiv) resultDiv.innerHTML = '<div class="alert alert-success py-2">✅ Bot conectado: ' + data.botNumber + '</div>';
        setTimeout(checkBotStatus, 2000);
        setTimeout(() => {
          const display = document.getElementById('cfgQrDisplay');
          if (display) display.style.display = 'none';
        }, 4000);
      }
    } catch(e) { /* ignore */ }
  }, 3000);
}

// Called by Close QR button
window.stopQRPoll = function() {
  if (_qrPollId) { clearInterval(_qrPollId); _qrPollId = null; }
};

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
  // Esta función es reemplazada por loadSegmentsList + loadPitchesList
  // que se renderizan dentro del HTML ya definido en config.html
  await Promise.all([loadSegmentsList(), loadPitchesList()]);
}

// pitches config CRUD in pitches.js

// pitches config CRUD in pitches.js

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

