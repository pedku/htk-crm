#!/usr/bin/env bash
# restore.sh — Restaurar HTK INGENIERIA en máquina nueva
# Uso: ./restore.sh <archivo_backup.tar.gz>
# Ej:  ./restore.sh ~/htk-backups/htk-full-20260527_150000.tar.gz

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "⚡ Uso: $0 <backup.tar.gz>"
    echo "   Ej: $0 ~/htk-backups/htk-full-20260527_150000.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Archivo no encontrado: $BACKUP_FILE"
    exit 1
fi

echo "⚡ HTK RESTORE"
echo "━━━━━━━━━━━━━━━━━━━━"
echo "Backup: $BACKUP_FILE"
echo ""

# 0. Verificar requisitos
echo "[0/6] Verificando requisitos..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js no instalado"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "❌ npm no instalado"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ python3 no instalado"; exit 1; }
echo "  ✅ Node.js $(node -v), Python $(python3 --version | cut -d' ' -f2)"

# 1. Extraer backup
echo "[1/6] Extrayendo backup..."
tar xzf "$BACKUP_FILE" -C "$HOME"
echo "  ✅ Extraído en $HOME"

# 2. Instalar OpenClaw
echo "[2/6] Instalando OpenClaw..."
npm install -g openclaw 2>&1 | tail -1
echo "  ✅ OpenClaw instalado"

# 3. Reinstalar CodeGraph
echo "[3/6] Instalando CodeGraph..."
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
echo "  ✅ CodeGraph instalado"

# 4. Reindexar CodeGraph en el CRM
echo "[4/6] Reindexando CodeGraph..."
cd "$HOME/.openclaw/workspace/crm"
codegraph init --yes 2>&1 | tail -1
echo "  ✅ CodeGraph indexado"

# 5. Configurar servicios
echo "[5/6] Configurando servicios..."
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable --now htk-crm.service 2>&1 | tail -1 || echo "  ⚠️  Servicio htk-crm no encontrado, se crea manualmente"
echo "  ✅ Servicios configurados"

# 6. Iniciar OpenClaw
echo "[6/6] Iniciando OpenClaw Gateway..."
openclaw gateway start 2>&1 | tail -1 || echo "  ⚠️  Gateway ya corriendo o requiere config manual"

echo "━━━━━━━━━━━━━━━━━━━━"
echo "✅ Restauración completa"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Verifica que el CRM esté activo:"
echo "      curl http://localhost:5000"
echo ""
echo "   2. Tu token de GitHub está en el backup"
echo "      Si no funciona el push, regenera token en:"
echo "      https://github.com/settings/tokens"
echo ""
echo "   3. Para probar el bot de WhatsApp:"
echo "      cd ~/.openclaw/workspace && openclaw status"
echo ""
echo "⚡ ¡Bienvenido de vuelta, HTK!"
