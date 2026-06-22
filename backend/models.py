from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    source_type: str = "text"
    storage_path: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    storage_path: Optional[str] = None


class StepResultSave(BaseModel):
    content: str
    content_type: str = "markdown"


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
    volume: int = 50
    speed: float = 1.0
    project_id: Optional[str] = None
    provider_id: Optional[str] = None
