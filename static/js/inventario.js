// ============================================
// HTK CRM — INVENTARIO Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

// ─── INVENTARIO ───────────────────────────────────────
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
    
    renderInvDT();
  } catch (e) {
    console.error('loadInventario:', e);
    document.getElementById('invTableBody').innerHTML = '<tr><td colspan="9" class="text-center text-danger py-3">Error al cargar inventario</td></tr>';
  }
}

function renderInvDT() {
  _ensureDTFilters();
  // Hide the manual empty-row element if DataTables will manage it
  const cols = [
    { data:'codigo', render: function(d) { return `<code>${escHtml(d)}</code>`; }},
    { data:'nombre', render: function(d) { return escHtml(d); }},
    { data:'categoria', render: function(d) { return `<span class="badge bg-secondary">${escHtml(d||'-')}</span>`; }},
    { data:null, render: function(d,t,r) {
      const cls = r.cantidad < r.stock_minimo ? 'text-danger fw-bold' : (r.cantidad > r.stock_minimo * 2 ? 'text-success' : '');
      const icon = r.cantidad < r.stock_minimo ? ' \u{1f534}' : (r.cantidad > r.stock_minimo * 2 ? ' \u{1f7e2}' : '');
      return `<span class="${cls}">${r.cantidad} ${escHtml(r.unidad)}${icon}</span>`;
    }},
    { data:null, render: function(d,t,r) { return `${r.stock_minimo} ${escHtml(r.unidad)}`; }},
    { data:'proveedor', render: function(d) { return escHtml(d||'-'); }},
    { data:'costo_unitario', render: function(d) { return formatCurrency(d); }},
    { data:'ubicacion', render: function(d) { return escHtml(d||'-'); }},
    { data:null, render: function(d,t,r) {
      return `<div class="d-flex gap-1">
 <button class="action-btn primary" title="Entrada" onclick="showAjusteStockModal(${r.id}, 'entrada')"><i class="bi bi-plus-circle"></i></button>
 <button class="action-btn danger" title="Salida" onclick="showAjusteStockModal(${r.id}, 'salida')"><i class="bi bi-dash-circle"></i></button>
 <button class="action-btn primary" title="Editar" onclick="showInventarioModal(${r.id})"><i class="bi bi-pencil"></i></button>
 <button class="action-btn danger" title="Eliminar" onclick="deleteInventarioItem(${r.id})"><i class="bi bi-trash"></i></button>
 </div>`;
    }}
  ];
  dtInv = initDT('tableInv', inventarioData, cols, {
    drawCallback: function() {
      // Update bajo stock badge after draw
      const visible = this.api().rows({filter:'applied'}).data().toArray();
      const bs = visible.filter(i => i.cantidad < i.stock_minimo);
      const badge = document.getElementById('invBajoStockBadge');
      if (badge) {
        if (bs.length > 0) {
          badge.style.display = 'inline-block';
          badge.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${bs.length} item(s) bajo stock`;
        } else {
          badge.style.display = 'none';
        }
      }
      const tbody = document.getElementById('invTableBody');
      if (tbody && !tbody.children.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4" style="color:rgba(255,255,255,0.3);"><i class="bi bi-inbox"></i><p class="mt-1">No hay items en inventario</p></td></tr>';
      }
    }
  });
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

// ═══════════════════════════════════════════════════════════════
// FACTURACIÓN
// ═══════════════════════════════════════════════════════════════

let facturas = [];
let dtFacturas = null;
let currentFactViewId = null;


