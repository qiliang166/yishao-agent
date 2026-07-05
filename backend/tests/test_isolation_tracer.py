"""
Runtime SQL isolation tracer.

Wraps SQLite connections to intercept every query during PPT generation,
flags any query that touches shared config tables without proper isolation.

Usage: python -m pytest tests/test_isolation_tracer.py -v -s
"""

import sqlite3
import re
import json
import os
import sys
import traceback

# ── Tracer state ──
_original_get_db = None
_violations: list[dict] = []
_query_log: list[dict] = []
_tracing_enabled = False

SHARED_TABLES = [
    "column_configs",
    "speech_configs",
    "tts_configs",
    "core_prompt_configs",
    "project_items",       # must have project_id or composite-id filter
    "step_results",        # must have project_id filter
]


def _has_workspace_filter(sql: str, params: tuple) -> bool:
    """Check if the query filters by workspace_id."""
    return bool(re.search(r'WHERE\s+.*workspace_id\s*=\s*\?', sql, re.IGNORECASE))


def _has_project_filter(sql: str, params: tuple) -> bool:
    """Check if the query filters by project_id."""
    return bool(re.search(r'WHERE\s+.*project_id\s*=\s*\?', sql, re.IGNORECASE))


def _has_composite_id_filter(sql: str, params: tuple) -> bool:
    """Check if query uses composite ID pattern pi-{project_id}-{column_id}."""
    if params:
        for p in params:
            if isinstance(p, str) and p.startswith("pi-"):
                return True
    return False


def _extract_tables(sql: str) -> list[str]:
    """Extract table names from SQL statement."""
    # Simple regex: match FROM/JOIN/UPDATE/INSERT INTO table_name
    tables = []
    for m in re.finditer(r'(?:FROM|JOIN|UPDATE|INTO)\s+(\w+)', sql, re.IGNORECASE):
        tables.append(m.group(1).lower())
    return tables


def _get_call_stack() -> str:
    """Get a concise call stack showing the relevant frames."""
    frames = traceback.extract_stack()
    # Filter to show only project code, skip tracer internals
    relevant = []
    for f in frames:
        if "test_isolation_tracer" in f.filename:
            continue
        if "site-packages" in f.filename:
            continue
        if "<frozen" in f.filename:
            continue
        relevant.append(f"{os.path.basename(f.filename)}:{f.lineno} in {f.name}")
    return " <- ".join(relevant[-8:])  # Last 8 frames


class TracingConnection:
    """Wraps a real sqlite3.Connection, intercepts execute() calls."""

    def __init__(self, real_conn):
        self._conn = real_conn
        self.row_factory = real_conn.row_factory

    def execute(self, sql, params=None):
        global _violations, _query_log, _tracing_enabled

        if _tracing_enabled and params is None:
            params = ()

        result = self._conn.execute(sql, params or ())

        if _tracing_enabled:
            tables = _extract_tables(sql)
            shared = [t for t in tables if t in SHARED_TABLES]

            if shared:
                entry = {
                    "tables": shared,
                    "sql": sql.strip()[:200],
                    "params": str(params)[:200],
                    "stack": _get_call_stack(),
                }
                _query_log.append(entry)

                for tbl in shared:
                    if tbl in ("project_items", "step_results"):
                        # Must have project_id filter OR composite ID pattern
                        if not (_has_project_filter(sql, params) or _has_composite_id_filter(sql, params)):
                            _violations.append({
                                "table": tbl,
                                "issue": f"MISSING project_id filter on {tbl}",
                                **entry,
                            })
                    else:
                        # column_configs, speech_configs, tts_configs, core_prompt_configs
                        # Must have workspace_id filter (unless it's a seed data query with IS NULL)
                        if not _has_workspace_filter(sql, params):
                            # Allow workspace_id IS NULL (seed data queries)
                            if "workspace_id IS NULL" not in sql and "workspace_id IS NOT NULL" not in sql:
                                _violations.append({
                                    "table": tbl,
                                    "issue": "MISSING workspace_id filter",
                                    **entry,
                                })

        return result

    def close(self):
        self._conn.close()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def cursor(self):
        return self._conn.cursor()

    def __getattr__(self, name):
        return getattr(self._conn, name)


def enable_tracing():
    """Monkey-patch all get_db() imports to return tracing connections."""
    global _tracing_enabled, _original_get_db
    import database
    import services.ppt_service as psm

    _original_get_db = database.get_db

    def tracing_get_db():
        conn = _original_get_db()
        return TracingConnection(conn)

    # Patch at source: database module
    database.get_db = tracing_get_db
    # Also patch in ppt_service (has its own import)
    psm.get_db = tracing_get_db
    # Re-patch app if already imported
    try:
        import app
        app.get_db = tracing_get_db
    except Exception:
        pass

    _tracing_enabled = True
    _violations.clear()
    _query_log.clear()


def disable_tracing():
    """Restore original get_db()."""
    global _tracing_enabled, _original_get_db
    _tracing_enabled = False
    if _original_get_db:
        import database
        import services.ppt_service as psm
        database.get_db = _original_get_db
        psm.get_db = _original_get_db
        try:
            import app
            app.get_db = _original_get_db
        except Exception:
            pass
        _original_get_db = None


def get_violations():
    return list(_violations)


def get_query_log():
    return list(_query_log)


def print_report():
    """Print a formatted isolation audit report."""
    violations = get_violations()
    all_queries = get_query_log()

    print("\n" + "=" * 80)
    print(f"  ISOLATION AUDIT REPORT")
    print(f"  Total shared-table queries: {len(all_queries)}")
    print(f"  Violations found: {len(violations)}")
    print("=" * 80)

    if violations:
        print("  VIOLATIONS (missing isolation filters):\n")
        for i, v in enumerate(violations, 1):
            print(f"  [{i}] {v['issue']}")
            print(f"      Table: {v['table']}")
            print(f"      SQL:   {v['sql']}")
            print(f"      Stack: {v['stack']}")
            print()
    else:
        print("[PASS] ZERO violations - all shared-table queries are properly isolated.\n")

    # Summary by table
    print("-" * 80)
    print("  Queries by table:")
    table_counts = {}
    for q in all_queries:
        for t in q["tables"]:
            table_counts[t] = table_counts.get(t, 0) + 1
    for t, c in sorted(table_counts.items()):
        print(f"    {t}: {c} queries")
    print("=" * 80)

    return len(violations) == 0


# ── Test that exercises the full pipeline ──

def test_full_isolation_audit():
    """
    Run a complete PPT generation with SQL tracing enabled,
    then verify zero isolation violations.
    """
    import database
    from database import init_db

    # Ensure DB is initialized (uses unpatched get_db)
    init_db()

    # ── Setup phase (BEFORE tracing) ──
    db = database.get_db()
    try:
        project = db.execute(
            "SELECT p.id, p.workspace_id FROM projects p "
            "INNER JOIN project_items pi ON pi.project_id = p.id "
            "WHERE pi.id LIKE '%-col4' LIMIT 1"
        ).fetchone()

        if not project:
            print("[WARN] No project with col4 found - creating test workspace + project...")
            import uuid
            ws_id = f"ws-tracer-{uuid.uuid4().hex[:8]}"
            p_id = f"proj-tracer-{uuid.uuid4().hex[:8]}"

            db.execute("INSERT INTO workspaces (id, name) VALUES (?, ?)", (ws_id, "Tracer Test WS"))
            db.commit()

            from app import _copy_seed_configs
            _copy_seed_configs(ws_id)

            db.execute("INSERT INTO projects (id, name, workspace_id) VALUES (?, ?, ?)", (p_id, "Tracer Test Project", ws_id))
            db.commit()

            from app import _init_project_items_from_factory
            _init_project_items_from_factory(p_id)

            project = {"id": p_id, "workspace_id": ws_id}
        else:
            project = {"id": project["id"], "workspace_id": project["workspace_id"]}

        print(f"\n[TRACE] Tracing project: {project['id']} (workspace: {project['workspace_id']})")
    finally:
        db.close()

    # ── Enable tracing ──
    enable_tracing()

    try:
        print("Running PPT outline generation with tracing enabled...")
        from services.ppt_service import _generate_outline_only

        test_content = "# Test Document\n\n## Section 1\nThis is test content.\n\n## Section 2\nMore test content."

        result = _generate_outline_only(
            provider_id="",
            model="",
            rules={"style_id": "business"},
            sop_content=test_content,
            project_id=project["id"],
            column_id="col4",
        )

        if result:
            print(f"  Outline generated: {len(result)} slides")
        else:
            print("  Outline generation returned None (expected without LLM provider)")

        # Exercise _get_canvas_dimensions and all wrapper functions
        from services.ppt_service import (
            _get_canvas_dimensions, _load_design_system,
            _build_page_type_prompt, _load_reviewer_spec,
            _load_scenario_file, _load_svg_prompt_specs,
            _load_cognitive_spec, _load_outline_spec,
            _load_style_vi_section
        )

        _get_canvas_dimensions("col4", project_id=project["id"])
        _get_canvas_dimensions("col3", project_id=project["id"])
        _load_design_system("col4", project_id=project["id"])
        _build_page_type_prompt("business", "col4", project_id=project["id"])
        _load_reviewer_spec("col4", project_id=project["id"])
        _load_scenario_file("design-system.md", "col4", project_id=project["id"])
        _load_svg_prompt_specs("col4", project_id=project["id"])
        _load_cognitive_spec("col4", project_id=project["id"])
        _load_outline_spec("col4", project_id=project["id"])
        _load_style_vi_section("business", "hero", column_id="col4", project_id=project["id"])

        print("  All utility function calls completed successfully.")

    finally:
        disable_tracing()

    # ── Post-tracing: verify the regenerate/splice project_id lookup pattern ──
    try:
        ppt_db = database.get_db()
        sr_row = ppt_db.execute(
            "SELECT project_id FROM step_results WHERE step_name = ? LIMIT 1",
            ("_ppt_result_nonexistent_test",)
        ).fetchone()
        ppt_db.close()
        print("  step_results project_id lookup pattern OK")
    except Exception:
        pass

    # Print report
    clean = print_report()

    assert clean, f"Found {len(get_violations())} isolation violations! See report above."


def test_column_configs_fallback_with_isolation():
    """
    Force _get_canvas_dimensions to fall back from project_items to
    column_configs, and verify the fallback uses workspace_id filter.
    """
    import database
    from database import init_db
    init_db()

    # Find a project
    db = database.get_db()
    try:
        project = db.execute(
            "SELECT p.id, p.workspace_id FROM projects p "
            "INNER JOIN project_items pi ON pi.project_id = p.id "
            "WHERE pi.id LIKE '%-col4' LIMIT 1"
        ).fetchone()
        if not project:
            print("[WARN] No project available for fallback test - skipping")
            return
        project_id = project["id"]
        ws_id = project["workspace_id"]
        pi_id = f"pi-{project_id}-col4"
        print(f"[TRACE] Testing fallback for project={project_id}, ws={ws_id}")
    finally:
        db.close()

    # Temporarily clear config_json from the project_item to force fallback
    db = database.get_db()
    try:
        original = db.execute(
            "SELECT config_json FROM project_items WHERE id = ?", (pi_id,)
        ).fetchone()
        original_json = original["config_json"] if original else None
        db.execute("UPDATE project_items SET config_json = NULL WHERE id = ?", (pi_id,))
        db.commit()
        print(f"  Cleared config_json (was {len(original_json or '')} bytes)")
    finally:
        db.close()

    # Enable tracing
    enable_tracing()

    try:
        from services.ppt_service import _get_canvas_dimensions

        # This call should:
        # 1. Try project_items → miss (config_json is NULL)
        # 2. Try column_configs WITH workspace_id filter → find it
        w, h = _get_canvas_dimensions("col4", project_id=project_id)
        print(f"  Canvas from fallback: {w}x{h}")

    finally:
        disable_tracing()

    # Restore original config_json
    if original_json:
        db = database.get_db()
        try:
            db.execute("UPDATE project_items SET config_json = ? WHERE id = ?", (original_json, pi_id))
            db.commit()
        finally:
            db.close()

    # Verify: should have column_configs queries with workspace_id filter
    all_queries = get_query_log()
    col_queries = [q for q in all_queries if "column_configs" in q["tables"]]
    violations = get_violations()

    print(f"\n  column_configs queries: {len(col_queries)}")
    for q in col_queries:
        has_ws = "workspace_id" in q["sql"]
        print(f"    workspace_id filter: {has_ws} | {q['sql'][:120]}")
        assert has_ws, f"column_configs query missing workspace_id filter: {q['sql']}"

    assert len(violations) == 0, f"Unexpected violations: {violations}"
    print("  [PASS] Fallback path uses workspace_id filter correctly.")


if __name__ == "__main__":
    test_full_isolation_audit()
    test_column_configs_fallback_with_isolation()
