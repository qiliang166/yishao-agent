import os

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_ENV_PATH):
    with open(_ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
BASE_URL = "https://dashscope.aliyuncs.com/api/v1"

AVAILABLE_MODELS = [
    {"id": "cosyvoice-v3-flash", "name": "CosyVoice 3 Flash", "family": "cosyvoice", "realtime": True, "has_system_voice": True},
    {"id": "cosyvoice-v3-plus", "name": "CosyVoice 3 Plus", "family": "cosyvoice", "realtime": True, "has_system_voice": True},
]

LANGUAGES = ["中文", "英语", "日语", "韩语"]
STYLES = ["标准播音风格", "温柔治愈风格", "沉稳大气风格", "活泼俏皮风格", "新闻播报风格"]
