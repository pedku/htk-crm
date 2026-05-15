#!/bin/bash
cd "$(dirname "$0")"
# Cargar credenciales desde archivo seguro
set -a; source .crm_env; set +a
exec python3 app.py
