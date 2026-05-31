// ============================================
// HTK CRM — Dashboard Module
// Extracted from crm.js (improve-codebase-architecture)
// ============================================

async function loadPipeline() {
  const container = document.getElementById('pipelineFunnel');
  if (!container) return;
  try {
    const data = await fetchJSON('/api/pipeline');
    const funnel = data.funnel || [];
    let html = '<div class="d-flex align-items-end gap-2" style="height:150px;">';
    funnel.forEach(f => {
      const maxCount = Math.max(...funnel.map(x=>x.count), 1);
      const h = f.count > 0 ? Math.max(15, (f.count / maxCount) * 130) : 8;
      html += '<div class="flex-fill text-center" style="cursor:pointer;" onclick="loadLeadsTab();setLeadFilter(\'estado\',\'' + f.clave + '\')" title="' + f.nombre + ': ' + f.count + ' leads (' + f.pct + '%)"><div style="font-size:0.75em;font-weight:600;color:#fff;">' + f.count + '</div><div class="funnel-bar mx-auto" style="height:' + h + 'px;background:' + f.color + ';border-radius:6px 6px 0 0;width:80%;min-width:40px;"></div><div style="font-size:0.65em;color:rgba(255,255,255,0.5);margin-top:4px;">' + f.nombre + '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) {}
}

async function loadDashboard() {
 showLoading('dashboardLoading','dashboardContent');
 try {
 const stats = await fetchJSON('/api/stats');
 document.getElementById('statTotalLeads').textContent = stats.total_leads;
 document.getElementById('statClients').textContent = stats.total_clients;
 document.getElementById('statActiveWO').textContent = stats.active_work_orders;
 document.getElementById('statCompletedWO').textContent = stats.completed_work_orders;

 // WO by status
 const wc = document.getElementById('woByStatusChart');
 const statusMap = stats.wo_by_status || {};
 const allWOStatuses = [...new Set([...WO_STATUS_ORDER_DEFAULT, ...Object.values(TIPOS_OT).flatMap(t => t.estados||[])])];
 wc.innerHTML = allWOStatuses.map(s => {
 const count = statusMap[s] || 0;
 const pct = stats.total_work_orders > 0 ? (count / stats.total_work_orders * 100) : 0;
 if (count === 0) return '';
 return '<div class="mb-2"><div class="d-flex justify-content-between"><small>' + ESTADOS_WO[s].label + '</small><small>' + count + '</small></div><div class="progress" style="height:6px;"><div class="progress-bar progress-bar-htk" style="width:' + pct + '%"></div></div></div>';
 }).join('');

 // Leads by linea
 const lc = document.getElementById('leadsByLineaChart');
 const lineaMap = stats.leads_by_linea || {};
 const colorMap = { automatizacion:'#00d4aa', iot:'#0dcaf0', mantenimiento:'#ffc107', cargadores:'#dc3545', varios:'#6c757d' };
 lc.innerHTML = Object.entries(lineaMap).map(([linea, count]) => {
 const pct = stats.total_leads > 0 ? (count / stats.total_leads * 100) : 0;
 const color = colorMap[linea] || '#6c757d';
 return '<div class="mb-2"><div class="d-flex justify-content-between"><small>' + linea.charAt(0).toUpperCase() + linea.slice(1) + '</small><small>' + count + '</small></div><div class="progress" style="height:6px;"><div class="progress-bar" style="width:' + pct + '%;background:' + color + '"></div></div></div>';
 }).join('');

 // Recent WO
 const orders = await fetchJSON('/api/work_orders');
 workOrders = orders;
 const recent = orders.slice(-10).reverse();
 document.getElementById('recentWOBody').innerHTML = recent.map(o => {
 const es = ESTADOS_WO[o.estado] || {label:o.estado, class:'bg-secondary'};
 return '<tr><td><strong>' + o.id + '</strong></td><td>' + escHtml(o.cliente?.nombre || '-') + '</td><td>' + escHtml(o.equipo?.marca || '') + ' ' + escHtml(o.equipo?.modelo || '') + '</td><td><span class="badge ' + es.class + '">' + es.label + '</span></td><td>' + formatDate(o.fechas?.recibido) + '</td></tr>';
 }).join('');
 
 renderUpcomingFollowups();
 loadOTFinancialStats(orders);
 loadFacturasStats();
 cargarDashboardFinanciero();

 hideLoading('dashboardLoading','dashboardContent');
 } catch(e) { showToast('Error al cargar dashboard', 'danger'); hideLoading('dashboardLoading','dashboardContent'); }
}

function loadOTFinancialStats(orders) {
  const todas = orders || [];
  const activas = todas.filter(o => !['entregado','cancelado','finalizado','facturado'].includes(o.estado)).length;
  const totalPresupuestado = todas.reduce((s, o) => s + (o.presupuesto || 0), 0);
  const totalAbonado = todas.reduce((s, o) => s + (o.total_abonado || 0), 0);
  const totalPendiente = todas.reduce((s, o) => s + (o.saldo_pendiente || 0), 0);

  const elActivas = document.getElementById('statsOtActivas');
  const elPresupuestado = document.getElementById('statsPresupuestado');
  const elAbonado = document.getElementById('statsAbonado');
  const elPendiente = document.getElementById('statsPendiente');

  if (elActivas) elActivas.textContent = activas;
  if (elPresupuestado) elPresupuestado.textContent = '$' + totalPresupuestado.toLocaleString('es-CO');
  if (elAbonado) elAbonado.textContent = '$' + totalAbonado.toLocaleString('es-CO');
  if (elPendiente) elPendiente.textContent = '$' + totalPendiente.toLocaleString('es-CO');
}

async function loadFacturasStats() {
  try {
    const data = await fetchJSON('/api/facturas/stats');
    if (!data) return;
    document.getElementById('statFactPendientes').textContent = data.pendientes || 0;
    document.getElementById('statFactVencidas').textContent = data.vencidas || 0;
    document.getElementById('statFactTotalMes').textContent = '$' + (data.total_mes || 0).toLocaleString('es-CO');
  } catch(e) {}
}

async function renderUpcomingFollowups() {
  const el = document.getElementById('upcomingFollowups');
  if (!el) return;
  try {
    const data = await fetchJSON('/api/seguimientos/hoy');
    if (Array.isArray(data) && data.length) {
      el.innerHTML = data.map(s =>
        '<div class="d-flex align-items-center gap-2 py-1"><i class="bi bi-person"></i> ' +
        escHtml(s.nombre || '') + ' — <small class="text-muted">' + (s.nota || '') + '</small></div>'
      ).join('');
    } else {
      el.innerHTML = '<div class="text-muted py-2 text-center">Sin seguimientos pendientes ✅</div>';
    }
  } catch(e) { el.innerHTML = '<div class="text-muted py-2">Error cargando</div>'; }
}

async function cargarDashboardFinanciero() {
  try {
    const data = await fetchJSON('/api/finanzas/stats');
    if (!data) return;

    // Widgets numéricos
    const fmt = v => '$' + Math.round(v).toLocaleString('es-CO');
    const elIngresos = document.getElementById('finIngresosMes');
    const elVariacion = document.getElementById('finVariacion');
    const elPendiente = document.getElementById('finPendiente');

    if (elIngresos) elIngresos.textContent = fmt(data.ingresos_mes_actual);
    if (elPendiente) elPendiente.textContent = fmt(data.pendiente_cobro);

    if (elVariacion) {
      const pct = data.variacion_pct;
      const icon = pct >= 0 ? '▲' : '▼';
      elVariacion.innerHTML = '<i class="bi bi-arrow-' + (pct >= 0 ? 'up' : 'down') + '"></i> ' +
        Math.abs(pct).toFixed(1) + '% vs mes anterior';
      elVariacion.className = 'stat-trend ' + (pct >= 0 ? 'up' : 'down');
    }

    // Top clientes
    const elTop = document.getElementById('finTopClientes');
    if (elTop && data.top_clientes?.length) {
      elTop.innerHTML = data.top_clientes.map(c =>
        '<div class="d-flex justify-content-between py-1" style="border-bottom:1px solid rgba(255,255,255,0.04);">' +
        '<span>' + escHtml(c.nombre) + '</span><span style="color:var(--htk-primary);">' + fmt(c.total) + '</span></div>'
      ).join('');
    } else if (elTop) {
      elTop.innerHTML = '<span class="text-muted">Sin datos aún</span>';
    }

    // Gráfico de ingresos últimos 6 meses
    const canvas = document.getElementById('graficoIngresos');
    if (canvas && data.ultimos_6_meses?.length && typeof Chart !== 'undefined') {
      const ctx = canvas.getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.ultimos_6_meses.map(m => m.mes),
          datasets: [{
            label: 'Ingresos',
            data: data.ultimos_6_meses.map(m => m.total),
            backgroundColor: '#2563EB',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              ticks: { callback: v => fmt(v), color: '#94A3B8' },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            x: { ticks: { color: '#94A3B8' } }
          }
        }
      });
    }
  } catch(e) { console.error('Dashboard financiero:', e); }
}
