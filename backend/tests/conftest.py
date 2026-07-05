"""Test fixtures for Yishao Agent backend tests."""
import os
import sys
import sqlite3
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def tmp_db():
    """Create an in-memory SQLite database with column_configs table."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("""
        CREATE TABLE column_configs (
            id TEXT PRIMARY KEY,
            column_id TEXT NOT NULL,
            label TEXT NOT NULL,
            prompt TEXT,
            skill TEXT,
            has_template INTEGER DEFAULT 0,
            template_path TEXT,
            rules TEXT DEFAULT '{}',
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture
def seed_col_rules(tmp_db):
    """Insert seed col4/col5 test data with minimal rules."""
    import json
    col4_rules = json.dumps({
        "design_rules": {
            "color_discipline": "不超过3种功能色",
            "font_discipline": "字体三级分工"
        },
        "layout_types": [
            {"id": "cover", "name": "封面"},
            {"id": "toc", "name": "目录页"},
            {"id": "summary", "name": "总结页"}
        ],
        "checklist": {
            "p0_must_pass": [
                {"id": "P0-1", "item": "版式类型在定义范围内"},
                {"id": "P0-2", "item": "配色约束正确"}
            ]
        },
        "canvas": {"width": 1280, "height": 720}
    })
    col5_rules = json.dumps({
        "design_rules": {
            "color_discipline": "不超过3种功能色",
            "font_discipline": "字体三级分工"
        },
        "layout_types": [
            {"id": "cover", "name": "封面"},
            {"id": "content", "name": "教学页"},
            {"id": "closing", "name": "收束页"}
        ],
        "checklist": {
            "p0_must_pass": [
                {"id": "P0-1", "item": "版式类型在定义范围内"}
            ]
        },
        "canvas": {"width": 1280, "height": 720}
    })
    col3_rules = json.dumps({"canvas": {"width": 794, "height": 1123}})

    tmp_db.execute(
        "INSERT INTO column_configs (id, column_id, label, rules, sort_order) VALUES (?, ?, ?, ?, ?)",
        ("c3", "col3", "文档课件", col3_rules, 2))
    tmp_db.execute(
        "INSERT INTO column_configs (id, column_id, label, rules, sort_order) VALUES (?, ?, ?, ?, ?)",
        ("c4", "col4", "分析PPT", col4_rules, 3))
    tmp_db.execute(
        "INSERT INTO column_configs (id, column_id, label, rules, sort_order) VALUES (?, ?, ?, ?, ?)",
        ("c5", "col5", "综合PPT", col5_rules, 4))
    tmp_db.commit()
    return tmp_db
