# Conversación 2026-05-27 — S2: Config, Skills & Google

## Temas tratados

### Scripts de backup
- Creados `scripts/backup.sh` y `scripts/restore.sh` para migración completa del sistema

### Repositorio personal del asistente
- Creado `pedku/htk-agent-config` (privado) en GitHub
- Contiene: SOUL.md, AGENTS.md, IDENTITY.md, USER.md, TOOLS.md, MEMORY.md (sanitizada)
- Contiene: 14 skills de mattpocock/skills, scripts backup/restore
- ⚠️ Sin datos de clientes, credenciales ni información confidencial

### CodeGraph
- Instalado v0.9.6 en el CRM
- 1.081 nodos, 894 edges en 4.8s
- Probado con `codegraph query` — búsqueda semántica de código

### Awesome OpenClaw Skills
- Descubierto repositorio con 5,400+ skills comunitarios
- Instalada skill **gog** (Google Workspace CLI) desde ClawHub
- gog v0.19.0 instalado y conectado a info@htk-ingenieria.com
- Gmail, Calendar, Drive operativos via token OAuth
- Creado wrapper `~/.local/bin/gog-wrapper` para refresh automático

### Places API (pendiente)
- Idea para enriquecer leads con datos de Google Maps (dirección, teléfono, reseñas)
- Pendiente activar en proyecto Google Cloud

## Estado final
- `pedku/htk-agent-config` → creado y pusheado
- `pedku/htk-crm` (crm subrepo) → main actualizado
- gog skill → instalado y funcional
- GitHub token → pendiente revocar
