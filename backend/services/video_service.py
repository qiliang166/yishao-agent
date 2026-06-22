"""Video download and subtitle extraction via yt-dlp."""
import os
import subprocess
import glob
import threading
import uuid

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


def download_video(url: str) -> dict:
    """Start async download. Returns task_id for polling progress."""
    task_id = uuid.uuid4().hex[:8]
    _progress[task_id] = {"status": "starting", "progress": 0, "message": "准备下载..."}

    def _run():
        try:
            ytdlp = _find_yt_dlp()
            task_dir = os.path.join(VIDEO_DIR, task_id)
            os.makedirs(task_dir, exist_ok=True)

            _progress[task_id] = {"status": "downloading", "progress": 10, "message": "正在下载视频..."}

            cmd = [
                ytdlp,
                url,
                "-o", os.path.join(task_dir, "%(title)s.%(ext)s"),
                "--write-subs",
                "--write-auto-subs",
                "--sub-lang", "zh-Hans,zh-CN,zh,en",
                "--convert-subs", "srt",
                "--no-playlist",
                "--no-warnings",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=task_dir)

            if result.returncode != 0:
                _progress[task_id] = {"status": "error", "progress": 0, "message": f"下载失败: {result.stderr[:200]}"}
                return

            _progress[task_id] = {"status": "processing", "progress": 60, "message": "查找字幕文件..."}

            # Find video file
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

            # Parse subtitle to text
            if subtitle_path:
                _progress[task_id] = {"status": "processing", "progress": 80, "message": "解析字幕..."}
                subtitle_text = _parse_subtitle(subtitle_path)

            # If no subtitle found, try whisper
            if not subtitle_text and video_path:
                _progress[task_id] = {"status": "processing", "progress": 85, "message": "无字幕，使用语音识别..."}
                subtitle_text = _transcribe_audio(video_path, task_dir)

            _progress[task_id] = {
                "status": "done",
                "progress": 100,
                "message": "完成",
                "video_path": video_path,
                "subtitle_path": subtitle_path,
                "subtitle_text": subtitle_text,
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


def _transcribe_audio(video_path: str, task_dir: str) -> str:
    """Transcribe video audio using Whisper."""
    try:
        import whisper
        model = whisper.load_model("small")
        result = model.transcribe(video_path, language="zh")
        text = result["text"]
        # Save transcription
        txt_path = os.path.join(task_dir, "transcription.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(text)
        return text
    except ImportError:
        return "[需要安装 whisper: pip install openai-whisper]"
    except Exception as e:
        return f"[语音识别失败: {e}]"
