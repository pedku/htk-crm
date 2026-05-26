# Conversación — 2026-05-15

## Reestructuración CRM HTK

### Sesión nocturna (~6 horas)
Desde diagnóstico inicial hasta modularización completa + bug fixes + perfil OT.

### Temas cubiertos
1. Diagnóstico de CRMs: workspace (crm/), producción (htk-crm-web/), GitHub (htk-crm/)
2. Modularización del frontend: index.html → base.html + 9 pages/
3. Fix auth bypass por Cloudflare tunnel
4. Fix toastMsg faltante (crash JS al guardar)
5. Fix loadWorkOrders crash (fetchJSON devolvía objeto)
6. Nuevo wo_detail.html con acciones (WhatsApp, estado, pagos)
7. CRM_SPEC.md (597 líneas de especificación)

### Estado final
- Producción: crm.htk-ingenieria.com (main, 4b855ef)
- Desarrollo: dev.htk-ingenieria.com (modular-frontend, 6598fc0)
- GitHub: pedku/htk-crm/tree/modular-frontend
