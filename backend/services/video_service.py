"""Video download and subtitle extraction via yt-dlp."""
import os
import re
import json
import subprocess
import glob
import threading
import uuid
import requests

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_DIR = os.path.join(BASE_DIR, "data", "videos")
os.makedirs(VIDEO_DIR, exist_ok=True)

# Track download progress: {task_id: {"status": "downloading"|"done"|"error", "progress": 0-100, "message": ""}}
_progress = {}


def _find_yt_dlp():
    """Find yt-dlp executable. Install if not found."""
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        return "yt-dlp"
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    try:
        subprocess.run([r"C:\Program Files\yt-dlp\yt-dlp.exe", "--version"], capture_output=True, check=True)
        return r"C:\Program Files\yt-dlp\yt-dlp.exe"
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    raise RuntimeError(
        "yt-dlp 未安装。请运行: pip install yt-dlp\n"
        "或从 https://github.com/yt-dlp/yt-dlp/releases 下载"
    )


def _sanitize_filename(name: str) -> str:
    """Remove characters invalid for Windows/Unix filenames."""
    return re.sub(r'[\\/:*?"<>|]', '_', name).strip()


def _is_douyin_url(url: str) -> bool:
    return bool(re.search(r"douyin\.com|iesdouyin\.com", url))


def _extract_douyin_video_id(url: str) -> str:
    """Extract video ID from a Douyin URL."""
    patterns = [
        r"/video/(\d+)",
        r"/note/(\d+)",
        r"video/(\d+)",
        r"modal_id=(\d+)",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return ""


def _get_douyin_video_url(video_id: str) -> str:
    """Fetch video direct URL from Douyin mobile share page (no cookies needed)."""
    share_url = f"https://www.iesdouyin.com/share/video/{video_id}/"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/16.0 Mobile/15E148 Safari/604.1"
        ),
        "Referer": "https://www.douyin.com/",
    }
    r = requests.get(share_url, headers=headers, timeout=20)

    # Extract window._ROUTER_DATA from page
    prefix = "window._ROUTER_DATA = "
    start = r.text.find(prefix)
    if start < 0:
        raise RuntimeError("无法解析抖音页面，请确认链接有效")
    start += len(prefix)

    # Brace-match the JSON block
    depth = 0
    end = -1
    for i in range(start, len(r.text)):
        if r.text[i] == "{":
            depth += 1
        elif r.text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end < 0:
        raise RuntimeError("无法解析页面数据")

    data = json.loads(r.text[start:end])
    loader = data.get("loaderData", {})

    # Find the video data key (format: "video_(id)/page")
    video_data = None
    for k, v in loader.items():
        if "video" in k and "layout" not in k:
            video_data = v
            break

    if not video_data:
        raise RuntimeError("无法获取视频信息（页面数据为空）")

    item_list = video_data.get("videoInfoRes", {}).get("item_list", [])
    if not item_list:
        raise RuntimeError("无法提取视频信息列表")

    video = item_list[0].get("video", {})
    play_addr = video.get("play_addr", {}) or video.get("play", {})
    url_list = play_addr.get("url_list", [])
    if not url_list:
        raise RuntimeError("无法提取视频下载地址")

    return url_list[0].replace("playwm", "play")


def download_video(url: str, cookies_path: str = None, project_id: str = None, asr_model: str = "fun-asr", asr_provider_id: str = None) -> dict:
    """Start async download. Returns task_id for polling progress."""
    task_id = uuid.uuid4().hex[:8]
    _progress[task_id] = {"status": "starting", "progress": 0, "message": "准备下载...", "project_id": project_id}

    def _run():
        try:
            ytdlp = _find_yt_dlp()
            task_dir = os.path.join(VIDEO_DIR, task_id)
            os.makedirs(task_dir, exist_ok=True)

            _progress[task_id] = {"status": "downloading", "progress": 10, "message": "正在下载视频..."}

            # Douyin: resolve direct URL from mobile share page (no cookies needed)
            download_url = url
            if _is_douyin_url(url):
                video_id = _extract_douyin_video_id(url)
                if video_id:
                    _progress[task_id]["message"] = "解析抖音视频地址..."
                    try:
                        download_url = _get_douyin_video_url(video_id)
                    except Exception as e:
                        _progress[task_id]["message"] = f"直链解析失败，尝试常规下载: {e}"
                        # Fall through to standard yt-dlp with cookie fallback

            base_cmd = [
                ytdlp,
                download_url,
                "-o", os.path.join(task_dir, "%(title)s.%(ext)s"),
                "--write-subs",
                "--write-auto-subs",
                "--sub-lang", "zh-Hans,zh-CN,zh,en",
                "--convert-subs", "srt",
                "--no-playlist",
                "--no-warnings",
            ]
            result = subprocess.run(base_cmd, capture_output=True, text=True, timeout=300, cwd=task_dir)

            # If cookies needed, try all common browsers
            if result.returncode != 0 and "cookie" in (result.stderr or "").lower():
                browsers = ("chrome", "edge", "chromium", "firefox", "opera", "brave", "vivaldi")
                for browser in browsers:
                    _progress[task_id]["message"] = f"尝试 {browser} cookies..."
                    attempt = base_cmd + ["--cookies-from-browser", browser]
                    result = subprocess.run(attempt, capture_output=True, text=True, timeout=300, cwd=task_dir)
                    if result.returncode == 0:
                        break

            if result.returncode != 0:
                err_msg = result.stderr[:300] if result.stderr else "未知错误"
                if "cookie" in err_msg.lower():
                    err_msg = "需要抖音登录态。请使用 Chrome 或 Edge 浏览器登录 douyin.com 后重试。"
                _progress[task_id] = {"status": "error", "progress": 0, "message": f"下载失败: {err_msg}"}
                return

            _progress[task_id] = {"status": "processing", "progress": 60, "message": "查找文件..."}

            # Find video file and subtitle file
            video_files = glob.glob(os.path.join(task_dir, "*.*"))
            video_path = ""
            subtitle_path = ""
            subtitle_text = ""

            for f in video_files:
                ext = os.path.splitext(f)[1].lower()
                if ext in (".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv"):
                    video_path = f
                elif ext in (".srt", ".vtt", ".ass"):
                    subtitle_path = f

            # Step 1: Extract embedded subtitles if present → save subtitles.txt
            if subtitle_path:
                _progress[task_id] = {"status": "processing", "progress": 65, "message": "解析内嵌字幕..."}
                subtitle_text = _parse_subtitle(subtitle_path)
                if subtitle_text:
                    sub_txt_path = os.path.join(task_dir, "subtitles.txt")
                    with open(sub_txt_path, "w", encoding="utf-8") as f:
                        f.write(subtitle_text)

            # Step 2: Always run ASR transcription → save transcription.txt
            asr_text = ""
            if video_path:
                _progress[task_id] = {"status": "processing", "progress": 75, "message": "语音识别中..."}
                asr_text = _transcribe_audio(video_path, task_dir, asr_model, asr_provider_id)
                if asr_text and not asr_text.startswith("["):
                    asr_txt_path = os.path.join(task_dir, "transcription.txt")
                    with open(asr_txt_path, "w", encoding="utf-8") as f:
                        f.write(asr_text)

            # Step 3: If both exist, LLM cross-validation merge → save merged.txt
            merged_text = ""
            if subtitle_text and asr_text:
                _progress[task_id] = {"status": "processing", "progress": 90, "message": "字幕+语音交叉验证中..."}
                merged_text = _merge_texts_with_llm(subtitle_text, asr_text)
                if merged_text:
                    merged_txt_path = os.path.join(task_dir, "merged.txt")
                    with open(merged_txt_path, "w", encoding="utf-8") as f:
                        f.write(merged_text)

            # Rename video to project name and copy to project folder if requested
            if project_id and video_path:
                try:
                    import sqlite3
                    import shutil
                    db_dir = os.path.join(BASE_DIR, "data")
                    db = sqlite3.connect(os.path.join(db_dir, "yishao.db"))
                    db.row_factory = sqlite3.Row
                    proj = db.execute(
                        "SELECT name, storage_path FROM projects WHERE id = ?",
                        (project_id,)
                    ).fetchone()
                    db.close()
                    if proj:
                        ext = os.path.splitext(video_path)[1] or ".mp4"
                        # Rename in task_dir to project name
                        proj_name = _sanitize_filename(proj["name"])
                        new_name = proj_name + ext
                        new_path = os.path.join(task_dir, new_name)
                        if os.path.exists(new_path):
                            os.remove(new_path)
                        os.rename(video_path, new_path)
                        video_path = new_path
                        # Copy to project storage folder
                        if proj["storage_path"]:
                            dest = os.path.join(proj["storage_path"], new_name)
                            if os.path.exists(dest):
                                os.remove(dest)
                            shutil.copy2(video_path, dest)
                            video_path = dest
                except Exception:
                    import traceback
                    traceback.print_exc()

            _progress[task_id] = {
                "status": "done",
                "progress": 100,
                "message": "完成",
                "video_path": video_path,
                "subtitle_path": subtitle_path,
                "subtitle_text": subtitle_text,
                "asr_text": asr_text,
                "merged_text": merged_text,
                "task_dir": task_dir,
            }
        except subprocess.TimeoutExpired:
            _progress[task_id] = {"status": "error", "progress": 0, "message": "下载超时（5分钟）"}
        except Exception as e:
            _progress[task_id] = {"status": "error", "progress": 0, "message": str(e)}

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return {"task_id": task_id}


def get_progress(task_id: str) -> dict:
    """Poll download progress."""
    if task_id not in _progress:
        return {"status": "not_found", "message": "任务不存在"}
    return _progress[task_id]


def _parse_subtitle(subtitle_path: str) -> str:
    """Parse SRT/VTT subtitle file to plain text."""
    import re
    try:
        with open(subtitle_path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(subtitle_path, "r", encoding="gbk") as f:
            content = f.read()

    # Remove SRT numbers and timestamps
    lines = content.split("\n")
    text_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if re.match(r"^\d+$", line):  # SRT number
            continue
        if re.match(r"^\d{2}:\d{2}:", line):  # Timestamp
            continue
        if line.startswith("WEBVTT") or line.startswith("Kind:"):
            continue
        text_lines.append(line)

    return "\n".join(text_lines)


def _transcribe_audio(video_path: str, task_dir: str, asr_model: str = "fun-asr", asr_provider_id: str = None) -> str:
    """Transcribe video audio using configured ASR provider.

    Two paths:
      - Compatible mode (qwen3-asr-flash): base64 upload, fast synchronous HTTP
      - Async file transcription (fun-asr, paraformer-v2, etc.): upload file → OSS URL → async task → poll → download result
    """
    import sqlite3
    import base64
    import time

    ffmpeg_path = os.path.join(BASE_DIR, "ffmpeg.exe")
    if not os.path.exists(ffmpeg_path):
        return "[语音识别失败: ffmpeg 未安装]"

    # Resolve ASR provider config
    db_dir = os.path.join(BASE_DIR, "data")
    db_path = os.path.join(db_dir, "yishao.db")
    asr_api_key = ""
    asr_base_url = "https://dashscope.aliyuncs.com"

    if os.path.exists(db_path):
        try:
            db = sqlite3.connect(db_path)
            db.row_factory = sqlite3.Row
            if asr_provider_id:
                row = db.execute(
                    "SELECT * FROM asr_providers WHERE id = ? AND is_enabled = 1",
                    (asr_provider_id,)
                ).fetchone()
            else:
                row = db.execute(
                    "SELECT * FROM asr_providers WHERE is_enabled = 1 ORDER BY is_default DESC LIMIT 1"
                ).fetchone()
            db.close()
            if row:
                asr_api_key = row["api_key"] or ""
                asr_base_url = (row["base_url"] or "https://dashscope.aliyuncs.com").rstrip("/")
        except Exception:
            pass

    if not asr_api_key:
        return "[语音识别失败: 未配置 ASR 提供商，请在项目设置中添加 ASR 提供商]"

    # Extract audio to MP3 (16kHz mono 64kbps)
    mp3_path = os.path.join(task_dir, "_asr_audio.mp3")
    extract_cmd = [
        ffmpeg_path, "-y", "-i", video_path,
        "-ar", "16000", "-ac", "1", "-b:a", "64k",
        "-f", "mp3", mp3_path
    ]
    result = subprocess.run(extract_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return f"[音频提取失败: {result.stderr[:200]}]"

    try:
        # --- Path A: Compatible mode (try first) ---
        with open(mp3_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode()
        data_uri = f"data:audio/mpeg;base64,{audio_b64}"

        compat_url = f"{asr_base_url}/compatible-mode/v1/chat/completions"
        resp = requests.post(
            compat_url,
            headers={"Authorization": f"Bearer {asr_api_key}", "Content-Type": "application/json"},
            json={
                "model": asr_model,
                "messages": [{"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": data_uri}}]}],
                "stream": False,
            },
            timeout=120,
        )
        if resp.status_code == 200:
            result_json = resp.json()
            text = result_json.get("choices", [{}])[0].get("message", {}).get("content", "")
            if text:
                txt_path = os.path.join(task_dir, "transcription.txt")
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(text)
                return text

        # If compatible mode returns anything other than "model not supported", it's a real error
        err_json = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        err_data = err_json.get("error", err_json)
        err_code = err_data.get("code", "")
        if err_code != "model_not_supported" and "Unsupported model" not in err_data.get("message", ""):
            return f"[语音识别API失败: {resp.text[:300]}]"

        # --- Path B: Async file transcription for non-realtime models ---
        # 1. Upload file to provider's Files API
        with open(mp3_path, "rb") as f:
            upload_resp = requests.post(
                f"{asr_base_url}/api/v1/files",
                headers={"Authorization": f"Bearer {asr_api_key}"},
                files={"file": ("audio.mp3", f, "audio/mpeg")},
                timeout=30,
            )
        if upload_resp.status_code != 200:
            return f"[文件上传失败: {upload_resp.text[:300]}]"
        file_id = upload_resp.json()["data"]["uploaded_files"][0]["file_id"]

        # 2. Get OSS URL from file metadata
        meta_resp = requests.get(
            f"{asr_base_url}/api/v1/files/{file_id}",
            headers={"Authorization": f"Bearer {asr_api_key}"},
            timeout=30,
        )
        if meta_resp.status_code != 200:
            return f"[获取文件URL失败: {meta_resp.text[:300]}]"
        oss_url = meta_resp.json()["data"]["url"]

        # 3. Submit async transcription task
        task_resp = requests.post(
            f"{asr_base_url}/api/v1/services/audio/asr/transcription",
            headers={
                "Authorization": f"Bearer {asr_api_key}",
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            json={"model": asr_model, "input": {"file_urls": [oss_url]}},
            timeout=30,
        )
        if task_resp.status_code != 200:
            return f"[提交转录任务失败: {task_resp.text[:300]}]"
        async_task_id = task_resp.json()["output"]["task_id"]

        # 4. Poll for task completion (max 5 minutes)
        for _ in range(100):
            time.sleep(3)
            poll_resp = requests.get(
                f"{asr_base_url}/api/v1/tasks/{async_task_id}",
                headers={"Authorization": f"Bearer {asr_api_key}"},
                timeout=30,
            )
            poll_data = poll_resp.json()
            status = poll_data.get("output", {}).get("task_status", "UNKNOWN")
            if status == "FAILED":
                return f"[语音识别任务失败: {json.dumps(poll_data.get('output', {}), ensure_ascii=False)[:500]}]"
            if status == "SUCCEEDED":
                # 5. Download result JSON
                results = poll_data["output"].get("results", [])
                for r in results:
                    tx_url = r.get("transcription_url", "")
                    if tx_url:
                        tx_resp = requests.get(tx_url, timeout=30)
                        tx_data = tx_resp.json()
                        transcripts = tx_data.get("transcripts", [])
                        if transcripts:
                            text = transcripts[0].get("text", "")
                            if text:
                                txt_path = os.path.join(task_dir, "transcription.txt")
                                with open(txt_path, "w", encoding="utf-8") as f:
                                    f.write(text)
                                return text
                return "[语音识别完成，但未返回文本]"

        return "[语音识别任务超时（5分钟）]"

    except Exception as e:
        return f"[语音识别失败: {e}]"
    finally:
        try:
            if os.path.exists(mp3_path):
                os.remove(mp3_path)
        except Exception:
            pass


def _merge_texts_with_llm(subtitle_text: str, asr_text: str) -> str:
    """Cross-validate subtitle and ASR text using LLM, producing a merged version."""
    import sqlite3

    merge_prompt = f"""请对比以下两段同一视频的文本：
【字幕】{subtitle_text}
【语音识别】{asr_text}

任务：
1. 合并两段文本为一份完整流程，不遗漏任何信息
2. 以语音识别为主框架，字幕用来校正术语和数字
3. 在每个差异处标注来源：
   [字幕匹配] — 双方一致
   [ASR] — 仅语音识别有
   [字幕] — 仅字幕有
   [字幕校正] — 以字幕为准（术语/数字）
4. 输出为连续文本，标注符号使用中文全角括号"""

    try:
        db_dir = os.path.join(BASE_DIR, "data")
        db = sqlite3.connect(os.path.join(db_dir, "yishao.db"))
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT * FROM llm_providers WHERE is_enabled = 1 ORDER BY rowid LIMIT 1"
        ).fetchone()
        db.close()

        if not row:
            return ""

        from openai import OpenAI
        client = OpenAI(
            api_key=row["api_key"],
            base_url=row["base_url"],
            timeout=120.0,
        )
        models_raw = row["models"] or ""
        if isinstance(models_raw, str):
            try:
                models_list = json.loads(models_raw)
            except (json.JSONDecodeError, ValueError):
                models_list = [m.strip() for m in models_raw.split(",") if m.strip()]
        else:
            models_list = models_raw
        model = models_list[0] if models_list else "deepseek-chat"

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": merge_prompt}],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

    except Exception:
        import traceback
        traceback.print_exc()
        return ""
