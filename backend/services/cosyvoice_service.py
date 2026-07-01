import io
import wave
import base64
import struct

import httpx

TTS_PATH = "/services/audio/tts/SpeechSynthesizer"
CUSTOM_PATH = "/services/audio/tts/customization"


def _safe_prefix(name: str) -> str:
    import random
    prefix = "".join(c for c in name if c.isascii() and (c.isalnum() or c == '_'))[:10].lower()
    if not prefix:
        prefix = "v" + "".join(random.choices("0123456789abcdef", k=8))
    return prefix


def _to_data_url(raw: bytes) -> str:
    """Compress audio to mono 16kHz 16-bit WAV, max 15 seconds, return base64 data URL."""
    target_rate = 16000
    try:
        with wave.open(io.BytesIO(raw), 'rb') as wav_in:
            params = wav_in.getparams()
            frames = wav_in.readframes(params.nframes)
    except Exception:
        b64 = base64.b64encode(raw).decode()
        return f"data:audio/wav;base64,{b64}"

    # Downmix stereo to mono
    samples = []
    pos = 0
    while pos + params.sampwidth <= len(frames):
        val = struct.unpack('<h', frames[pos:pos + 2])[0]
        if params.nchannels == 2 and pos + params.sampwidth * 2 <= len(frames):
            val2 = struct.unpack('<h', frames[pos + 2:pos + 4])[0]
            val = (val + val2) // 2
            pos += params.sampwidth
        pos += params.sampwidth
        samples.append(val)

    max_samples = target_rate * 15
    samples = samples[:max_samples]

    # Simple resample to target_rate
    if params.framerate != target_rate and params.framerate > 0:
        ratio = params.framerate / target_rate
        resampled = []
        for i in range(len(samples)):
            src_i = int(i * ratio)
            if src_i < len(samples):
                resampled.append(samples[src_i])
        samples = resampled[:max_samples]

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav_out:
        wav_out.setnchannels(1)
        wav_out.setsampwidth(2)
        wav_out.setframerate(target_rate)
        for s in samples:
            wav_out.writeframes(struct.pack('<h', max(-32768, min(32767, s))))

    compressed = buf.getvalue()
    b64 = base64.b64encode(compressed).decode()
    return f"data:audio/wav;base64,{b64}"


async def clone_voice(name: str, model: str, audio_bytes: bytes, filename: str,
                      api_key: str, base_url: str) -> dict:
    """Voice cloning via audio file upload using data URL in JSON."""
    data_url = _to_data_url(audio_bytes)

    payload = {
        "model": "voice-enrollment",
        "input": {
            "action": "create_voice",
            "target_model": model,
            "prefix": _safe_prefix(name),
            "url": data_url,
        },
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            base_url + CUSTOM_PATH,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    result = resp.json()
    if resp.status_code != 200:
        raise Exception(f"Voice cloning failed: {result.get('message', result)}")

    voice_id = result.get("output", {}).get("voice_id", "")
    if not voice_id:
        raise Exception(f"No voice_id in response: {result}")

    return {"voice_id": voice_id, "request_id": result.get("request_id", "")}


async def design_voice(name: str, model: str, voice_prompt: str, preview_text: str,
                       api_key: str, base_url: str) -> dict:
    """Voice Design API: create a voice from text description."""
    if len(preview_text) < 15:
        raise Exception("preview_text 至少需要 15 个字符")

    payload = {
        "model": "voice-enrollment",
        "input": {
            "action": "create_voice",
            "target_model": model,
            "voice_prompt": voice_prompt,
            "preview_text": preview_text,
            "prefix": _safe_prefix(name),
        },
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            base_url + CUSTOM_PATH,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    result = resp.json()
    if resp.status_code != 200:
        raise Exception(f"Voice design failed: {result.get('message', result)}")

    voice_id = result.get("output", {}).get("voice_id", "")
    if not voice_id:
        raise Exception(f"No voice_id in response: {result}")

    return {"voice_id": voice_id, "request_id": result.get("request_id", "")}
