# Conversación 2026-05-27 — Mega Update CRM

## Temas tratados

### Skills de mattpocock/skills
- Instalación y explicación de skills: to-issues, to-prd, diagnose, tdd, prototype, triage, improve-codebase-architecture, zoom-out, caveman, handoff, grill-with-docs
- Uso de `to-issues` para romper requerimientos en issues de GitHub

### Issues creados en GitHub (pedku/htk-crm)
- **#1** Modular Frontend (preexistente)
- **#2** Factura: vincular abonos de la OT
- **#3** Config: IVA por defecto desde settings
- **#4** OT: "Otro" en tipo producto/equipo → texto libre
- **#5** OT: editar y eliminar abonos
- **#6** OT: abonos dinámicos + barra en vivo + botón Pagado
- **#7** Factura: IVA incluído vs discriminado por item

### Implementación completa (issues #2-#7)
Se implementaron todos los issues usando sub-agentes en paralelo:
- **Sub A (WO):** #4, #5, #6 → wo_detail.html + api_wo.py
- **Sub B (IVA):** #3, #7 → api_invoices.py + config.html + factura templates + crm.js
- **Principal:** #2 → integración factura-abonos

### Bugs encontrados y corregidos
1. **Anular facturas no borraba** → faltaba `activo = 0`
2. **IVA incluído duplicaba valor** → subtotal usaba base imponible sin IVA
3. **415 Unsupported Media Type** → fetch POST sin Content-Type
4. **Abonos no aparecían en factura** → se agregaron al template PDF directo
5. **Pagar factura no restaba abonos legacy** → cálculo de saldo incluía legacy de OT
6. **Total a pagar no se veía** → se agregó "TOTAL A PAGAR" en template
7. **Segmentos en Config no cargaban** → faltaba estructura HTML del tab

### CodeGraph
- Instalado v0.9.6 en /home/peku/.openclaw/workspace/crm
- Index: 1,081 nodos, 894 edges en 4.8s
- Probado con `codegraph query` — funciona

### Token de GitHub
- Se usó token `ghp_M0...7MJL` (recomendar revocar)
- Push a `main` del subrepo crm y `master` del repo raíz

## Estado final
- GitHub issues: 7 issues creados, todos implementados
- Repos actualizados: `pedku/htk-crm` (main + master)
- CRM corriendo en dev.htk-ingenieria.com con auto-reload
