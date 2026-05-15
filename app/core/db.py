import sqlite3
from datetime import datetime, timezone, timedelta
from app import DB_PATH

COL_TZ = timezone(timedelta(hours=-5))

def now_iso():
    return datetime.now(COL_TZ).isoformat()

def now_col():
    return datetime.now(COL_TZ)

def get_db():
    """Get SQLite connection with row_factory for dict-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def next_id(prefix, table, id_column='id'):
    """Generate next ID like HTK-002, PRO-049 from SQLite."""
    conn = get_db()
    try:
        row = conn.execute(
            f"SELECT MAX(CAST(SUBSTR({id_column}, INSTR({id_column}, '-') + 1) AS INTEGER)) FROM {table}"
        ).fetchone()
        max_num = row[0] if row[0] is not None else 0
        return f"{prefix}-{max_num + 1:03d}"
    finally:
        conn.close()
