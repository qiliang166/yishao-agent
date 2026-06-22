"""Prompt management service with version control."""
import uuid
import json
from datetime import datetime
from database import get_db


def list_prompts(category: str = None):
    db = get_db()
    try:
        if category:
            rows = db.execute(
                """SELECT p.*, pv.system_prompt, pv.skill_template
                   FROM prompts p
                   LEFT JOIN prompt_versions pv ON pv.prompt_id = p.id AND pv.version = p.current_version
                   WHERE p.category = ?
                   ORDER BY p.updated_at DESC""",
                (category,)).fetchall()
        else:
            rows = db.execute(
                """SELECT p.*, pv.system_prompt, pv.skill_template
                   FROM prompts p
                   LEFT JOIN prompt_versions pv ON pv.prompt_id = p.id AND pv.version = p.current_version
                   ORDER BY p.category, p.updated_at DESC""").fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


def get_prompt(prompt_id: str):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not row:
            return None
        prompt = dict(row)
        versions = db.execute(
            "SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC",
            (prompt_id,)).fetchall()
        prompt["versions"] = [dict(v) for v in versions]
        return prompt
    finally:
        db.close()


def create_prompt(name: str, category: str, system_prompt: str, skill_template: str):
    pid = uuid.uuid4().hex[:8]
    version = "v1.0"
    db = get_db()
    try:
        db.execute(
            "INSERT INTO prompts (id, name, category, current_version) VALUES (?, ?, ?, ?)",
            (pid, name, category, version))
        db.execute(
            "INSERT INTO prompt_versions (prompt_id, version, system_prompt, skill_template, change_note) VALUES (?, ?, ?, ?, ?)",
            (pid, version, system_prompt, skill_template, "初始版本"))
        db.commit()
        return get_prompt(pid)
    finally:
        db.close()


def update_prompt(prompt_id: str, name: str = None, category: str = None,
                  system_prompt: str = None, skill_template: str = None,
                  change_note: str = ""):
    db = get_db()
    try:
        prompt = db.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not prompt:
            return None

        if name or category:
            updates = []
            params = []
            if name:
                updates.append("name = ?")
                params.append(name)
            if category:
                updates.append("category = ?")
                params.append(category)
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(prompt_id)
            db.execute(f"UPDATE prompts SET {', '.join(updates)} WHERE id = ?", params)

        if system_prompt is not None or skill_template is not None:
            # Generate new version
            current_ver = prompt["current_version"]
            ver_num = current_ver.lstrip("v")
            if "." in ver_num:
                major, minor = ver_num.split(".", 1)
                new_version = f"v{major}.{int(minor) + 1}"
            else:
                new_version = f"v{ver_num}.1"

            existing_sys = system_prompt
            existing_skill = skill_template
            if existing_sys is None:
                last = db.execute(
                    "SELECT system_prompt FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1",
                    (prompt_id,)).fetchone()
                existing_sys = last["system_prompt"] if last else ""
            if existing_skill is None:
                last = db.execute(
                    "SELECT skill_template FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC LIMIT 1",
                    (prompt_id,)).fetchone()
                existing_skill = last["skill_template"] if last else ""

            db.execute(
                "INSERT INTO prompt_versions (prompt_id, version, system_prompt, skill_template, change_note) VALUES (?, ?, ?, ?, ?)",
                (prompt_id, new_version, existing_sys, existing_skill, change_note or "更新"))
            db.execute("UPDATE prompts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (new_version, prompt_id))

        db.commit()
        return get_prompt(prompt_id)
    finally:
        db.close()


def delete_prompt(prompt_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
        db.commit()
    finally:
        db.close()


def rollback_version(prompt_id: str, target_version: str):
    db = get_db()
    try:
        target = db.execute(
            "SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?",
            (prompt_id, target_version)).fetchone()
        if not target:
            return None
        db.execute("UPDATE prompts SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                   (target_version, prompt_id))
        db.commit()
        return get_prompt(prompt_id)
    finally:
        db.close()


def diff_versions(prompt_id: str, version_a: str, version_b: str):
    db = get_db()
    try:
        a = db.execute(
            "SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?",
            (prompt_id, version_a)).fetchone()
        b = db.execute(
            "SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?",
            (prompt_id, version_b)).fetchone()
        if not a or not b:
            return None
        import difflib
        sys_diff = list(difflib.unified_diff(
            a["system_prompt"].splitlines(keepends=True),
            b["system_prompt"].splitlines(keepends=True),
            fromfile=f"{version_a}",
            tofile=f"{version_b}",
        ))
        skill_diff = list(difflib.unified_diff(
            a["skill_template"].splitlines(keepends=True),
            b["skill_template"].splitlines(keepends=True),
            fromfile=f"{version_a} (skill)",
            tofile=f"{version_b} (skill)",
        ))
        return {
            "version_a": version_a,
            "version_b": version_b,
            "system_prompt_diff": "".join(sys_diff),
            "skill_template_diff": "".join(skill_diff),
        }
    finally:
        db.close()


def set_default(prompt_id: str):
    db = get_db()
    try:
        prompt = db.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not prompt:
            return
        # Clear all defaults in this category
        db.execute("UPDATE prompts SET is_default = 0 WHERE category = ?", (prompt["category"],))
        # Set this one as default
        db.execute("UPDATE prompts SET is_default = 1 WHERE id = ?", (prompt_id,))
        db.commit()
    finally:
        db.close()


def export_prompts():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM prompts").fetchall()
        result = []
        for r in rows:
            p = dict(r)
            versions = db.execute(
                "SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at",
                (p["id"],)).fetchall()
            p["versions"] = [dict(v) for v in versions]
            result.append(p)
        return result
    finally:
        db.close()


def import_prompts(data: list):
    db = get_db()
    try:
        for p in data:
            pid = p.get("id", uuid.uuid4().hex[:8])
            db.execute(
                "INSERT OR REPLACE INTO prompts (id, name, category, current_version, is_default) VALUES (?, ?, ?, ?, ?)",
                (pid, p["name"], p["category"], p.get("current_version", "v1.0"), p.get("is_default", 0)))
            for v in p.get("versions", []):
                db.execute(
                    "INSERT OR REPLACE INTO prompt_versions (prompt_id, version, system_prompt, skill_template, change_note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (pid, v["version"], v.get("system_prompt", ""), v.get("skill_template", ""),
                     v.get("change_note", ""), v.get("created_at", datetime.now().isoformat())))
        db.commit()
        return {"imported": len(data)}
    finally:
        db.close()
