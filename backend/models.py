from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    source_type: str = "text"
    storage_path: Optional[str] = None
    copied_from_project_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    storage_path: Optional[str] = None
    is_locked: Optional[int] = None


class StepResultSave(BaseModel):
    content: str
    content_type: str = "markdown"


# ── New models for industry-agnostic architecture ──

class SourceMaterialCreate(BaseModel):
    source_type: str  # file, video, text, image, url
    source_name: str = ""
    raw_content: str = ""
    processed_content: str = ""
    status: str = "pending"


class SourceMaterialUpdate(BaseModel):
    source_name: Optional[str] = None
    raw_content: Optional[str] = None
    processed_content: Optional[str] = None
    status: Optional[str] = None


class ProjectItemCreate(BaseModel):
    name: str
    prompt: str = ""
    skill: str = ""
    output_mode: str = "text"  # text, ppt, audio, image
    config_json: str = "{}"
    source_item_id: Optional[str] = None
    sort_order: int = 0


class ProjectItemUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    skill: Optional[str] = None
    output_mode: Optional[str] = None
    config_json: Optional[str] = None
    source_item_id: Optional[str] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


class ProjectItemResultSave(BaseModel):
    content: str
    content_type: str = "markdown"
    file_path: str = ""
    quality_score: float = 0.0


class LLMGenerateRequest(BaseModel):
    provider_id: str
    model: str
    system_prompt: str
    user_message: str
    temperature: float = 0.7


class LLMRefineRequest(BaseModel):
    provider_id: str
    model: str
    instruction: str
    selected_text: str
    full_context: str = ""


class SynthesizeRequest(BaseModel):
    text: str
    model: str = "cosyvoice-v3-flash"
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None
    volume: int = 50
    speed: float = 1.0
    project_id: Optional[str] = None
    provider_id: Optional[str] = None
    source_name: Optional[str] = None


class TtsHistoryUpdate(BaseModel):
    name: Optional[str] = None


class PPTEditSlideRequest(BaseModel):
    run_id: str
    slide_seq: int
    instruction: str
    provider_id: str = ""
    model: str = ""
    style: str = "business"
    color_scheme: str = "deep-blue"


class PPTSlideSourceRequest(BaseModel):
    html: str


class PPTRegenerateSlideRequest(BaseModel):
    run_id: str
    slide_seqs: list[int]
    provider_id: str = ""
    model: str = ""
    column_id: str = ""


class PPTGenerateRequest(BaseModel):
    content: str = ""
    template_id: str = ""
    branding: Optional[dict] = None
    project_id: Optional[str] = None
    provider_id: str = ""
    model: str = ""
    slide_plan: Optional[list] = None
    column_id: str = ""
    color_scheme: str = "deep-blue"
    temperature: float = 0.3  # base fallback
    # Tab 1: 生成大纲
    temp_keyword: float = 0     # 提取关键词搜资料
    temp_research: float = 0    # 深度理解内容主题
    temp_outline: float = 0     # 规划类型标题要点
    temp_fill: float = 0        # 给每页写正文
    # Tab 2: 合成PPT
    temp_cards: float = 0       # 布局卡片数量
    temp_html: float = 0        # 逐页写HTML
    # Tab 3: 后台自动 (SVG渲染+审核修复)
    temp_svg_batch: float = 0   # 批量画SVG矢量图
    temp_svg_single: float = 0  # 单页失败单独补画
    temp_review: float = 0      # 逐页打分检查质量
    temp_fix: float = 0         # 低于7分的重新画
    temp_holistic: float = 0    # 跨页检查统一性
    temp_holistic_fix: float = 0  # 不一致的重新修
    # Stage-level overrides (0 = use per-step temps)
    temp_stage_outline: float = 0    # 覆盖 Tab1 全部温度
    temp_stage_generation: float = 0  # 覆盖 Tab2 全部温度
    temp_stage_review: float = 0     # 覆盖 Tab3 全部温度


class PPTPlanRequest(BaseModel):
    content: str
    template_id: str = ""
    provider_id: str = ""
    model: str = ""
    column_id: str = ""
    project_id: Optional[str] = None
    slide_plan: list = []  # original JSON reference for outline conversion
    temperature: float = 0.3  # base fallback
    # Tab 1: 生成大纲
    temp_keyword: float = 0     # 提取关键词搜资料
    temp_research: float = 0    # 深度理解内容主题
    temp_outline: float = 0     # 规划类型标题要点
    temp_fill: float = 0        # 给每页写正文
    # Tab 2: 合成PPT
    temp_cards: float = 0       # 布局卡片数量
    temp_html: float = 0        # 逐页写HTML
    # Tab 3: 后台自动 (SVG渲染+审核修复)
    temp_svg_batch: float = 0   # 批量画SVG矢量图
    temp_svg_single: float = 0  # 单页失败单独补画
    temp_review: float = 0      # 逐页打分检查质量
    temp_fix: float = 0         # 低于7分的重新画
    temp_holistic: float = 0    # 跨页检查统一性
    temp_holistic_fix: float = 0  # 不一致的重新修
    # Stage-level overrides (0 = use per-step temps)
    temp_stage_outline: float = 0    # 覆盖 Tab1 全部温度
    temp_stage_generation: float = 0  # 覆盖 Tab2 全部温度
    temp_stage_review: float = 0     # 覆盖 Tab3 全部温度


class ImageGenerateRequest(BaseModel):
    prompt: str
    provider_id: str = ""
    model: str = ""
    size: str = "1280*720"
    n: int = 1
    negative_prompt: str = ""
    prompt_extend: bool = True
    watermark: bool = False
    seed: Optional[int] = None
    reference_images: list[str] = []  # URLs for image edit / multi-image fusion
