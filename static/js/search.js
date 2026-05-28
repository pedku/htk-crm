// ============================================
// HTK CRM — Global Search Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

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
