"""
Batch Executor — background thread scheduler.
Does NOT own any pipeline logic. Reads configs from DB (column_configs,
speech_configs), builds messages exactly like the frontend, calls the same
llm_service.generate(), saves to the same step_results table.

Rule: zero hardcoded prompts. Everything comes from the config tables.
"""
import asyncio
import json
import threading
import time
from datetime import datetime

_batch_lock = threading.Lock()
_active_batches: dict = {}  # batch_id -> BatchJob


class BatchJob:
    def __init__(self, batch_id: str, workspace_id: str, start_time: str, end_time: str):
        self.batch_id = batch_id
        self.workspace_id = workspace_id
        self.start_time = start_time
        self.end_time = end_time
        self.status = "pending"
        self.total_count = 0
        self.completed_count = 0
        self.failed_count = 0
        self.items: list[dict] = []
        self._stop_flag = threading.Event()
        self._thread: threading.Thread | None = None

    def to_dict(self):
        return {
            "batch_id": self.batch_id,
            "workspace_id": self.workspace_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "status": self.status,
            "total_count": self.total_count,
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
            "items": [{
                "project_id": it["project_id"],
                "project_name": it.get("project_name", ""),
                "steps": it["steps"],
                "status": it["status"],
                "logs": it.get("logs", [])
            } for it in self.items]
        }


def _parse_iso(ts: str):
    ts = ts.replace("T", " ").replace("Z", "")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(ts[:19], fmt)
        except ValueError:
            continue
    return datetime.now()


def _now():
    return datetime.now()


def start_batch(batch_id: str, workspace_id: str, start_time: str, end_time: str,
                items: list[dict]) -> BatchJob:
    with _batch_lock:
        if batch_id in _active_batches:
            return _active_batches[batch_id]
        job = BatchJob(batch_id, workspace_id, start_time, end_time)
        job.total_count = len(items)
        job.items = [{
            "project_id": it["project_id"],
            "project_name": it.get("project_name", ""),
            "steps": it.get("steps", []),
            "status": "pending",
            "logs": []
        } for it in items]
        _active_batches[batch_id] = job

    job._thread = threading.Thread(target=_run_batch, args=(job,), daemon=True)
    job._thread.start()
    return job


def _run_batch(job: BatchJob):
    start_dt = _parse_iso(job.start_time)
    end_dt = _parse_iso(job.end_time)

    wait_seconds = (start_dt - _now()).total_seconds()
    if wait_seconds > 0:
        job.status = "pending"
        _update_db(job)
        time.sleep(wait_seconds)

    if job._stop_flag.is_set():
        job.status = "cancelled"
        _update_db(job)
        return

    job.status = "running"
    _update_db(job)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        for item in job.items:
            if job._stop_flag.is_set():
                item["status"] = "skipped"
                item["logs"].append(f"[{_now().strftime('%H:%M:%S')}] 批次已取消，跳过")
                continue

            if _now() >= end_dt:
                item["status"] = "skipped"
                item["logs"].append(f"[{_now().strftime('%H:%M:%S')}] 到达结束时间，跳过")
                continue

            item["status"] = "running"
            _update_db(job)
            _update_item_db(job.batch_id, item)

            try:
                loop.run_until_complete(_execute_project(item, job))
                item["status"] = "completed"
                job.completed_count += 1
            except Exception as e:
                item["status"] = "failed"
                item["logs"].append(f"[{_now().strftime('%H:%M:%S')}] 执行失败: {e}")
                job.failed_count += 1

            _update_db(job)
            _update_item_db(job.batch_id, item)
    finally:
        loop.close()

    job.status = "completed"
    _update_db(job)


# ── Config loading (reads same tables the frontend reads) ──

def _load_column_configs(db, workspace_id: str) -> list[dict]:
    """Load column_configs for a workspace (same as frontend's listColumnConfigs)."""
    rows = db.execute(
        "SELECT * FROM column_configs WHERE workspace_id = ? OR workspace_id IS NULL "
        "ORDER BY workspace_id IS NULL, sort_order",
        (workspace_id,)
    ).fetchall()
    # workspace-specific overrides global (same id)
    seen = {}
    for r in rows:
        r = dict(r)
        if r["id"] not in seen:
            seen[r["id"]] = r
    return list(seen.values())


def _load_speech_configs(db, workspace_id: str) -> list[dict]:
    """Load speech_configs for a workspace (same as frontend's listSpeechConfigs)."""
    rows = db.execute(
        "SELECT * FROM speech_configs WHERE workspace_id = ? OR workspace_id IS NULL "
        "ORDER BY workspace_id IS NULL, sort_order",
        (workspace_id,)
    ).fetchall()
    seen = {}
    for r in rows:
        r = dict(r)
        if r["id"] not in seen:
            seen[r["id"]] = r
    return list(seen.values())


def _get_provider_model(db, workspace_id: str, step_name: str = "_model_s2_sop") -> tuple:
    """Get provider_id and model from step_results model setting, falling back to first enabled."""
    provider_id = ""
    model = ""
    try:
        row = db.execute(
            "SELECT content FROM step_results WHERE project_id IN "
            "(SELECT id FROM projects WHERE workspace_id=?) AND step_name=? LIMIT 1",
            (workspace_id, step_name)
        ).fetchone()
        if row and row[0]:
            combined = row[0]
            if ":" in combined:
                provider_id, model = combined.split(":", 1)
            else:
                model = combined
    except Exception:
        pass

    if not model:
        row = db.execute(
            "SELECT models FROM llm_providers WHERE is_enabled=1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row and row[0]:
            try:
                models_list = json.loads(row[0])
                if models_list:
                    model = models_list[0]
            except Exception:
                pass

    if not provider_id:
        row = db.execute(
            "SELECT id FROM llm_providers WHERE is_enabled=1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row:
            provider_id = row[0]

    return provider_id, model


# ── Step execution (reads configs → calls generate() → saves to step_results) ──

async def _execute_project(item: dict, job: BatchJob):
    from services.llm_service import generate
    from database import get_db

    project_id = item["project_id"]
    steps_list = item.get("steps", [])

    db = get_db()
    try:
        proj = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not proj:
            raise Exception(f"项目 {project_id} 不存在")
        proj = dict(proj)
        workspace_id = proj.get("workspace_id", "")

        # ── Load all configs (same tables the frontend reads) ──
        col_configs = _load_column_configs(db, workspace_id)

        # Step 1 configs: col1 with sort_order 0=text, 1=video, 2=file
        step1_configs: dict[str, dict] = {}
        for c in col_configs:
            if c["column_id"] == "col1":
                key = {0: "text", 1: "video", 2: "file"}.get(c["sort_order"], "")
                if key:
                    step1_configs[key] = {"prompt": c["prompt"] or "", "skill": c["skill"] or ""}

        # Step 2 configs: col2 with sort_order 3=sop, 4=dao, 5=yanxi
        step2_configs: dict[str, dict] = {}
        for c in col_configs:
            if c["column_id"] == "col2":
                key = {3: "sop", 4: "dao", 5: "yanxi"}.get(c["sort_order"], "")
                if key:
                    step2_configs[key] = {"prompt": c["prompt"] or "", "skill": c["skill"] or ""}

        # Step 4 configs: from speech_configs table
        speech_configs = _load_speech_configs(db, workspace_id)
        step4_configs: dict[str, dict] = {}
        for sc in speech_configs:
            key = {"文档演讲": "doc", "分析演讲": "analysis", "综合演讲": "comprehensive"}.get(sc["label"], "")
            if key:
                step4_configs[key] = {"prompt": sc["prompt"] or "", "skill": sc["skill"] or ""}

        # Step name → source key mapping
        _step2_to_source = {"sop": "step2_sop", "dao": "step2_daoshuyi", "yanxi": "step2_yanxi"}
        _step1_source_map = {"text": ("raw_text", "step1_text"), "video": ("raw_video", "step1_video"), "file": ("raw_file", "step1_file")}
        _step1_label = {"text": "整理文字", "video": "整理视频", "file": "整理文件"}

        # Get raw content map
        raw_rows = db.execute(
            "SELECT step_name, content FROM step_results WHERE project_id=? AND step_name IN ('raw_text','raw_video','raw_file')",
            (project_id,)
        ).fetchall()
        raw_content_map: dict[str, str] = {}
        for r in raw_rows:
            if r[1]:
                raw_content_map[r[0]] = r[1]

        # Get existing step1 content
        step1_rows = db.execute(
            "SELECT step_name, content FROM step_results WHERE project_id=? AND step_name IN ('step1_text','step1_video','step1_file')",
            (project_id,)
        ).fetchall()
        step1_content_map: dict[str, str] = {}
        for r in step1_rows:
            if r[1]:
                step1_content_map[r[0]] = r[1]

        # Build combined source text for Step 2 (prefer step1 over raw)
        def _build_source_text():
            parts = []
            for raw_key, step1_key in _step1_source_map.values():
                content = step1_content_map.get(step1_key) or raw_content_map.get(raw_key, "")
                if content:
                    parts.append(content)
            return "\n\n".join(parts)

        raw_text = _build_source_text()

        # ── Step 1: Material Processing ──
        step1_subs: list[str] = []
        for s in steps_list:
            if s[0] == "1":
                step1_subs = s[1]
                break

        if step1_subs:
            _log(item, "开始第一步·素材整理")

            for sub in step1_subs:
                cfg = step1_configs.get(sub, {})
                prompt = cfg.get("prompt") or "请将用户输入的内容整理为标准文档格式。"
                skill = cfg.get("skill") or ""
                raw_key, step1_key = _step1_source_map[sub]
                raw_content = raw_content_map.get(raw_key, "")
                label = _step1_label.get(sub, sub)

                existing = step1_content_map.get(step1_key, "")
                if existing:
                    _log(item, f"  {label} 已有结果，跳过")
                    continue

                if not raw_content:
                    _log(item, f"  无原始素材({sub})，跳过{label}")
                    continue

                # Per-source model: _model_s1_text, _model_s1_video, _model_s1_file
                s1_model_key = f"_model_s1_{sub}"
                provider_id, model = _get_provider_model(db, workspace_id, s1_model_key)
                if not provider_id or not model:
                    provider_id, model = _get_provider_model(db, workspace_id)

                if not provider_id or not model:
                    _log(item, f"  缺少 LLM 配置，跳过: {label}")
                    continue

                _log(item, f"  正在{label}")
                try:
                    user_message = f"请将以下内容按指定格式整理：\n\n{raw_content}\n\n输出格式要求：\n{skill}" if skill else raw_content
                    result = await generate(
                        provider_id=provider_id, model=model,
                        system_prompt=prompt, user_message=user_message, temperature=0.7,
                    )
                    db.execute(
                        "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                        (project_id, step1_key, result, "markdown"))
                    db.commit()
                    step1_content_map[step1_key] = result
                    _log(item, f"  ✓ {label} 完成 ({len(result)}字)")
                except Exception as e:
                    _log(item, f"  ✗ {label} 失败: {e}")
                    raise

            raw_text = _build_source_text()
            _log(item, "第一步完成")
        else:
            _log(item, "未选择第一步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ── Step 2: Document Generation ──
        step2_subs_flat: list[str] = []
        for s in steps_list:
            if s[0] == "2":
                step2_subs_flat = s[1]
                break

        step2_results: dict[str, str] = {}

        if step2_subs_flat and raw_text:
            _log(item, "开始第二步·文档生成")

            for sub in step2_subs_flat:
                cfg = step2_configs.get(sub, {})
                prompt = cfg.get("prompt") or "你是一个专业的内容创作助手。"
                skill = cfg.get("skill") or ""

                step_name_map = {"sop": "step2_sop", "dao": "step2_daoshuyi", "yanxi": "step2_yanxi"}
                step_name = step_name_map.get(sub, f"step2_{sub}")
                label_map = {"sop": "标准文档", "dao": "分析文档", "yanxi": "综合文档"}
                label = label_map.get(sub, sub)

                existing = db.execute(
                    "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                    (project_id, step_name)
                ).fetchone()
                if existing and existing[0]:
                    _log(item, f"  {label} 已有结果，跳过")
                    step2_results[sub] = existing[0]
                    continue

                # Get model for this sub
                model_key = f"_model_s2_{sub}"
                provider_id, model = _get_provider_model(db, workspace_id, model_key)
                if not provider_id or not model:
                    provider_id, model = _get_provider_model(db, workspace_id)

                if not provider_id or not model:
                    _log(item, f"  缺少 LLM 配置，跳过: {label}")
                    continue

                _log(item, f"  正在生成: {label}")
                try:
                    user_message = f"请将以下内容按指定格式整理：\n\n{raw_text}\n\n输出格式要求：\n{skill}" if skill else raw_text
                    result = await generate(
                        provider_id=provider_id, model=model,
                        system_prompt=prompt, user_message=user_message, temperature=0.7,
                    )
                    db.execute(
                        "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                        (project_id, step_name, result, "markdown"))
                    db.commit()
                    step2_results[sub] = result
                    _log(item, f"  ✓ {label} 生成完成 ({len(result)}字)")
                except Exception as e:
                    _log(item, f"  ✗ {label} 生成失败: {e}")
                    raise

            _log(item, "第二步完成")
        elif step2_subs_flat and not raw_text:
            _log(item, "无素材内容，跳过第二步")
        else:
            _log(item, "未选择第二步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ── Step 3: PPT/HTML Generation ──
        step3_subs_flat: list[str] = []
        for s in steps_list:
            if s[0] == "3":
                step3_subs_flat = s[1]
                break

        if step3_subs_flat:
            _log(item, "开始第三步·课件输出")

            _step3_map = {
                "doc-ppt": {"col": "col3", "step2": "sop", "step_name": "step3_sop_doc", "label": "文档课件", "stage_type": "sop"},
                "analysis-ppt": {"col": "col4", "step2": "dao", "step_name": "step3_dao_ppt", "label": "分析PPT", "stage_type": "daoPpt"},
                "comprehensive-ppt": {"col": "col5", "step2": "yanxi", "step_name": "step3_yan_ppt", "label": "综合PPT", "stage_type": "yanxiPpt"},
            }

            for sub in step3_subs_flat:
                info = _step3_map.get(sub)
                if not info:
                    _log(item, f"  未知子步骤: {sub}，跳过")
                    continue

                # Get source from corresponding Step 2 document
                step2_sub = info["step2"]
                source_content = step2_results.get(step2_sub) or ""
                if not source_content:
                    source_content = db.execute(
                        "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                        (project_id, f"step2_{step2_sub}")
                    ).fetchone()
                    source_content = source_content[0] if source_content else ""

                if not source_content:
                    _log(item, f"  {info['label']} 缺少源文档(step2_{step2_sub})，跳过")
                    continue

                # Get prompt/skill from column_configs col3/col4/col5
                col_prompt = ""
                col_skill = ""
                for c in col_configs:
                    if c["column_id"] == info["col"]:
                        col_prompt = c["prompt"] or ""
                        col_skill = c["skill"] or ""
                        break

                # Get model for this step3 sub (keys match frontend: _model_step3_sop, _model_step3_dao_ppt, _model_step3_yan_ppt)
                _step3_model_keys = {"sop": "_model_step3_sop", "daoPpt": "_model_step3_dao_ppt", "yanxiPpt": "_model_step3_yan_ppt"}
                model_key = _step3_model_keys.get(info["stage_type"], "_model_step3_sop")
                provider_id, model = _get_provider_model(db, workspace_id, model_key)
                if not provider_id or not model:
                    provider_id, model = _get_provider_model(db, workspace_id)

                if not provider_id or not model:
                    _log(item, f"  缺少 LLM 配置，跳过: {info['label']}")
                    continue

                # Check existing
                existing = db.execute(
                    "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                    (project_id, info["step_name"])
                ).fetchone()
                if existing and existing[0]:
                    _log(item, f"  {info['label']} 已有结果，跳过")
                    continue

                _log(item, f"  正在生成: {info['label']}")

                try:
                    # Find a style template
                    tmpl_row = db.execute(
                        "SELECT id FROM templates WHERE type='style' AND enabled=1 ORDER BY is_default DESC LIMIT 1"
                    ).fetchone()
                    template_id = tmpl_row[0] if tmpl_row else None

                    if template_id:
                        from services.ppt_service import _generate_outline_only, generate_ppt

                        # Load template rules for outline generation
                        rules = {}
                        tmpl_rules_row = db.execute(
                            "SELECT rules FROM templates WHERE id=?", (template_id,)
                        ).fetchone()
                        if tmpl_rules_row and tmpl_rules_row[0]:
                            try:
                                template_rules = json.loads(tmpl_rules_row[0])
                                for key in ("style_id", "layout_types", "page_rhythm", "design_principles"):
                                    if key in template_rules:
                                        rules[key] = template_rules[key]
                            except Exception:
                                pass

                        # Generate outline
                        _log(item, f"    生成大纲中...")
                        outline_json, outline_text = _generate_outline_only(
                            provider_id, model, rules, source_content,
                            system_prompt=col_prompt, skill_template=col_skill,
                            temperature=0.3, project_id=project_id, column_id=info["col"],
                        )

                        if outline_json:
                            db.execute(
                                "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                                (project_id, info["step_name"], outline_text or "", "markdown"))
                            db.execute(
                                "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                                (project_id, f"_ppt_outline_json_{info['step_name']}", json.dumps(outline_json, ensure_ascii=False), "json"))
                            db.commit()
                            _log(item, f"    大纲已生成: {len(outline_json)} 页")

                            # Generate PPT
                            _log(item, f"    生成PPT中...")
                            from database import get_db as _get_db
                            output_dir = None
                            try:
                                from app import resolve_project_storage
                                output_dir = resolve_project_storage(project_id)
                            except Exception:
                                pass

                            filepath, generated_slides = generate_ppt(
                                source_content, template_id, None, output_dir,
                                provider_id, model, outline_json,
                                project_name=proj.get("name", ""),
                                column_id=info["col"],
                                color_scheme="deep-blue", temperature=0.3,
                                project_id=project_id,
                            )

                            if generated_slides is not None:
                                plan_data = {
                                    "slides": generated_slides,
                                    "filename": filepath or "",
                                    "templateId": template_id,
                                    "format": "svg",
                                }
                                db.execute(
                                    "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                                    (project_id, f"_ppt_plan_{info['step_name']}", json.dumps(plan_data, ensure_ascii=False), "json"))
                                db.commit()
                                _log(item, f"  ✓ {info['label']} 生成完成 ({len(generated_slides)} 页)")
                            else:
                                _log(item, f"  ✓ {info['label']} 大纲已生成 (无slide_plan)")
                        else:
                            _log(item, f"  ✗ {info['label']} 大纲生成失败：返回为空")
                            raise Exception(f"{info['label']} 大纲生成失败")
                    else:
                        # No template — generate as markdown fallback
                        _log(item, f"    无PPT模板，使用文本生成")
                        result = await generate(
                            provider_id=provider_id, model=model,
                            system_prompt=col_prompt or "你是一个专业的PPT课件设计师。",
                            user_message=f"请根据以下内容生成一份PPT课件。\n\n内容素材：\n{source_content[:8000]}\n\n请生成适合PPT展示的结构化内容。",
                            temperature=0.7,
                        )
                        db.execute(
                            "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                            (project_id, info["step_name"], result, "markdown"))
                        db.commit()
                        _log(item, f"  ✓ {info['label']} 生成完成 ({len(result)}字)")

                except Exception as e:
                    _log(item, f"  ✗ {info['label']} 生成失败: {e}")
                    raise

            _log(item, "第三步完成")
        else:
            _log(item, "未选择第三步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ── Step 4: Speech Generation ──
        step4_entries = [s for s in steps_list if s[0] == "4"]

        if step4_entries:
            _log(item, "开始第四步·演讲课件")

            for entry in step4_entries:
                source_sub = entry[1]   # "sop" | "dao" | "yanxi"
                subs = entry[2]          # ["speech-script"]

                step2_name = _step2_to_source.get(source_sub, "step2_sop")
                step2_row = db.execute(
                    "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                    (project_id, step2_name)
                ).fetchone()
                speech_source = step2_row[0] if step2_row else raw_text

                source_label = {"sop": "文档演讲", "dao": "分析演讲", "yanxi": "综合演讲"}.get(source_sub, source_sub)
                _log(item, f"  演讲来源: {source_label}")

                # Map source_sub to speech_config key
                speech_key = {"sop": "doc", "dao": "analysis", "yanxi": "comprehensive"}.get(source_sub, "doc")
                cfg = step4_configs.get(speech_key, {})
                prompt = cfg.get("prompt") or "请根据以下内容生成演讲稿，风格亲切自然。"
                skill = cfg.get("skill") or ""

                # Map source to speech step name (matching ProjectPage.tsx)
                _step4_speech_names = {"sop": "step4_speech_doc", "dao": "step4_speech_analysis", "yanxi": "step4_speech_comprehensive"}
                step4_speech_name = _step4_speech_names.get(source_sub, "step4_speech_doc")

                for sub in subs:
                    if sub == "speech-script":
                        label = "演讲文案"

                        existing = db.execute(
                            "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                            (project_id, step4_speech_name)
                        ).fetchone()
                        if existing and existing[0]:
                            _log(item, f"  {label} 已有结果，跳过")
                            continue

                        # Get model for Step 4
                        model_key = f"_model_s4_speech_{speech_key}"
                        provider_id, model = _get_provider_model(db, workspace_id, model_key)
                        if not provider_id or not model:
                            provider_id, model = _get_provider_model(db, workspace_id)

                        if not provider_id or not model:
                            _log(item, f"  缺少 LLM 配置，跳过: {label}")
                            continue

                        _log(item, f"  正在生成: {label}")
                        try:
                            user_message = f"请将以下内容按指定格式生成演讲稿：\n\n{speech_source[:6000]}\n\n输出格式要求：\n{skill}" if skill else speech_source[:6000]
                            result = await generate(
                                provider_id=provider_id, model=model,
                                system_prompt=prompt, user_message=user_message, temperature=0.7,
                            )
                            db.execute(
                                "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                                (project_id, step4_speech_name, result, "markdown"))
                            db.commit()
                            speech_source = result
                            _log(item, f"  ✓ {label} 生成完成 ({len(result)}字)")
                        except Exception as e:
                            _log(item, f"  ✗ {label} 生成失败: {e}")
                            raise

            _log(item, "第四步完成")
        else:
            _log(item, "未选择第四步，跳过")

    finally:
        db.close()


def _log(item: dict, msg: str):
    ts = _now().strftime("%H:%M:%S")
    item.setdefault("logs", []).append(f"[{ts}] {msg}")


def _update_db(job: BatchJob):
    try:
        from database import get_db
        db = get_db()
        try:
            existing = db.execute("SELECT id FROM batch_jobs WHERE id=?", (job.batch_id,)).fetchone()
            if existing:
                db.execute(
                    "UPDATE batch_jobs SET status=?, completed_count=?, failed_count=? WHERE id=?",
                    (job.status, job.completed_count, job.failed_count, job.batch_id))
            else:
                db.execute(
                    "INSERT INTO batch_jobs (id, workspace_id, start_time, end_time, status, total_count, completed_count, failed_count) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (job.batch_id, job.workspace_id, job.start_time, job.end_time, job.status,
                     job.total_count, job.completed_count, job.failed_count))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


def _update_item_db(batch_id: str, item: dict):
    try:
        from database import get_db
        db = get_db()
        try:
            existing = db.execute(
                "SELECT id FROM batch_job_items WHERE batch_id=? AND project_id=?",
                (batch_id, item["project_id"])
            ).fetchone()
            steps_json = json.dumps(item.get("steps", []), ensure_ascii=False)
            logs_json = json.dumps(item.get("logs", []), ensure_ascii=False)
            if existing:
                db.execute(
                    "UPDATE batch_job_items SET status=?, logs=?, finished_at=? WHERE batch_id=? AND project_id=?",
                    (item["status"], logs_json, _now().isoformat(), batch_id, item["project_id"]))
            else:
                db.execute(
                    "INSERT INTO batch_job_items (batch_id, project_id, steps, status, logs) VALUES (?,?,?,?,?)",
                    (batch_id, item["project_id"], steps_json, item["status"], logs_json))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


def get_batch_status(batch_id: str) -> dict | None:
    with _batch_lock:
        job = _active_batches.get(batch_id)
        if job:
            return job.to_dict()
    try:
        from database import get_db
        db = get_db()
        try:
            row = db.execute("SELECT * FROM batch_jobs WHERE id=?", (batch_id,)).fetchone()
            if not row:
                return None
            row = dict(row)
            items_rows = db.execute(
                "SELECT * FROM batch_job_items WHERE batch_id=? ORDER BY id", (batch_id,)
            ).fetchall()
            items = []
            for it in items_rows:
                it = dict(it)
                try:
                    it["steps"] = json.loads(it.get("steps", "[]"))
                except Exception:
                    it["steps"] = []
                try:
                    it["logs"] = json.loads(it.get("logs", "[]"))
                except Exception:
                    it["logs"] = []
                items.append(it)
            row["items"] = items
            return row
        finally:
            db.close()
    except Exception:
        return None


def cancel_batch(batch_id: str) -> bool:
    with _batch_lock:
        job = _active_batches.get(batch_id)
        if job and job.status in ("pending", "running"):
            job._stop_flag.set()
            if job.status == "pending":
                job.status = "cancelled"
                _update_db(job)
            return True
    return False
