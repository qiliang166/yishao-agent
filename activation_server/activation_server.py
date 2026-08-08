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
import time
import uuid as _uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
QRCODE_DIR = os.path.join(DB_DIR, "data", "qrcodes")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(QRCODE_DIR, exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
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

    db.execute("""
        CREATE TABLE IF NOT EXISTS site_config (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    """)
    for key in ("pricing_html", "announce_html", "announce_enabled", "purchase_enabled",
                 "download_desktop_url", "download_server_url"):
        db.execute(
            "INSERT OR IGNORE INTO site_config (key, value) VALUES (?, ?)",
            (key, "0" if key in ("announce_enabled", "purchase_enabled") else ""),
        )

    # ── Sales system tables ──
    db.execute("""
        CREATE TABLE IF NOT EXISTS plan_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price_yuan REAL NOT NULL,
            duration_days INTEGER,
            features TEXT DEFAULT '[]',
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS payment_config (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    """)
    for key in ("wechat_qr", "alipay_qr"):
        db.execute(
            "INSERT OR IGNORE INTO payment_config (key, value) VALUES (?, ?)",
            (key, ""),
        )
    db.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT UNIQUE NOT NULL,
            phone TEXT DEFAULT '',
            plan_type_id INTEGER NOT NULL,
            amount_yuan REAL NOT NULL,
            status TEXT DEFAULT 'submitted',
            payment_ref TEXT DEFAULT '',
            license_key_sn INTEGER,
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    try:
        cols = [r[1] for r in db.execute("PRAGMA table_info(orders)").fetchall()]
        if "phone" not in cols:
            db.execute("ALTER TABLE orders ADD COLUMN phone TEXT DEFAULT ''")
    except Exception:
        pass

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
        except ValueError:
            try:
                expires = datetime.strptime(key_row["expires_at"], "%Y-%m-%d")
            except ValueError:
                expires = None
        if expires is not None and datetime.now() > expires:
            return "该许可证已过期"
    return None


# ── Admin auth ───────────────────────────────────────────────────────
def _check_admin(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Rate limiter ─────────────────────────────────────────────────────
_rate_store: dict = {}

def _check_rate(ip: str, limit: int = 3, window: int = 3600) -> bool:
    now = time.time()
    entry = _rate_store.get(ip)
    if entry is None or now - entry["window_start"] > window:
        _rate_store[ip] = {"window_start": now, "count": 1}
        return True
    if entry["count"] >= limit:
        return False
    entry["count"] += 1
    return True

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# ── Image validation ─────────────────────────────────────────────────
VALID_MAGIC = {
    b'\x89PNG\r\n\x1a\n': 'png',
    b'\xff\xd8\xff': 'jpg',
}
MAX_QR_SIZE = 2 * 1024 * 1024  # 2MB

def _validate_image(data: bytes) -> str:
    if len(data) > MAX_QR_SIZE:
        raise HTTPException(status_code=400, detail="图片大小不能超过2MB")
    for magic, ext in VALID_MAGIC.items():
        if data.startswith(magic):
            return ext
    raise HTTPException(status_code=400, detail="仅支持 PNG 和 JPEG 格式的收款码图片")


# ── FastAPI app ──────────────────────────────────────────────────────
app = FastAPI(title="Yishao Agent Activation Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "yishao-activation-server"}


# ══════════════════════════════════════════════════════════════════════
# Admin: generate keys
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/admin/generate-key")
def admin_generate_key(req: dict, request: Request):
    _check_admin(request)
    count = max(1, min(100, req.get("count", 1)))
    product_id = req.get("product_id", 1)
    expires_at = req.get("expires_at")

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
    _check_admin(request)
    serial = req.get("serial_number")
    suspend = req.get("suspend", True)
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
    _check_admin(request)
    serial = req.get("serial_number")
    expires_at = req.get("expires_at")
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


# ══════════════════════════════════════════════════════════════════════
# Site config
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/site-config")
def get_site_config():
    db = get_db()
    try:
        rows = db.execute("SELECT key, value FROM site_config").fetchall()
        config = {r["key"]: r["value"] for r in rows}
        return {
            "pricing_html": config.get("pricing_html", ""),
            "announce_html": config.get("announce_html", ""),
            "announce_enabled": config.get("announce_enabled", "0"),
            "purchase_enabled": config.get("purchase_enabled", "0"),
            "download_desktop_url": config.get("download_desktop_url", ""),
            "download_server_url": config.get("download_server_url", ""),
            "brand_name": config.get("brand_name", ""),
            "brand_logo": config.get("brand_logo", ""),
            "branding_slogan": config.get("branding_slogan", ""),
            "app_version": config.get("app_version", ""),
            "branding_copyright": config.get("branding_copyright", ""),
            "branding_signature": config.get("branding_signature", ""),
            "about_content": config.get("about_content", ""),
            "contact_info": config.get("contact_info", ""),
        }
    finally:
        db.close()


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
            "purchase_enabled": config.get("purchase_enabled", "0"),
            "download_desktop_url": config.get("download_desktop_url", ""),
            "download_server_url": config.get("download_server_url", ""),
            "brand_name": config.get("brand_name", ""),
            "brand_logo": config.get("brand_logo", ""),
            "branding_slogan": config.get("branding_slogan", ""),
            "app_version": config.get("app_version", ""),
            "branding_copyright": config.get("branding_copyright", ""),
            "branding_signature": config.get("branding_signature", ""),
            "about_content": config.get("about_content", ""),
            "contact_info": config.get("contact_info", ""),
        }
    finally:
        db.close()


@app.put("/api/admin/site-config")
def admin_update_site_config(req: dict, request: Request):
    _check_admin(request)
    db = get_db()
    try:
        for key in ("pricing_html", "announce_html", "announce_enabled", "purchase_enabled",
                     "download_desktop_url", "download_server_url",
                     "brand_name", "brand_logo", "branding_slogan", "app_version",
                     "branding_copyright", "branding_signature", "about_content", "contact_info"):
            if key in req:
                db.execute(
                    "INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)",
                    (key, str(req[key])),
                )
        db.commit()

        # Also sync download URLs to main backend settings table
        for _mb in ("/opt/yishao-agent/backend/data/yishao.db",
                     "/root/yishao-agent/backend/data/yishao.db"):
            if os.path.exists(_mb):
                try:
                    _mconn = sqlite3.connect(_mb)
                    try:
                        for _k in ("download_desktop_url", "download_server_url"):
                            if _k in req:
                                _mconn.execute(
                                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                                    (_k, str(req[_k])),
                                )
                        _mconn.commit()
                    finally:
                        _mconn.close()
                except Exception:
                    pass
                break

        return {"ok": True}
    finally:
        db.close()


# ══════════════════════════════════════════════════════════════════════
# Client: activate / check / deactivate
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/activate")
def client_activate(req: dict):
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
            "expires_at": key_row["expires_at"],
        }
    finally:
        db.close()


@app.post("/api/check")
def client_check(req: dict):
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
            "expires_at": key_row["expires_at"],
        }
    finally:
        db.close()


@app.post("/api/deactivate")
def client_deactivate(req: dict):
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


# ══════════════════════════════════════════════════════════════════════
# Sales System — Public APIs (no auth, rate-limited)
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/plans")
def public_list_plans():
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM plan_types WHERE is_active = 1 ORDER BY sort_order, id"
        ).fetchall()
        return {
            "plans": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "price_yuan": r["price_yuan"],
                    "duration_days": r["duration_days"],
                    "features": json.loads(r["features"] or "[]"),
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.post("/api/orders")
def public_create_order(req: dict, request: Request):
    ip = _client_ip(request)
    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="提交过于频繁，请稍后再试")

    import re
    phone = (req.get("phone", "") or "").strip()
    plan_type_id = req.get("plan_type_id")
    if not phone:
        raise HTTPException(status_code=400, detail="请输入手机号")
    if not re.match(r'^1[3-9]\d{9}$', phone):
        raise HTTPException(status_code=400, detail="请输入正确的手机号")
    if not plan_type_id:
        raise HTTPException(status_code=400, detail="请选择套餐")

    db = get_db()
    try:
        plan = db.execute("SELECT * FROM plan_types WHERE id = ? AND is_active = 1",
                          (plan_type_id,)).fetchone()
        if plan is None:
            raise HTTPException(status_code=400, detail="套餐不存在或已下架")

        order_no = str(_uuid.uuid4())
        amount = plan["price_yuan"]

        db.execute(
            "INSERT INTO orders (order_no, phone, plan_type_id, amount_yuan, status) "
            "VALUES (?, ?, ?, ?, 'submitted')",
            (order_no, phone, plan_type_id, amount),
        )
        db.commit()

        return {
            "ok": True,
            "order_no": order_no,
            "amount_yuan": amount,
            "plan_name": plan["name"],
        }
    finally:
        db.close()


@app.get("/api/orders/{order_no}")
def public_get_order(order_no: str):
    db = get_db()
    try:
        order = db.execute(
            "SELECT o.*, p.name as plan_name, p.duration_days "
            "FROM orders o LEFT JOIN plan_types p ON o.plan_type_id = p.id "
            "WHERE o.order_no = ?", (order_no,)
        ).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="订单不存在")

        result = {
            "order_no": order["order_no"],
            "phone": order["phone"],
            "plan_name": order["plan_name"],
            "amount_yuan": order["amount_yuan"],
            "status": order["status"],
            "payment_ref": order["payment_ref"],
            "created_at": order["created_at"],
            "updated_at": order["updated_at"],
        }

        if order["status"] == "completed" and order["license_key_sn"]:
            key_row = db.execute(
                "SELECT license_key FROM license_keys WHERE serial_number = ?",
                (order["license_key_sn"],)
            ).fetchone()
            if key_row:
                result["license_key"] = key_row["license_key"]

        return result
    finally:
        db.close()


@app.put("/api/orders/{order_no}/payment-ref")
def public_update_payment_ref(order_no: str, req: dict, request: Request):
    ip = _client_ip(request)
    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="提交过于频繁，请稍后再试")

    payment_ref = (req.get("payment_ref", "") or "").strip()
    if not payment_ref:
        raise HTTPException(status_code=400, detail="请输入付款参考号")

    db = get_db()
    try:
        order = db.execute("SELECT * FROM orders WHERE order_no = ?", (order_no,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="订单不存在")
        if order["status"] != "submitted":
            raise HTTPException(status_code=400, detail="订单状态不允许此操作")

        db.execute(
            "UPDATE orders SET payment_ref = ?, status = 'payment_pending', "
            "updated_at = datetime('now') WHERE order_no = ?",
            (payment_ref, order_no),
        )
        db.commit()
        return {"ok": True, "status": "payment_pending"}
    finally:
        db.close()


# ══════════════════════════════════════════════════════════════════════
# Sales System — QR code public access
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/qrcode/{filename}")
def public_qrcode(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="无效的文件名")
    filepath = os.path.join(QRCODE_DIR, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="收款码不存在")
    return FileResponse(filepath)


# ══════════════════════════════════════════════════════════════════════
# Sales System — Admin APIs
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/admin/plans")
def admin_list_plans(request: Request):
    _check_admin(request)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM plan_types ORDER BY sort_order, id"
        ).fetchall()
        return {
            "plans": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "price_yuan": r["price_yuan"],
                    "duration_days": r["duration_days"],
                    "features": json.loads(r["features"] or "[]"),
                    "is_active": r["is_active"],
                    "sort_order": r["sort_order"],
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.post("/api/admin/plans")
def admin_create_plan(req: dict, request: Request):
    _check_admin(request)
    name = (req.get("name", "") or "").strip()
    price_yuan = req.get("price_yuan", 0)
    duration_days = req.get("duration_days")
    features = req.get("features", [])
    sort_order = req.get("sort_order", 0)

    if not name or price_yuan <= 0:
        raise HTTPException(status_code=400, detail="套餐名称和价格不能为空")

    db = get_db()
    try:
        db.execute(
            "INSERT INTO plan_types (name, price_yuan, duration_days, features, sort_order) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, price_yuan, duration_days, json.dumps(features, ensure_ascii=False), sort_order),
        )
        db.commit()
        return {"ok": True, "id": db.execute("SELECT last_insert_rowid()").fetchone()[0]}
    finally:
        db.close()


@app.put("/api/admin/plans/{plan_id}")
def admin_update_plan(plan_id: int, req: dict, request: Request):
    _check_admin(request)
    db = get_db()
    try:
        plan = db.execute("SELECT * FROM plan_types WHERE id = ?", (plan_id,)).fetchone()
        if plan is None:
            raise HTTPException(status_code=404, detail="套餐不存在")

        updates = {}
        for field in ("name", "price_yuan", "duration_days", "is_active", "sort_order"):
            if field in req:
                updates[field] = req[field]
        if "features" in req:
            updates["features"] = json.dumps(req["features"], ensure_ascii=False)

        if updates:
            sets = ", ".join(f"{k} = ?" for k in updates)
            db.execute(
                f"UPDATE plan_types SET {sets} WHERE id = ?",
                list(updates.values()) + [plan_id],
            )
            db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/admin/plans/{plan_id}")
def admin_delete_plan(plan_id: int, request: Request):
    _check_admin(request)
    db = get_db()
    try:
        ref = db.execute(
            "SELECT COUNT(*) FROM orders WHERE plan_type_id = ?", (plan_id,)
        ).fetchone()
        if ref and ref[0] > 0:
            raise HTTPException(status_code=400, detail="该套餐已有订单，无法删除")
        db.execute("DELETE FROM plan_types WHERE id = ?", (plan_id,))
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    finally:
        db.close()


@app.get("/api/admin/payment-config")
def admin_get_payment_config(request: Request):
    _check_admin(request)
    db = get_db()
    try:
        rows = db.execute("SELECT key, value FROM payment_config").fetchall()
        config = {r["key"]: r["value"] for r in rows}
        return {
            "wechat_qr": config.get("wechat_qr", ""),
            "alipay_qr": config.get("alipay_qr", ""),
        }
    finally:
        db.close()


@app.put("/api/admin/payment-config")
async def admin_update_payment_config(request: Request):
    _check_admin(request)
    form = await request.form()
    updates = {}

    for key in ("wechat_qr", "alipay_qr"):
        file = form.get(key)
        if file is not None and hasattr(file, "filename") and file.filename:
            data = await file.read()
            ext = _validate_image(data)
            filename = f"{_uuid.uuid4().hex}.{ext}"
            filepath = os.path.join(QRCODE_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(data)
            updates[key] = filename

    if not updates:
        raise HTTPException(status_code=400, detail="请上传收款码图片")

    db = get_db()
    try:
        for key, value in updates.items():
            db.execute(
                "INSERT OR REPLACE INTO payment_config (key, value) VALUES (?, ?)",
                (key, value),
            )
        db.commit()
        return {"ok": True, **updates}
    finally:
        db.close()


@app.get("/api/admin/orders")
def admin_list_orders(status: str = "", request: Request = None):
    _check_admin(request)
    db = get_db()
    try:
        if status:
            rows = db.execute(
                "SELECT o.*, p.name as plan_name FROM orders o "
                "LEFT JOIN plan_types p ON o.plan_type_id = p.id "
                "WHERE o.status = ? ORDER BY o.created_at DESC",
                (status,)
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT o.*, p.name as plan_name FROM orders o "
                "LEFT JOIN plan_types p ON o.plan_type_id = p.id "
                "ORDER BY o.created_at DESC"
            ).fetchall()

        return {
            "orders": [
                {
                    "id": r["id"],
                    "order_no": r["order_no"],
                    "phone": r["phone"],
                    "plan_name": r["plan_name"],
                    "plan_type_id": r["plan_type_id"],
                    "amount_yuan": r["amount_yuan"],
                    "status": r["status"],
                    "payment_ref": r["payment_ref"],
                    "license_key_sn": r["license_key_sn"],
                    "notes": r["notes"] or "",
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                }
                for r in rows
            ]
        }
    finally:
        db.close()


@app.put("/api/admin/orders/{order_id}/verify")
def admin_verify_order(order_id: int, request: Request):
    _check_admin(request)
    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")

        order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            db.execute("ROLLBACK")
            raise HTTPException(status_code=404, detail="订单不存在")
        if order["status"] not in ("submitted", "payment_pending"):
            db.execute("ROLLBACK")
            raise HTTPException(status_code=400, detail="订单状态不允许审核")

        plan = db.execute("SELECT * FROM plan_types WHERE id = ?",
                          (order["plan_type_id"],)).fetchone()

        # Generate license key
        expires_at = None
        if plan and plan["duration_days"]:
            expires_at = (datetime.now() + timedelta(days=plan["duration_days"])).strftime(
                "%Y-%m-%d %H:%M:%S")

        key, sn = generate_license_key(expires_at=expires_at)
        db.execute(
            "INSERT INTO license_keys (license_key, serial_number, product_id, expires_at, phone) "
            "VALUES (?, ?, 1, ?, ?)",
            (key, sn, expires_at, order["phone"]),
        )

        db.execute(
            "UPDATE orders SET status = 'completed', license_key_sn = ?, "
            "updated_at = datetime('now') WHERE id = ?",
            (sn, order_id),
        )
        db.commit()

        return {
            "ok": True,
            "status": "completed",
            "serial_number": sn,
            "license_key": key,
            "expires_at": expires_at,
        }
    except HTTPException:
        raise
    except Exception as e:
        try:
            db.execute("ROLLBACK")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/api/admin/orders/{order_id}/reject")
def admin_reject_order(order_id: int, req: dict, request: Request):
    _check_admin(request)
    notes = (req.get("notes", "") or "").strip()

    db = get_db()
    try:
        order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="订单不存在")
        if order["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="订单状态不允许驳回")

        db.execute(
            "UPDATE orders SET status = 'cancelled', notes = ?, "
            "updated_at = datetime('now') WHERE id = ?",
            (notes or "管理员驳回", order_id),
        )
        db.commit()
        return {"ok": True, "status": "cancelled"}
    finally:
        db.close()


@app.put("/api/admin/orders/{order_id}/notes")
def admin_update_order_notes(order_id: int, req: dict, request: Request):
    _check_admin(request)
    notes = (req.get("notes", "") or "").strip()

    db = get_db()
    try:
        db.execute(
            "UPDATE orders SET notes = ?, updated_at = datetime('now') WHERE id = ?",
            (notes, order_id),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Main ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    print(f"[activation-server] Starting on 0.0.0.0:{SERVER_PORT}")
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
