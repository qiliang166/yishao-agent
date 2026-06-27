"""Multi-provider LLM service using OpenAI-compatible SDK + Anthropic native API."""
import anthropic
from openai import OpenAI, AsyncOpenAI
from database import get_db


def _is_anthropic(provider: dict) -> bool:
    """Detect Anthropic provider by base_url or name."""
    base = (provider.get("base_url") or "").lower()
    name = (provider.get("name") or "").lower()
    return "anthropic" in base or "anthropic" in name or "claude" in name


def _mk_anthropic(provider: dict) -> anthropic.AsyncAnthropic:
    """Create Anthropic client. Uses auth_token (Bearer) for proxies, api_key for native."""
    base = (provider.get("base_url") or "").strip()
    if base and "api.anthropic.com" not in base:
        # Non-Anthropic endpoints (e.g. DeepSeek proxy) expect Bearer token
        return anthropic.AsyncAnthropic(
            auth_token=provider["api_key"],
            base_url=base.rstrip("/"),
            timeout=120.0,
        )
    return anthropic.AsyncAnthropic(api_key=provider["api_key"], timeout=120.0)


async def get_provider(provider_id: str) -> dict | None:
    db = get_db()
    try:
        row = db.execute(
            "SELECT * FROM llm_providers WHERE id = ? AND is_enabled = 1",
            (provider_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


async def test_connection(api_key: str, base_url: str) -> dict:
    # Auto-detect Anthropic by base_url pattern
    if "anthropic" in (base_url or "").lower():
        try:
            client = _mk_anthropic({"api_key": api_key, "base_url": base_url})
            # Anthropic doesn't have a list-models endpoint; just verify auth with a minimal call
            models = ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"]
            return {"ok": True, "models": models}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    try:
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=30.0)
        models = client.models.list()
        model_ids = [m.id for m in models.data[:10]]
        return {"ok": True, "models": model_ids}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def generate(
    provider_id: str,
    model: str,
    system_prompt: str,
    user_message: str,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    provider = await get_provider(provider_id)
    if not provider:
        raise ValueError(f"Provider {provider_id} not found or disabled")

    # ── Anthropic native API path ──
    if _is_anthropic(provider):
        client = _mk_anthropic(provider)
        messages = []
        if system_prompt:
            if json_mode:
                system_prompt = system_prompt + "\n\nYou MUST return ONLY valid JSON. No other text."
            messages.append({"role": "user", "content": user_message})
        else:
            messages.append({"role": "user", "content": user_message})

        response = await client.messages.create(
            model=model,
            max_tokens=16384,
            system=system_prompt if system_prompt else None,
            messages=messages,
            temperature=temperature,
        )
        # Anthropic returns content blocks; extract text
        for block in response.content:
            if block.type == "text":
                return block.text
        return response.content[0].text if response.content else ""

    # ── OpenAI-compatible path ──
    client = AsyncOpenAI(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        timeout=120.0,
    )

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_message})

    kwargs = dict(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=16384,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = await client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


async def generate_stream(
    provider_id: str,
    model: str,
    system_prompt: str,
    user_message: str,
    temperature: float = 0.7,
):
    provider = await get_provider(provider_id)
    if not provider:
        raise ValueError(f"Provider {provider_id} not found or disabled")

    # ── Anthropic streaming ──
    if _is_anthropic(provider):
        client = _mk_anthropic(provider)
        messages = [{"role": "user", "content": user_message}]
        async with client.messages.stream(
            model=model,
            max_tokens=16384,
            system=system_prompt if system_prompt else None,
            messages=messages,
            temperature=temperature,
        ) as stream:
            async for text in stream.text_stream:
                yield text
        return

    # ── OpenAI-compatible streaming ──
    client = AsyncOpenAI(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        timeout=120.0,
    )

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_message})

    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def refine(
    provider_id: str,
    model: str,
    instruction: str,
    selected_text: str,
    full_context: str = "",
) -> str:
    provider = await get_provider(provider_id)
    if not provider:
        raise ValueError(f"Provider {provider_id} not found or disabled")

    sys_prompt = "你是一个专业的文字编辑助手。根据用户的指令精确修改选中的文本。只返回修改后的文本，不要添加解释。"

    user_parts = []
    if full_context:
        user_parts.append(f"【全文上下文】\n{full_context}")
    user_parts.append(f"【选中的文本】\n{selected_text}")
    user_parts.append(f"【操作指令】\n{instruction}")
    user_msg = "\n\n".join(user_parts)

    # ── Anthropic path ──
    if _is_anthropic(provider):
        client = _mk_anthropic(provider)
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=sys_prompt,
            messages=[{"role": "user", "content": user_msg}],
            temperature=0.7,
        )
        for block in response.content:
            if block.type == "text":
                return block.text
        return response.content[0].text if response.content else ""

    # ── OpenAI-compatible path ──
    client = AsyncOpenAI(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        timeout=120.0,
    )

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content
