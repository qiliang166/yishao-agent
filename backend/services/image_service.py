"""Image generation service — wraps DashScope multimodal-generation API.

Usage:
    from services.image_service import generate_image, download_image

    result = await generate_image("一盘红烧肉", size="1280*720")
    if result["ok"]:
        path = download_image(result["images"][0]["url"], "slide-01-hero.png", output_dir)
"""

import os
import json
import httpx
from urllib.parse import urlparse
from database import get_db

# PPT layout → recommended image size (all within 512²–2048² constraint)
SIZE_MAP = {
    "full":     "1280*720",   # 16:9 slide background
    "hero":     "1344*576",   # 21:9 wide banner (image_hero)
    "content":  "1280*800",   # 16:10 illustration
    "square":   "1024*1024",  # 1:1 card
    "portrait": "960*1280",   # 3:4 vertical
}


def _parse_host(base_url: str) -> str:
    parsed = urlparse(base_url)
    return f"{parsed.scheme}://{parsed.netloc}"


async def generate_image(
    prompt: str,
    size: str = "1280*720",
    n: int = 1,
    provider_id: str = "",
    model: str = "",
    negative_prompt: str = "",
    reference_images: list = None,
    seed: int = None,
) -> dict:
    """Generate image(s) via DashScope multimodal-generation API.

    Returns: {"ok": True, "images": [{"url": "..."}], "model": "...", "usage": {...}}
    """
    db = get_db()
    try:
        if provider_id:
            row = db.execute(
                "SELECT * FROM image_providers WHERE id = ? AND is_enabled = 1",
                (provider_id,)).fetchone()
        else:
            row = db.execute(
                "SELECT * FROM image_providers WHERE is_default = 1 AND is_enabled = 1").fetchone()
            if not row:
                row = db.execute(
                    "SELECT * FROM image_providers WHERE is_enabled = 1 ORDER BY created_at").fetchone()
        if not row:
            return {"ok": False, "error": "未配置图片生成提供商"}

        provider = dict(row)
        saved_models = json.loads(provider["models"]) if provider["models"] else []
        resolved_model = model or (saved_models[0] if saved_models else "qwen-image-2.0-pro")
        model_lower = resolved_model.lower()

        host = _parse_host(provider["base_url"])
        url = f"{host}/api/v1/services/aigc/multimodal-generation/generation"

        content = []
        for img_url in (reference_images or []):
            content.append({"image": img_url})
        content.append({"text": prompt})

        payload = {
            "model": model_lower,
            "input": {"messages": [{"role": "user", "content": content}]},
            "parameters": {
                "size": size,
                "n": n,
                "prompt_extend": True,
                "watermark": False,
            },
        }
        if negative_prompt:
            payload["parameters"]["negative_prompt"] = negative_prompt
        if seed is not None:
            payload["parameters"]["seed"] = seed

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {provider['api_key']}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if resp.status_code in (200, 201):
            data = resp.json()
            images = []
            choices = data.get("output", {}).get("choices", [])
            for choice in choices:
                for item in choice.get("message", {}).get("content", []):
                    if "image" in item:
                        images.append({"url": item["image"]})
            usage = data.get("usage", {})
            return {
                "ok": True,
                "images": images,
                "model": model_lower,
                "usage": {"width": usage.get("width"), "height": usage.get("height"),
                          "count": usage.get("image_count")},
            }
        else:
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


async def download_image(image_url: str, filename: str, output_dir: str) -> str:
    """Download generated image to local path. Returns the local file path."""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(resp.content)
    return filepath
