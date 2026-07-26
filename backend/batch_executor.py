"""
Batch Executor — background thread that processes project generation steps
within a time window. One at a time, sequentially.
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
        self.status = "pending"  # pending / running / completed / stopped / cancelled
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
    """Create and start a batch job. Returns the job object."""
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
    """Main execution loop: wait for start time, then process items sequentially."""
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

    # Create event loop in this thread for async LLM calls
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


# Sub-step → project_item column_id / name mapping
_STEP2_SUB_MAP = {
    "sop": {"col": "col1", "name_pat": "标准"},
    "dao": {"col": "col2", "name_pat": "分析"},
    "yanxi": {"col": "col3", "name_pat": "综合"},
}

_STEP3_SUB_MAP = {
    "doc-ppt": {"col": "col3", "name_pat": "文档课件"},
    "analysis-ppt": {"col": "col4", "name_pat": "分析PPT"},
    "comprehensive-ppt": {"col": "col5", "name_pat": "综合PPT"},
}

_STEP4_SUB_MAP = {
    "speech-script": {"name_pat": "演讲文案"},
    "speech-tts": {"name_pat": "演讲口播"},
}


def _find_item(items: list[dict], info: dict) -> dict | None:
    """Find a project_item by column_id first, then by name pattern."""
    col_id = info.get("col", "")
    name_pat = info.get("name_pat", "")
    for it in items:
        name = it.get("name", "")
        # Column-based lookup: our items have column_id embedded in id like pi-xxx-col1
        if col_id and col_id in it.get("id", ""):
            return it
    # Fallback: name pattern
    for it in items:
        if name_pat and name_pat in it.get("name", ""):
            return it
    return None


def _get_provider_model(db, workspace_id: str, items: list[dict]) -> tuple:
    """Get provider_id and model from workspace settings, falling back to first enabled."""
    # Check step_results for saved model settings
    provider_id = ""
    model = ""
    try:
        row = db.execute(
            "SELECT content FROM step_results WHERE project_id IN "
            "(SELECT id FROM projects WHERE workspace_id=?) AND step_name='_model_s2_sop' LIMIT 1",
            (workspace_id,)
        ).fetchone()
        if row:
            model = row[0]
    except Exception:
        pass

    if not model:
        row = db.execute(
            "SELECT model FROM llm_providers WHERE is_enabled=1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row:
            model = row[0]

    if not provider_id:
        row = db.execute(
            "SELECT id FROM llm_providers WHERE is_enabled=1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row:
            provider_id = row[0]

    return provider_id, model


async def _execute_project(item: dict, job: BatchJob):
    """Execute selected steps for a single project using LLM generation."""
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

        # Get project items
        pitems = db.execute(
            "SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order", (project_id,)
        ).fetchall()
        pitems = [dict(it) for it in pitems]

        provider_id, model = _get_provider_model(db, workspace_id, pitems)
        if not provider_id or not model:
            _log(item, "  注意: 未找到启用的 LLM 提供商，使用默认设置")

        # Determine which step1 data sources to use (filter by selected sub)
        step1_subs_flat: list[str] = []
        for s in steps_list:
            if s[0] == "1":
                step1_subs_flat = s[1]  # e.g. ["text"] or ["video"]
                break
        _step1_source_map = {"text": "raw_text", "video": "raw_video", "file": "raw_file"}
        step1_source_names = [_step1_source_map[sub] for sub in step1_subs_flat if sub in _step1_source_map]

        # Get raw content filtered by selected source type
        if step1_source_names:
            placeholders = ",".join(["?" for _ in step1_source_names])
            raw_rows = db.execute(
                f"SELECT content FROM step_results WHERE project_id=? AND step_name IN ({placeholders})",
                [project_id] + step1_source_names
            ).fetchall()
        else:
            raw_rows = db.execute(
                "SELECT content FROM step_results WHERE project_id=? AND step_name IN ('raw_text','raw_video','raw_file')",
                (project_id,)
            ).fetchall()
        raw_text = "\n\n".join([r[0] for r in raw_rows if r[0]])

        # ── Step 1: Material Processing ──
        if step1_subs_flat:
            _log(item, "开始第一步·素材处理")
            if not raw_text:
                _log(item, "  无素材内容，跳过第一步")
            else:
                for sub in step1_subs_flat:
                    _log(item, f"  素材类型: {sub}")
                _log(item, "第一步完成")
        else:
            _log(item, "未选择第一步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ── Step 2: Document Generation ──
        step2_subs = [s[1] for s in steps_list if s[0] == "2"]
        step2_results = {}

        if step2_subs and raw_text:
            _log(item, "开始第二步·文档生成")
            for sub_group in step2_subs:
                for sub in sub_group:
                    info = _STEP2_SUB_MAP.get(sub)
                    if not info:
                        _log(item, f"  未知子步骤: {sub}，跳过")
                        continue

                    pi = _find_item(pitems, info)
                    prompt_text = pi.get("prompt", "") if pi else ""
                    item_name = pi.get("name", info.get("name_pat", sub)) if pi else info.get("name_pat", sub)

                    if not provider_id or not model:
                        _log(item, f"  缺少 LLM 配置，跳过: {item_name}")
                        continue

                    _log(item, f"  正在生成: {item_name}")
                    try:
                        system_prompt = prompt_text or "你是一个专业的内容创作助手。"
                        user_message = f"""请根据以下素材内容，生成一份完整的文档。

素材内容：
{raw_text}

请生成结构清晰、内容丰富的文档。"""
                        result = await generate(
                            provider_id=provider_id,
                            model=model,
                            system_prompt=system_prompt,
                            user_message=user_message,
                            temperature=0.7,
                        )

                        # Determine step_name
                        if sub == "sop":
                            step_name = "step2_sop"
                        elif sub == "dao":
                            step_name = "step2_daoshuyi"
                        elif sub == "yanxi":
                            step_name = "step2_yanxi"
                        else:
                            step_name = f"step2_{sub}"

                        # Save to step_results
                        db.execute(
                            "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) "
                            "VALUES (?, ?, ?, ?)",
                            (project_id, step_name, result, "markdown"))
                        db.commit()
                        step2_results[sub] = result
                        _log(item, f"  ✓ {item_name} 生成完成 ({len(result)}字)")
                    except Exception as e:
                        _log(item, f"  ✗ {item_name} 生成失败: {e}")
                        raise

            _log(item, "第二步完成")
        elif step2_subs and not raw_text:
            _log(item, "无素材内容，跳过第二步")
        else:
            _log(item, "未选择第二步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ── Step 3: PPT/HTML Generation ──
        step3_subs = [s[1] for s in steps_list if s[0] == "3"]

        if step3_subs and raw_text:
            _log(item, "开始第三步·课件输出")

            # Build context from step2 results
            s2_context = ""
            for k, v in step2_results.items():
                s2_context += f"\n\n=== {k} ===\n{v[:2000]}"
            context = raw_text + s2_context

            for sub_group in step3_subs:
                for sub in sub_group:
                    info = _STEP3_SUB_MAP.get(sub)
                    if not info:
                        _log(item, f"  未知子步骤: {sub}，跳过")
                        continue

                    pi = _find_item(pitems, info)
                    prompt_text = pi.get("prompt", "") if pi else ""
                    item_name = pi.get("name", info.get("name_pat", sub)) if pi else info.get("name_pat", sub)

                    if not provider_id or not model:
                        _log(item, f"  缺少 LLM 配置，跳过: {item_name}")
                        continue

                    _log(item, f"  正在生成: {item_name}")
                    try:
                        system_prompt = prompt_text or "你是一个专业的PPT课件设计师。"
                        user_message = f"""请根据以下内容生成一份PPT课件。

内容素材：
{context[:8000]}

请生成适合PPT展示的结构化内容，包括标题页、目录、各章节内容和总结页。"""
                        result = await generate(
                            provider_id=provider_id,
                            model=model,
                            system_prompt=system_prompt,
                            user_message=user_message,
                            temperature=0.7,
                        )

                        # Determine step_name
                        if sub == "doc-ppt":
                            step_name = "step3_col1"
                        elif sub == "analysis-ppt":
                            step_name = "step3_col2"
                        elif sub == "comprehensive-ppt":
                            step_name = "step3_col3"
                        else:
                            step_name = f"step3_{sub}"

                        db.execute(
                            "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) "
                            "VALUES (?, ?, ?, ?)",
                            (project_id, step_name, result, "markdown"))
                        db.commit()
                        _log(item, f"  ✓ {item_name} 生成完成 ({len(result)}字)")
                    except Exception as e:
                        _log(item, f"  ✗ {item_name} 生成失败: {e}")
                        raise

            _log(item, "第三步完成")
        elif step3_subs and not raw_text:
            _log(item, "无素材内容，跳过第三步")
        else:
            _log(item, "未选择第三步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ── Step 4: Speech Generation ──
        # Payload format: ["4", sourceSub, [subs]]
        #   sourceSub: "doc-ppt" | "analysis-ppt" | "comprehensive-ppt"
        #   subs: ["speech-script"] or ["speech-script", "speech-tts"]
        step4_entries = [s for s in steps_list if s[0] == "4"]
        _step3_to_source = {"doc-ppt": "step3_col1", "analysis-ppt": "step3_col2", "comprehensive-ppt": "step3_col3"}

        if step4_entries:
            _log(item, "开始第四步·演讲课件")

            for entry in step4_entries:
                source_sub = entry[1]   # e.g. "doc-ppt"
                subs = entry[2]          # e.g. ["speech-script", "speech-tts"]

                # Fetch the corresponding Step 3 output as speech source
                step3_name = _step3_to_source.get(source_sub, "step3_col1")
                step3_row = db.execute(
                    "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                    (project_id, step3_name)
                ).fetchone()
                speech_source = step3_row[0] if step3_row else raw_text

                source_label = {"doc-ppt": "文档课件", "analysis-ppt": "分析PPT", "comprehensive-ppt": "综合PPT"}.get(source_sub, source_sub)
                _log(item, f"  演讲来源: {source_label}")

                for sub in subs:
                    if sub == "speech-script":
                        info = _STEP4_SUB_MAP.get(sub, {})
                        item_name = info.get("name_pat", "演讲文案")

                        if not provider_id or not model:
                            _log(item, f"  缺少 LLM 配置，跳过: {item_name}")
                            continue

                        _log(item, f"  正在生成: {item_name}")
                        try:
                            result = await generate(
                                provider_id=provider_id,
                                model=model,
                                system_prompt="你是一个专业的演讲稿撰写人。请生成适合口播的演讲文案，自然流畅，有感染力。",
                                user_message=f"""请根据以下内容，生成一份口播演讲文案：

{speech_source[:6000]}

要求：
1. 语言口语化，适合朗读
2. 段落分明，每段200-300字
3. 有开场白和结束语
4. 总字数控制在1500字以内""",
                                temperature=0.7,
                            )

                            db.execute(
                                "INSERT OR REPLACE INTO step_results (project_id, step_name, content, content_type) "
                                "VALUES (?, ?, ?, ?)",
                                (project_id, "step4_speech_script", result, "markdown"))
                            db.commit()
                            speech_source = result  # Chain to TTS if selected
                            _log(item, f"  ✓ {item_name} 生成完成 ({len(result)}字)")
                        except Exception as e:
                            _log(item, f"  ✗ {item_name} 生成失败: {e}")
                            raise

                    elif sub == "speech-tts":
                        _log(item, f"  演讲口播: TTS 合成需前端交互，已标记")

            _log(item, "第四步完成")
        else:
            _log(item, "未选择第四步，跳过")

    finally:
        db.close()


def _log(item: dict, msg: str):
    ts = _now().strftime("%H:%M:%S")
    item.setdefault("logs", []).append(f"[{ts}] {msg}")


def _update_db(job: BatchJob):
    """Persist batch job status to database."""
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
    """Persist batch item status to database."""
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
    """Get current status of a batch job."""
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
    """Cancel a pending batch."""
    with _batch_lock:
        job = _active_batches.get(batch_id)
        if job and job.status in ("pending", "running"):
            job._stop_flag.set()
            if job.status == "pending":
                job.status = "cancelled"
                _update_db(job)
            return True
    return False
