"""Yishao Agent — Activation Server
Deploy this folder on your public server. Clients call this to activate licenses.
The AES key lives ONLY here — never distributed to clients.

Run:
  python activation_server.py
"""
import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# ── Config ──────────────────────────────────────────────────────────
SERVER_PORT = int(os.environ.get("ACTIVATION_PORT", "18777"))
ADMIN_TOKEN = os.environ.get("ACTIVATION_ADMIN_TOKEN", "yishao-admin-2026")
MAX_DEVICES_PER_KEY = int(os.environ.get("ACTIVATION_MAX_DEVICES", "1"))

_AES_KEY = bytes([
    168, 156, 204, 203, 222, 99, 104, 23, 26, 157, 251, 242, 49, 64, 10, 177,
    63, 247, 203, 223, 109, 119, 149, 106, 9, 56, 103, 203, 102, 192, 3, 215,
])

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_DECODE_MAP = {c: i for i, c in enumerate(_ALPHABET)}
MAGIC = b"YS"
VERSION = 0x01
NONCE_LEN = 12
PLAINTEXT_LEN = 6
TAG_LEN = 16

# ── Database ─────────────────────────────────────────────────────────
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "data", "activation.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS license_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_key TEXT UNIQUE NOT NULL,
            serial_number INTEGER NOT NULL,
            product_id INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_revoked INTEGER DEFAULT 0,
            is_suspended INTEGER DEFAULT 0,
            expires_at TIMESTAMP
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS activations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            license_key TEXT NOT NULL,
            machine_id TEXT NOT NULL,
            activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_activations_unique
        ON activations(license_key, machine_id)
    """)

    # Migrate: add new columns if missing
    try:
        cols = [r[1] for r in db.execute("PRAGMA table_info(license_keys)").fetchall()]
        if "is_suspended" not in cols:
            db.execute("ALTER TABLE license_keys ADD COLUMN is_suspended INTEGER DEFAULT 0")
        if "expires_at" not in cols:
            db.execute("ALTER TABLE license_keys ADD COLUMN expires_at TIMESTAMP")
        if "notes" not in cols:
            db.execute("ALTER TABLE license_keys ADD COLUMN notes TEXT DEFAULT ''")
        if "phone" not in cols:
            db.execute("ALTER TABLE license_keys ADD COLUMN phone TEXT DEFAULT ''")
    except Exception:
        pass

    # site_config table for pricing & announcements
    db.execute("""
        CREATE TABLE IF NOT EXISTS site_config (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    """)
    # Seed default rows if missing
    for key in ("pricing_html", "announce_html", "announce_enabled"):
        db.execute(
            "INSERT OR IGNORE INTO site_config (key, value) VALUES (?, ?)",
            (key, "0" if key == "announce_enabled" else ""),
        )

    db.commit()
    db.close()


# ── Base32 helpers ───────────────────────────────────────────────────
def _base32_encode(data: bytes) -> str:
    result = []
    bits = 0
    bit_count = 0
    for byte in data:
        bits = (bits << 8) | byte
        bit_count += 8
        while bit_count >= 5:
            bit_count -= 5
            result.append(_ALPHABET[(bits >> bit_count) & 0x1F])
            bits &= (1 << bit_count) - 1
    if bit_count > 0:
        result.append(_ALPHABET[(bits << (5 - bit_count)) & 0x1F])
    return "".join(result)


def _base32_decode(s: str) -> bytes:
    s = s.upper().strip().replace("-", "").replace(" ", "")
    s = s.replace("O", "0").replace("I", "1").replace("L", "1")
    bits = 0
    bit_count = 0
    result = bytearray()
    for c in s:
        if c not in _DECODE_MAP:
            continue
        bits = (bits << 5) | _DECODE_MAP[c]
        bit_count += 5
        if bit_count >= 8:
            bit_count -= 8
            result.append((bits >> bit_count) & 0xFF)
            bits &= (1 << bit_count) - 1
    return bytes(result)


# ── Key generation (AES-GCM) ─────────────────────────────────────────
def generate_license_key(product_id: int = 1, serial_number: Optional[int] = None,
                         expires_at: Optional[str] = None) -> Tuple[str, int]:
    if serial_number is None:
        serial_number = secrets.randbelow(65536)

    plaintext = bytearray(PLAINTEXT_LEN)
    plaintext[0:2] = MAGIC
    plaintext[2] = VERSION
    plaintext[3] = max(1, min(255, product_id))
    plaintext[4] = (serial_number >> 8) & 0xFF
    plaintext[5] = serial_number & 0xFF

    nonce = secrets.token_bytes(NONCE_LEN)
    aesgcm = AESGCM(_AES_KEY)
    ciphertext = aesgcm.encrypt(nonce, bytes(plaintext), None)
    blob = nonce + ciphertext
    encoded = _base32_encode(blob)
    groups = [encoded[i:i + 5] for i in range(0, len(encoded), 5)]
    formatted = "YSAG-" + "-".join(groups)
    return formatted, serial_number


def _decrypt_key(key: str) -> Optional[dict]:
    raw = key.upper().strip()
    if raw.startswith("YSAG-"):
        raw = raw[5:]
    raw = raw.replace("-", "").replace(" ", "")
    if len(raw) < 54:
        return None
    try:
        blob = _base32_decode(raw)
    except Exception:
        return None
    if len(blob) < NONCE_LEN + PLAINTEXT_LEN + TAG_LEN:
        return None
    nonce = blob[:NONCE_LEN]
    ct_tag = blob[NONCE_LEN:]
    try:
        aesgcm = AESGCM(_AES_KEY)
        plaintext = aesgcm.decrypt(nonce, ct_tag, None)
    except Exception:
        return None
    if plaintext[0:2] != MAGIC or plaintext[2] != VERSION:
        return None
    product_id = plaintext[3]
    serial_number = (plaintext[4] << 8) | plaintext[5]
    return {"product_id": product_id, "serial_number": serial_number}


def _check_key_valid(db, key_row) -> Optional[str]:
    """Return error detail string if key is invalid, None if valid."""
    if key_row["is_revoked"]:
        return "该许可证已被吊销"
    if key_row["is_suspended"]:
        return "该许可证已被暂停"
    if key_row["expires_at"]:
        try:
            expires = datetime.strptime(key_row["expires_at"], "%Y-%m-%d %H:%M:%S")
            if datetime.now() > expires:
                return "该许可证已过期"
        except ValueError:
            pass
    return None


# ── Admin auth ───────────────────────────────────────────────────────
def _check_admin(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── FastAPI app ──────────────────────────────────────────────────────
app = FastAPI(title="Yishao Agent Activation Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "yishao-activation-server"}


# ── Admin: generate keys ─────────────────────────────────────────────
@app.post("/api/admin/generate-key")
def admin_generate_key(req: dict, request: Request):
    """Generate a new license key."""
    _check_admin(request)
    count = max(1, min(100, req.get("count", 1)))
    product_id = req.get("product_id", 1)
    expires_at = req.get("expires_at")  # format: "2026-12-31 23:59:59" or None

    keys = []
    db = get_db()
    try:
        for _ in range(count):
            key, sn = generate_license_key(product_id=product_id, expires_at=expires_at)
            db.execute(
                "INSERT INTO license_keys (license_key, serial_number, product_id, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (key, sn, product_id, expires_at),
            )
            keys.append({"serial_number": sn, "license_key": key, "product_id": product_id,
                         "expires_at": expires_at})
        db.commit()
    finally:
        db.close()

    return {"ok": True, "keys": keys}


@app.get("/api/admin/keys")
def admin_list_keys(request: Request):
    """List all generated keys and their status."""
    _check_admin(request)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT lk.*, a.machine_id, a.activated_at, a.last_checked_at "
            "FROM license_keys lk LEFT JOIN activations a ON lk.license_key = a.license_key "
            "ORDER BY lk.created_at DESC"
        ).fetchall()
        return {
            "keys": [
                {
                    "serial_number": r["serial_number"],
                    "license_key": r["license_key"],
                    "product_id": r["product_id"],
                    "is_revoked": r["is_revoked"],
                    "is_suspended": r["is_suspended"],
                    "expires_at": r["expires_at"],
                    "notes": r["notes"] or "",
                    "phone": r["phone"] or "",
                    "activated": r["machine_id"] is not None,
                    "machine_id": r["machine_id"][:16] + "..." if r["machine_id"] else None,
                    "activated_at": r["activated_at"],
                    "last_checked_at": r["last_checked_at"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.post("/api/admin/revoke")
def admin_revoke(req: dict, request: Request):
    """Revoke a license key permanently."""
    _check_admin(request)
    serial = req.get("serial_number")
    if serial is None:
        raise HTTPException(status_code=400, detail="serial_number required")
    db = get_db()
    try:
        db.execute("UPDATE license_keys SET is_revoked = 1 WHERE serial_number = ?", (serial,))
        db.execute(
            "DELETE FROM activations WHERE license_key IN "
            "(SELECT license_key FROM license_keys WHERE serial_number = ?)",
            (serial,),
        )
        db.commit()
        return {"ok": True, "serial_number": serial}
    finally:
        db.close()


@app.post("/api/admin/suspend")
def admin_suspend(req: dict, request: Request):
    """Suspend or resume a license key (reversible)."""
    _check_admin(request)
    serial = req.get("serial_number")
    suspend = req.get("suspend", True)  # True=suspend, False=resume
    if serial is None:
        raise HTTPException(status_code=400, detail="serial_number required")
    db = get_db()
    try:
        val = 1 if suspend else 0
        db.execute("UPDATE license_keys SET is_suspended = ? WHERE serial_number = ?",
                   (val, serial))
        if suspend:
            db.execute(
                "DELETE FROM activations WHERE license_key IN "
                "(SELECT license_key FROM license_keys WHERE serial_number = ?)",
                (serial,),
            )
        db.commit()
        action = "已暂停" if suspend else "已恢复"
        return {"ok": True, "serial_number": serial, "action": action}
    finally:
        db.close()


@app.post("/api/admin/set-expiry")
def admin_set_expiry(req: dict, request: Request):
    """Set or clear the expiration date of a license key."""
    _check_admin(request)
    serial = req.get("serial_number")
    expires_at = req.get("expires_at")  # "2026-12-31 23:59:59" or None to clear
    if serial is None:
        raise HTTPException(status_code=400, detail="serial_number required")
    db = get_db()
    try:
        db.execute("UPDATE license_keys SET expires_at = ? WHERE serial_number = ?",
                   (expires_at, serial))
        db.commit()
        return {"ok": True, "serial_number": serial, "expires_at": expires_at}
    finally:
        db.close()


@app.post("/api/admin/set-notes")
def admin_set_notes(req: dict, request: Request):
    """Set or clear the notes field of a license key."""
    _check_admin(request)
    serial = req.get("serial_number")
    notes = req.get("notes", "")
    if serial is None:
        raise HTTPException(status_code=400, detail="serial_number required")
    db = get_db()
    try:
        db.execute("UPDATE license_keys SET notes = ? WHERE serial_number = ?",
                   (notes, serial))
        db.commit()
        return {"ok": True, "serial_number": serial, "notes": notes}
    finally:
        db.close()


@app.post("/api/admin/set-phone")
def admin_set_phone(req: dict, request: Request):
    """Set or clear the phone field of a license key."""
    _check_admin(request)
    serial = req.get("serial_number")
    phone = req.get("phone", "")
    if serial is None:
        raise HTTPException(status_code=400, detail="serial_number required")
    db = get_db()
    try:
        db.execute("UPDATE license_keys SET phone = ? WHERE serial_number = ?",
                   (phone, serial))
        db.commit()
        return {"ok": True, "serial_number": serial, "phone": phone}
    finally:
        db.close()


# ── Site config: public ──────────────────────────────────────────────
@app.get("/api/site-config")
def get_site_config():
    """Public endpoint — no auth required."""
    db = get_db()
    try:
        rows = db.execute("SELECT key, value FROM site_config").fetchall()
        config = {r["key"]: r["value"] for r in rows}
        return {
            "pricing_html": config.get("pricing_html", ""),
            "announce_html": config.get("announce_html", ""),
            "announce_enabled": config.get("announce_enabled", "0"),
        }
    finally:
        db.close()


# ── Site config: admin ───────────────────────────────────────────────
@app.get("/api/admin/site-config")
def admin_get_site_config(request: Request):
    _check_admin(request)
    db = get_db()
    try:
        rows = db.execute("SELECT key, value FROM site_config").fetchall()
        config = {r["key"]: r["value"] for r in rows}
        return {
            "pricing_html": config.get("pricing_html", ""),
            "announce_html": config.get("announce_html", ""),
            "announce_enabled": config.get("announce_enabled", "0"),
        }
    finally:
        db.close()


@app.put("/api/admin/site-config")
def admin_update_site_config(req: dict, request: Request):
    _check_admin(request)
    db = get_db()
    try:
        for key in ("pricing_html", "announce_html", "announce_enabled"):
            if key in req:
                db.execute(
                    "INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)",
                    (key, str(req[key])),
                )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Client: activate ─────────────────────────────────────────────────
@app.post("/api/activate")
def client_activate(req: dict):
    """Activate a license key for a machine."""
    key = (req.get("key", "") or "").strip()
    machine_id = (req.get("machine_id", "") or "").strip()

    if not key:
        raise HTTPException(status_code=400, detail="请输入许可证密钥")
    if not machine_id:
        raise HTTPException(status_code=400, detail="无法获取机器标识")

    payload = _decrypt_key(key)
    if payload is None:
        raise HTTPException(status_code=400, detail="无效的许可证密钥")

    db = get_db()
    try:
        key_row = db.execute(
            "SELECT * FROM license_keys WHERE license_key = ?", (key,)
        ).fetchone()
        if key_row is None:
            raise HTTPException(status_code=400, detail="未注册的许可证密钥")

        err = _check_key_valid(db, key_row)
        if err:
            raise HTTPException(status_code=400, detail=err)

        existing = db.execute(
            "SELECT * FROM activations WHERE license_key = ?", (key,)
        ).fetchall()

        other_machines = [r for r in existing if r["machine_id"] != machine_id]
        if other_machines and MAX_DEVICES_PER_KEY > 0 and len(existing) >= MAX_DEVICES_PER_KEY:
            raise HTTPException(status_code=409, detail="该许可证已在其他设备上激活")

        db.execute(
            "INSERT OR REPLACE INTO activations (license_key, machine_id, activated_at, last_checked_at) "
            "VALUES (?, ?, datetime('now'), datetime('now'))",
            (key, machine_id),
        )
        db.commit()

        return {
            "ok": True,
            "activated": True,
            "product_id": payload["product_id"],
            "serial_number": payload["serial_number"],
        }
    finally:
        db.close()


# ── Client: check activation ─────────────────────────────────────────
@app.post("/api/check")
def client_check(req: dict):
    """Periodic check: is this key still valid for this machine?"""
    key = (req.get("key", "") or "").strip()
    machine_id = (req.get("machine_id", "") or "").strip()
    if not key or not machine_id:
        return {"activated": False}

    db = get_db()
    try:
        key_row = db.execute(
            "SELECT * FROM license_keys WHERE license_key = ?", (key,)
        ).fetchone()
        if key_row is None:
            return {"activated": False, "reason": "revoked_or_missing"}

        err = _check_key_valid(db, key_row)
        if err:
            return {"activated": False, "reason": err}

        act = db.execute(
            "SELECT * FROM activations WHERE license_key = ? AND machine_id = ?",
            (key, machine_id),
        ).fetchone()
        if act is None:
            return {"activated": False, "reason": "not_activated_on_this_machine"}

        db.execute(
            "UPDATE activations SET last_checked_at = datetime('now') "
            "WHERE license_key = ? AND machine_id = ?",
            (key, machine_id),
        )
        db.commit()

        return {
            "activated": True,
            "product_id": key_row["product_id"],
            "serial_number": key_row["serial_number"],
            "activated_at": act["activated_at"],
        }
    finally:
        db.close()


# ── Client: deactivate ───────────────────────────────────────────────
@app.post("/api/deactivate")
def client_deactivate(req: dict):
    """Deactivate this machine."""
    key = (req.get("key", "") or "").strip()
    machine_id = (req.get("machine_id", "") or "").strip()

    db = get_db()
    try:
        db.execute(
            "DELETE FROM activations WHERE license_key = ? AND machine_id = ?",
            (key, machine_id),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Admin panel (static) ─────────────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)


@app.get("/admin.html", include_in_schema=False)
def admin_page():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))


# ── Main ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    print(f"[activation-server] Starting on 0.0.0.0:{SERVER_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
