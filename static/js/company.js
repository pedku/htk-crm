// ============================================
// HTK CRM — CLIENT SEARCH + COMPANY CONFIG Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// ─── CLIENT SEARCH ──────────────────────────────────────────────────

var clientSearchTimer = null;

function searchClientsDebounce() {
  clearTimeout(clientSearchTimer);
  var q = document.getElementById('factClientSearch').value.trim();
  var dropdown = document.getElementById('factClientDropdown');
  if (q.length < 2) { dropdown.style.display = 'none'; return; }
  clientSearchTimer = setTimeout(function() { searchClients(q); }, 200);
}

async function searchClients(q) {
  var dropdown = document.getElementById('factClientDropdown');
  try {
    var resp = await fetch('/api/clients?search=' + encodeURIComponent(q));
    var results = await resp.json();
    if (!Array.isArray(results) || !results.length) {
      dropdown.innerHTML = '<div style="padding:8px 12px;color:rgba(255,255,255,0.4);font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.05);">Sin resultados</div>';
      dropdown.innerHTML += '<div class="client-search-item" onclick="crearClienteDesdeFactura()" style="padding:8px 12px;cursor:pointer;color:var(--htk-primary);font-weight:600;"><i class="bi bi-plus-circle"></i> Crear nuevo cliente</div>';
      dropdown.style.display = '';
      return;
    }
    var html = '';
    for (var i = 0; i < Math.min(results.length, 10); i++) {
      var c = results[i];
      var doc = c.documento ? (c.tipo_documento || 'CC') + ': ' + c.documento : '';
      html += '<div class="client-search-item" onclick="selectFactClient(\'' + c.id + '\', \'' + escHtml(c.nombre || '').replace(/'/g, "\\'") + '\')" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);">';
      html += '<div style="font-weight:600;">' + escHtml(c.nombre || c.id) + '</div>';
      html += '<div style="font-size:0.8rem;color:rgba(255,255,255,0.5);">' + escHtml(c.telefono || '') + (doc ? ' · ' + escHtml(doc) : '') + '</div>';
      html += '</div>';
    }
    dropdown.innerHTML = html;
    dropdown.style.display = '';
  } catch(e) {
    dropdown.innerHTML = '<div style="padding:8px 12px;color:rgba(255,255,255,0.4);">Error al buscar</div>';
    dropdown.style.display = '';
  }
}

function selectFactClient(id, name) {
  document.getElementById('factClientId').value = id;
  document.getElementById('factClientSearch').value = name;
  document.getElementById('factClientDropdown').style.display = 'none';
}

// Close dropdown on click outside
document.addEventListener('click', function(e) {
  var dropdown = document.getElementById('factClientDropdown');
  var search = document.getElementById('factClientSearch');
  if (dropdown && search && !search.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ─── COMPANY CONFIG ─────────────────────────────────────────────────

async function loadCompanyConfig() {
  document.getElementById('companyLoading').style.display = '';
  document.getElementById('companyForm').style.display = 'none';
  try {
    const data = await fetchJSON('/api/company');
    const fields = ['nombre','comercial','nit','direccion','telefono','email'];
    fields.forEach(f => {
      const el = document.getElementById('cfgCompany' + f.charAt(0).toUpperCase() + f.slice(1));
      if (el && data && data[f]) el.value = data[f];
    });
    document.getElementById('companyLoading').style.display = 'none';
    document.getElementById('companyForm').style.display = '';
  } catch(e) {
    document.getElementById('companyLoading').innerHTML = '<p class="text-danger">Error al cargar</p>';
  }
}

async function saveCompanyConfig() {
  const fields = ['nombre','comercial','nit','direccion','telefono','email'];
  const data = {};
  fields.forEach(f => {
    const el = document.getElementById('cfgCompany' + f.charAt(0).toUpperCase() + f.slice(1));
    if (el) data[f] = el.value.trim();
  });
  try {
    const resp = await fetch('/api/company', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error('Error al guardar');
    document.getElementById('cfgCompanyMsg').innerHTML = '<span style="color:#059669;">✅ Datos guardados</span>';
    setTimeout(() => { document.getElementById('cfgCompanyMsg').innerHTML = ''; }, 3000);
  } catch(e) {
    document.getElementById('cfgCompanyMsg').innerHTML = '<span style="color:#dc3545;">❌ ' + e.message + '</span>';
  }
}


function crearClienteDesdeFactura() {
  document.getElementById('factClientDropdown').style.display = 'none';
  document.getElementById('factClientSearch').value = '';
  // Close factura modal and open client creation modal
  if (modalInstance) modalInstance.hide();
  showModal('client');
  // Re-open factura after client is saved — handled by saveModal
}
