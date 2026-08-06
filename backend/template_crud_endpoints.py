import os, json, io, zipfile, shutil, tempfile
from pydantic import BaseModel
from fastapi import HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime


class TemplateCreateRequest(BaseModel):
    name: str
    style_id: str
    group: str = "Professional"


class TemplateUpdateRequest(BaseModel):
    name: str = None
    group: str = None


def _write_vi_skeleton(vi_dir: str, name: str):
    """Write minimal VI skeleton files for a new template."""
    with open(os.path.join(vi_dir, "vi.md"), "w", encoding="utf-8") as f:
        f.write(f"# {name} — 视觉识别\n\n## 设计理念\n\n待补充\n\n## 色彩\n\n参见 `tokens.yaml`\n\n## 字体\n\n待补充\n")

    with open(os.path.join(vi_dir, "tokens.yaml"), "w", encoding="utf-8") as f:
        f.write("""color_scheme: default
color_schemes:
  default:
    label: 默认配色
    persona_hint: ""
    primary: "#2563eb"
    secondary: "#1e40af"
    accent: "#f59e0b"
    background: "#ffffff"
    text: "#1f2937"
    card_bg: "#f9fafb"
    chart_colors:
      - "#2563eb"
      - "#f59e0b"
      - "#10b981"
      - "#ef4444"
      - "#8b5cf6"
    semantic:
      positive: "#10b981"
      negative: "#ef4444"
""")

    with open(os.path.join(vi_dir, "prompt.md"), "w", encoding="utf-8") as f:
        f.write(f"# {name} 风格提示词\n\n你是一个 {name} 风格的 PPT 设计师。\n\n{{{{PERSONA_HINT}}}}\n")

    with open(os.path.join(vi_dir, "index.md"), "w", encoding="utf-8") as f:
        f.write(f"""# {name} — 页面类型索引

## 页面类型

| 编号 | 类型 | 用途 |
|------|------|------|
| P01 | cover | 封面 |
| P02 | toc | 目录 |
| P03 | content | 内容 |
| P04 | data | 数据 |
| P05 | summary | 总结 |
| P06 | closing | 结束 |
""")

    with open(os.path.join(vi_dir, "cover.md"), "w", encoding="utf-8") as f:
        f.write("""# P01 封面

## 用途

课件封面页，包含标题、副标题、作者信息。

## HTML 模板

```html
<div class="slide" style="background: {{{{primary}}}}; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 80px 60px;">
  <h1 style="font-size: 48px; margin: 0 0 16px 0;">{{{{TITLE}}}}</h1>
  <p style="font-size: 20px; opacity: 0.85; margin: 0 0 8px 0;">{{{{SUBTITLE}}}}</p>
  <p style="font-size: 14px; opacity: 0.65; margin: 0;">{{{{AUTHOR}}}}</p>
</div>
```
""")

    with open(os.path.join(vi_dir, "closing.md"), "w", encoding="utf-8") as f:
        f.write("""# P06 结束页

## 用途

课件结束/感谢页。

## HTML 模板

```html
<div class="slide" style="background: {{{{primary}}}}; color: white; display: flex; align-items: center; justify-content: center; text-align: center; padding: 60px;">
  <h1 style="font-size: 42px; margin: 0;">{{{{TITLE}}}}</h1>
</div>
```
""")



@app.post("/api/templates")
def create_template(data: TemplateCreateRequest, user=require_perm("template.manage")):
    """Create a new style template (DB row + VI directory skeleton)."""
    name = data.name.strip()
    style_id = data.style_id.strip()
    group = data.group.strip()

    if not name:
        raise HTTPException(400, "模板名称不能为空")
    if not style_id:
        raise HTTPException(400, "style_id 不能为空")
    if not style_id.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "style_id 只能包含小写字母、数字和连字符")

    template_id = f"style-{style_id}"

    db = get_db()
    try:
        existing = db.execute("SELECT id FROM templates WHERE id = ?", (template_id,)).fetchone()
        if existing:
            raise HTTPException(409, f"模板 ID '{template_id}' 已存在")
    finally:
        db.close()

    vi_dir = os.path.join(VI_DIR, style_id)
    if os.path.exists(vi_dir):
        raise HTTPException(409, f"VI 目录 '{style_id}' 已存在")

    os.makedirs(vi_dir, exist_ok=True)
    _common_dir = os.path.join(VI_DIR, "_common")
    try:
        common_blocks = os.path.join(_common_dir, "blocks")
        if os.path.isdir(common_blocks):
            dst_blocks = os.path.join(vi_dir, "blocks")
            os.makedirs(dst_blocks, exist_ok=True)
            for fname in os.listdir(common_blocks):
                src = os.path.join(common_blocks, fname)
                dst = os.path.join(dst_blocks, fname)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)

        _write_vi_skeleton(vi_dir, name)
    except Exception as e:
        if os.path.exists(vi_dir):
            shutil.rmtree(vi_dir, ignore_errors=True)
        raise HTTPException(500, f"创建 VI 文件失败: {e}")

    rules = json.dumps({"style_id": style_id, "group": group}, ensure_ascii=False)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO templates (id, name, type, file_path, prompt, skill, rules, "
            "thumbnail_path, linked_skill_id, branding_config, is_default, typography_profile, slide_plan) "
            "VALUES (?, ?, 'style', '', '', '', ?, '', '', '', 0, '', '')",
            (template_id, name, rules)
        )
        db.commit()
        row = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        return {"ok": True, "template": dict(row)}
    except Exception as e:
        if os.path.exists(vi_dir):
            shutil.rmtree(vi_dir, ignore_errors=True)
        raise HTTPException(500, f"创建模板失败: {e}")
    finally:
        db.close()


@app.post("/api/templates/import")
async def import_template(
    file: UploadFile = File(...),
    overwrite: bool = False,
    style_id: str = None,
    user=require_perm("template.manage")
):
    """Import a template from a ZIP file."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(400, "请上传 .zip 文件")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "文件过大（最大 50MB）")

    tmp_dir = None
    try:
        tmp_dir = tempfile.mkdtemp(prefix="tmpl_import_")
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for member in zf.namelist():
                resolved = os.path.normpath(os.path.join(tmp_dir, member))
                if not os.path.normcase(resolved).startswith(os.path.normcase(tmp_dir + os.sep)):
                    raise HTTPException(400, "ZIP 包含非法路径")
            zf.extractall(tmp_dir)

        meta_path = os.path.join(tmp_dir, "metadata.json")
        if not os.path.isfile(meta_path):
            raise HTTPException(400, "ZIP 缺少 metadata.json")

        with open(meta_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        import_style_id = (style_id or metadata.get("style_id") or "").strip()
        if not import_style_id:
            raise HTTPException(400, "metadata.json 缺少 style_id")
        if not import_style_id.replace("-", "").replace("_", "").isalnum():
            raise HTTPException(400, "style_id 只能包含小写字母、数字和连字符")

        import_name = (metadata.get("name") or import_style_id).strip()
        import_group = (metadata.get("group") or "Professional").strip()

        template_id = f"style-{import_style_id}"

        db = get_db()
        try:
            existing = db.execute("SELECT id, name FROM templates WHERE id = ?", (template_id,)).fetchone()
        finally:
            db.close()

        target_vi_dir = os.path.join(VI_DIR, import_style_id)
        if existing or os.path.exists(target_vi_dir):
            if not overwrite:
                raise HTTPException(
                    409,
                    f"模板 '{import_style_id}' 已存在。使用 ?overwrite=true 覆盖或 ?style_id=new-id 重命名导入"
                )
            if existing:
                dbi = get_db()
                try:
                    dbi.execute("DELETE FROM templates WHERE id = ?", (template_id,))
                    dbi.commit()
                finally:
                    dbi.close()
            if os.path.exists(target_vi_dir):
                shutil.rmtree(target_vi_dir, ignore_errors=True)

        vi_src = os.path.join(tmp_dir, "vi")
        if not os.path.isdir(vi_src):
            raise HTTPException(400, "ZIP 缺少 vi/ 目录")

        for root, dirs, files in os.walk(vi_src):
            for fname in files:
                full = os.path.join(root, fname)
                rel = os.path.relpath(full, vi_src)
                if ".." in rel.replace("\\", "/").split("/"):
                    raise HTTPException(400, f"非法文件路径: {rel}")

        shutil.copytree(vi_src, target_vi_dir)

        rules = json.dumps({"style_id": import_style_id, "group": import_group}, ensure_ascii=False)
        enabled_val = 1 if metadata.get("enabled", True) else 0
        db = get_db()
        try:
            db.execute(
                "INSERT INTO templates (id, name, type, file_path, prompt, skill, rules, "
                "thumbnail_path, linked_skill_id, branding_config, is_default, typography_profile, slide_plan, enabled) "
                "VALUES (?, ?, 'style', '', '', '', ?, '', '', '', 0, '', '', ?)",
                (template_id, import_name, rules, enabled_val)
            )
            db.commit()
            row = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
            return {"ok": True, "template": dict(row)}
        except Exception as e:
            if os.path.exists(target_vi_dir):
                shutil.rmtree(target_vi_dir, ignore_errors=True)
            raise HTTPException(500, f"导入模板失败: {e}")
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"导入模板失败: {e}")
    finally:
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/api/templates/{template_id}/export")
def export_template(template_id: str, user=require_perm("template.manage")):
    """Export a template as a ZIP file containing metadata.json + vi/ directory."""
    db = get_db()
    try:
        row = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(404, "模板不存在")
    finally:
        db.close()

    row_dict = dict(row)
    rules = json.loads(row_dict.get("rules") or "{}")
    style_id = rules.get("style_id", "")

    if not style_id:
        raise HTTPException(400, "模板缺少 style_id，无法导出")

    vi_dir = os.path.join(VI_DIR, style_id)
    if not os.path.isdir(vi_dir):
        raise HTTPException(404, f"VI 目录不存在: {style_id}")

    metadata = {
        "name": row_dict.get("name", ""),
        "style_id": style_id,
        "group": rules.get("group", ""),
        "enabled": row_dict.get("enabled", 1) == 1,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "version": "1.0",
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, strict_timestamps=False) as zf:
        zf.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
        for root, dirs, files in os.walk(vi_dir):
            for fname in files:
                full = os.path.join(root, fname)
                arcname = "vi/" + os.path.relpath(full, vi_dir).replace("\\", "/")
                with open(full, "rb") as fh:
                    zf.writestr(arcname, fh.read())

    buf.seek(0)
    safe_name = style_id.replace('"', '').replace("\\", "")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="template-{safe_name}.zip"'}
    )


@app.put("/api/templates/{template_id}")
def update_template(template_id: str, data: TemplateUpdateRequest, user=require_perm("template.manage")):
    """Update template metadata (name, group)."""
    db = get_db()
    try:
        row = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(404, "模板不存在")

        row_dict = dict(row)
        rules = json.loads(row_dict.get("rules") or "{}")

        if data.name is not None:
            row_dict["name"] = data.name.strip()
        if data.group is not None:
            rules["group"] = data.group.strip()

        new_rules = json.dumps(rules, ensure_ascii=False)
        db.execute("UPDATE templates SET name = ?, rules = ? WHERE id = ?",
                   (row_dict["name"], new_rules, template_id))
        db.commit()
        row_dict["rules"] = new_rules
        return {"ok": True, "template": row_dict}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"更新模板失败: {e}")
    finally:
        db.close()


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str, user=require_perm("template.manage")):
    """Delete a template (DB row + VI directory)."""
    db = get_db()
    try:
        row = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(404, "模板不存在")

        row_dict = dict(row)
        rules = json.loads(row_dict.get("rules") or "{}")
        style_id = rules.get("style_id", "")

        db.execute("DELETE FROM templates WHERE id = ?", (template_id,))
        db.commit()

        if style_id:
            vi_dir = os.path.join(VI_DIR, style_id)
            if os.path.exists(vi_dir):
                shutil.rmtree(vi_dir, ignore_errors=True)

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"删除模板失败: {e}")
    finally:
        db.close()
