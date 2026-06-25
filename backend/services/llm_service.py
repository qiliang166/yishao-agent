"""Multi-provider LLM service using OpenAI-compatible SDK."""
from openai import OpenAI, AsyncOpenAI
from database import get_db


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
) -> str:
    provider = await get_provider(provider_id)
    if not provider:
        raise ValueError(f"Provider {provider_id} not found or disabled")

    client = AsyncOpenAI(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        timeout=120.0,
    )

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_message})

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=16384,
    )
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

    client = AsyncOpenAI(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        timeout=120.0,
    )

    system_prompt = "你是一个专业的文字编辑助手。根据用户的指令精确修改选中的文本。只返回修改后的文本，不要添加解释。"

    user_parts = []
    if full_context:
        user_parts.append(f"【全文上下文】\n{full_context}")
    user_parts.append(f"【选中的文本】\n{selected_text}")
    user_parts.append(f"【操作指令】\n{instruction}")

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n\n".join(user_parts)},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content
