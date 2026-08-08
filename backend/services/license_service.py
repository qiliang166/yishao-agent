"""License activation client for Yishao Agent.
Online mode — calls the activation server for validation.
No AES key on client side. Uses only stdlib modules.
"""
import hashlib
import json
import os
import platform
import sqlite3
import subprocess
import sys
import uuid
import urllib.request
import urllib.error
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────
ACTIVATION_SERVER_URL = os.environ.get(
    "ACTIVATION_SERVER_URL", "http://120.25.251.172:18777"
).rstrip("/")

_machine_id_cache: str | None = None


def _run_cmd(cmd: list[str], timeout: int = 8) -> str:
    try:
        return subprocess.check_output(
            cmd, shell=True, timeout=timeout,
            stderr=subprocess.DEVNULL,
        ).decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _valid_hw_value(value: str) -> bool:
    """Reject empty/placeholder hardware identifiers some boards report."""
    v = value.strip().strip(".").replace("-", "").replace("_", "").upper()
    if len(v) < 4:
        return False
    if set(v) <= {"F"} or set(v) <= {"0"}:
        return False
    if v in ("NONE", "UNKNOWN", "DEFAULTSTRING", "TOBEFILLEDBYOEM", "NA"):
        return False
    return True


def _wmic_value(args: list[str], header: str) -> str:
    out = _run_cmd(["wmic"] + args)
    lines = [l.strip() for l in out.splitlines() if l.strip() and l.strip() != header]
    return lines[0] if lines else ""


def _win_machine_uuid() -> str:
    v = _wmic_value(["csproduct", "get", "uuid"], "UUID")
    if not _valid_hw_value(v):
        v = _run_cmd([
            "powershell", "-NoProfile", "-Command",
            "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
        ]).strip()
    return v if _valid_hw_value(v) else ""


def _win_baseboard_serial() -> str:
    v = _wmic_value(["baseboard", "get", "serialnumber"], "SerialNumber")
    if not _valid_hw_value(v):
        v = _run_cmd([
            "powershell", "-NoProfile", "-Command",
            "(Get-CimInstance Win32_BaseBoard).SerialNumber",
        ]).strip()
    return v if _valid_hw_value(v) else ""


def _read_first_line(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.readline().strip()
    except Exception:
        return ""


def generate_machine_id() -> str:
    """Generate a stable hardware fingerprint (v2). Cached after first call.

    v2 uses only stable identifiers (board UUID / serial on Windows,
    machine-id / DMI product UUID on Linux). Volatile parts (MAC, hostname,
    disk order) caused fingerprint drift in v1 and are excluded.
    """
    global _machine_id_cache
    if _machine_id_cache is not None:
        return _machine_id_cache

    parts: list[str] = ["fpv2"]

    if os.name == "nt":
        u = _win_machine_uuid()
        if u:
            parts.append(u)
        s = _win_baseboard_serial()
        if s:
            parts.append(s)
    else:
        mid = _read_first_line("/etc/machine-id")
        if _valid_hw_value(mid):
            parts.append(mid)
        puuid = _read_first_line("/sys/class/dmi/id/product_uuid")
        if _valid_hw_value(puuid):
            parts.append(puuid)

    if len(parts) == 1:
        # No stable hardware identifier available — fall back to legacy v1 parts
        try:
            parts.append(f"{uuid.getnode():012x}")
        except Exception:
            pass
        parts.append(platform.node() or "unknown")
        parts.append(platform.machine() or "unknown")
        parts.append(platform.processor() or "unknown")

    fingerprint = "|".join(parts)
    _machine_id_cache = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
    return _machine_id_cache


def _api_post(path: str, data: dict, timeout: int = 15) -> dict:
    """Call activation server POST endpoint."""
    url = f"{ACTIVATION_SERVER_URL}{path}"
    body = json.dumps(data).encode("utf-8")
    try:
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode("utf-8", errors="ignore")
        try:
            err_data = json.loads(resp_body)
            err_data["_http_status"] = e.code
            return err_data
        except Exception:
            return {"detail": resp_body or f"HTTP {e.code}", "_http_status": e.code}
    except urllib.error.URLError as e:
        raise ConnectionError(f"无法连接激活服务器: {e.reason}")


def _get_db() -> sqlite3.Connection:
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(base, "data", "yishao.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _get_license_row() -> dict | None:
    db = _get_db()
    try:
        row = db.execute("SELECT * FROM license WHERE id = 1").fetchone()
        if row is None:
            return None
        return dict(row)
    finally:
        db.close()


def _ensure_license_schema(db: sqlite3.Connection) -> None:
    """Add expires_at column to license table if missing (migration-safe)."""
    cols = [r[1] for r in db.execute("PRAGMA table_info(license)").fetchall()]
    if "expires_at" not in cols:
        db.execute("ALTER TABLE license ADD COLUMN expires_at TIMESTAMP")
        db.commit()


def _save_license_row(license_key: str, machine_id: str,
                      product_id: int, serial_number: int,
                      expires_at: str | None = None) -> None:
    db = _get_db()
    try:
        _ensure_license_schema(db)
        db.execute(
            """INSERT OR REPLACE INTO license
               (id, license_key, machine_id, product_id, serial_number,
                expires_at, activated_at, last_checked_at)
               VALUES (1, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))""",
            (license_key, machine_id, product_id, serial_number, expires_at),
        )
        db.commit()
    finally:
        db.close()


def _delete_license_row() -> None:
    db = _get_db()
    try:
        db.execute("DELETE FROM license WHERE id = 1")
        db.commit()
    finally:
        db.close()


def _update_last_checked() -> None:
    db = _get_db()
    try:
        db.execute(
            "UPDATE license SET last_checked_at = datetime('now') WHERE id = 1",
        )
        db.commit()
    finally:
        db.close()


def validate_license_key(key: str) -> dict | None:
    """Preview a license key by asking the server (no binding)."""
    try:
        data = _api_post("/api/check", {
            "key": key,
            "machine_id": generate_machine_id(),
        }, timeout=10)
        return data if data.get("activated") is not None else None
    except Exception:
        return None


def activate(key: str) -> dict:
    """Activate a license key on this machine via the activation server."""
    machine_id = generate_machine_id()

    try:
        data = _api_post("/api/activate", {
            "key": key,
            "machine_id": machine_id,
        }, timeout=15)
    except ConnectionError as e:
        raise ValueError(str(e))

    http_status = data.get("_http_status", 200)
    if http_status >= 400:
        detail = data.get("detail", "激活服务器返回错误")
        raise ValueError(detail)

    # Check if already activated with a different key locally
    existing = _get_license_row()
    if existing and existing["license_key"] != key:
        raise ValueError("本机已绑定其他许可证，请先解除激活后再试")

    _save_license_row(
        license_key=key,
        machine_id=machine_id,
        product_id=data.get("product_id", 1),
        serial_number=data.get("serial_number", 0),
        expires_at=data.get("expires_at"),
    )

    return {
        "activated": True,
        "product_id": data.get("product_id", 1),
        "serial_number": data.get("serial_number", 0),
        "machine_id": machine_id[:16] + "...",
    }


def check_activation() -> dict:
    """Verify activation. Always checks with server — no cache for expired/revoked grace."""
    existing = _get_license_row()
    if existing is None:
        return {"activated": False}

    current_machine_id = generate_machine_id()
    if existing.get("machine_id") != current_machine_id:
        return {"activated": False, "reason": "machine_mismatch"}

    # Verify with activation server
    try:
        data = _api_post("/api/check", {
            "key": existing["license_key"],
            "machine_id": current_machine_id,
        }, timeout=5)
        _update_last_checked()
        if data.get("activated"):
            # Sync expires_at from server to local DB
            if data.get("expires_at"):
                _db = _get_db()
                try:
                    _ensure_license_schema(_db)
                    _db.execute(
                        "UPDATE license SET expires_at = ? WHERE id = 1",
                        (data["expires_at"],),
                    )
                    _db.commit()
                finally:
                    _db.close()
            return {
                "activated": True,
                "product_id": data.get("product_id"),
                "serial_number": data.get("serial_number"),
                "activated_at": data.get("activated_at") or existing.get("activated_at"),
                "last_checked_at": datetime.now().isoformat(),
            }
        else:
            # Expired / revoked / suspended — clear license, revert to unactivated
            _delete_license_row()
            return {"activated": False}
    except Exception:
        pass

    # Server unreachable — check local expires_at before trusting local state
    _update_last_checked()
    local_expires = existing.get("expires_at")
    if local_expires:
        try:
            exp = datetime.strptime(local_expires, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                exp = datetime.strptime(local_expires, "%Y-%m-%d")
            except ValueError:
                exp = None
        if exp is not None and datetime.now() > exp:
            _delete_license_row()
            return {"activated": False}
    return {
        "activated": True,
        "product_id": existing.get("product_id"),
        "serial_number": existing.get("serial_number"),
        "activated_at": existing.get("activated_at"),
        "last_checked_at": datetime.now().isoformat(),
        "warning": "offline",
    }


def deactivate() -> bool:
    """Deactivate: tell the server, then clear local state."""
    existing = _get_license_row()
    if existing is None:
        return False

    try:
        # Use the STORED machine_id so unbinding works even after
        # fingerprint drift (a freshly computed id may no longer match
        # the server-side binding, leaving an orphaned activation).
        _api_post("/api/deactivate", {
            "key": existing["license_key"],
            "machine_id": existing.get("machine_id") or generate_machine_id(),
        }, timeout=10)
    except Exception:
        pass

    _delete_license_row()
    return True


def get_license_status() -> dict:
    """Return current license info, verified against activation server."""
    result = check_activation()
    existing = _get_license_row()
    if existing is None:
        return {"activated": False}
    return {
        **result,
        "license_key": existing.get("license_key"),
        "machine_match": existing.get("machine_id") == generate_machine_id(),
    }
