# AGENTS.md — HTK-Asistente

## Agent skills

Installed from [mattpocock/skills](https://github.com/mattpocock/skills).

| Skill | Path | Trigger |
|-------|------|---------|
| **grill-with-docs** | `~/.openclaw/skills/grill-with-docs/SKILL.md` | "grill this" before new features — challenges plans against the domain model in CONTEXT.md |
| **diagnose** | `~/.openclaw/skills/diagnose/SKILL.md` | "diagnose this bug" — disciplined debug loop for hard issues |
| **to-issues** | `~/.openclaw/skills/to-issues/SKILL.md` | "turn this into issues" — break plans into GitHub issues |
| **to-prd** | `~/.openclaw/skills/to-prd/SKILL.md` | "write a PRD" — turn conversation into a Product Requirements Doc |
| **triage** | `~/.openclaw/skills/triage/SKILL.md` | "triage these issues" — triage through state machine |
| **improve-codebase-architecture** | `~/.openclaw/skills/improve-codebase-architecture/SKILL.md` | "review architecture" — find deepening opportunities |
| **tdd** | `~/.openclaw/skills/tdd/SKILL.md` | "use tdd" — test-driven development loop |
| **prototype** | `~/.openclaw/skills/prototype/SKILL.md` | "prototype this" — throwaway prototype to explore |
| **zoom-out** | `~/.openclaw/skills/zoom-out/SKILL.md` | "zoom out" — broader context on unfamiliar code |
| **grill-me** | `~/.openclaw/skills/grill-me/SKILL.md` | "grill me" — quick alignment Q&A for non-code tasks |
| **caveman** | `~/.openclaw/skills/caveman/SKILL.md` | "explain like I'm 5" — ELI5 code explanation |
| **handoff** | `~/.openclaw/skills/handoff/SKILL.md` | "handoff to X" — structured context transfer between agents |
| **write-a-skill** | `~/.openclaw/skills/write-a-skill/SKILL.md` | "create a skill" — scaffold a new SKILL.md |

**Issue tracker:** GitHub (`pedku/htk-crm`)
**Domain docs:** `crm/CONTEXT.md` + `docs/adr/`

## Memory

- **Bajo demanda.** No cargo MEMORY.md ni memory/*.md al inicio. Solo los leo cuando la tarea lo requiere.
- **Daily notes:** `memory/YYYY-MM-DD.md` — raw logs
- **Long-term:** `MEMORY.md` — curated wisdom (solo en sesiones main)
- **Regla:** si quieres recordar algo, **escríbelo a un archivo**. No hay "mental notes".

## Red Lines

- No exfiltrar datos privados.
- No ejecutar comandos destructivos sin preguntar.
- `trash` > `rm` (recuperable beats perdido).
- Cuando dudes, pregunta.

## Related

- [Default AGENTS.md](/reference/AGENTS.default)
