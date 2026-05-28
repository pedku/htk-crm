// ============================================
// HTK CRM — Notifications Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

function updateNotifications() {
 const newLeads = leads.filter(l => l.estado === 'nuevo').length;
 loadOTNotifBadges();
 
 const topNotifs = document.getElementById('topNotifications');
 let notifHTML = '';
 if (newLeads > 0) {
 notifHTML += '<div class="badge bg-danger" style="font-size:0.75em;" title="' + newLeads + ' prospecto(s) nuevo(s) sin contactar"><i class="bi bi-person-plus"></i> ' + newLeads + ' nuevo(s)</div>';
 }
 const activeWO = workOrders.filter(o => o.estado !== 'cancelado' && o.estado !== 'entregado').length;
 if (activeWO > 0) {
 notifHTML += '<div class="badge bg-info" style="font-size:0.75em;" title="' + activeWO + ' ordenes activas en taller"><i class="bi bi-tools"></i> ' + activeWO + ' en taller</div>';
 }
 topNotifs.innerHTML = notifHTML;
}

async function loadOTNotifBadges() {
  try {
    const resp = await fetch('/api/work_orders/kanban');
    const data = await resp.json();
    const todas = Object.values(data.tarjetas || {}).flat();
    const totalActivas = todas.filter(
      t => !['entregado','cancelado','finalizado','facturado'].includes(t.estado)
    ).length;
    
    const badge = document.getElementById('kanbanNotif');
    if (badge) {
      if (totalActivas > 0) {
        badge.classList.remove('d-none');
        badge.textContent = totalActivas;
      } else {
        badge.classList.add('d-none');
      }
    }
  } catch(e) { /* silencioso */ }
}
