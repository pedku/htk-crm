-- Migracion: tabla recordatorios_enviados (F2.1)
CREATE TABLE IF NOT EXISTS recordatorios_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id TEXT NOT NULL,
    fecha TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(factura_id, fecha)
);
