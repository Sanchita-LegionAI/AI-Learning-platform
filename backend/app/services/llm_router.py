"""
services/llm_router.py
======================
Routes LLM calls to OpenAI, Anthropic, Gemini, or 'none' (passthrough).
Reads active provider from DB at runtime — no restart needed.
Logs every call to api_calls table.

Purposes:
  question_generation — rephrase questions from bank (or passthrough with 'none')
  evaluation          — score handwritten answers using OCR text
  ocr                 — extract handwritten text from image (Gemini vision)
  tutor               — phase 2 placeholder
"""
import time
import os
from typing import Optional
from openai import OpenAI
from anthropic import Anthropic
from app.core.supabase import get_supabase
from app.core.config import get_settings


# =============================================================================
# PROVIDER LOADER
# =============================================================================

def get_active_provider(purpose: str) -> dict:
    """Fetch active provider row for a given purpose from DB."""
    supabase = get_supabase()
    res = (
        supabase.table("providers")
        .select("*")
        .eq("purpose", purpose)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise RuntimeError(f"No active provider found for purpose: {purpose}")
    return res.data[0]


def get_fallback_provider(purpose: str, exclude_name: str) -> Optional[dict]:
    """Fetch an inactive provider as fallback (excludes 'none' — no fallback for passthrough)."""
    supabase = get_supabase()
    res = (
        supabase.table("providers")
        .select("*")
        .eq("purpose", purpose)
        .eq("active", False)
        .neq("provider_name", exclude_name)
        .neq("provider_name", "none")   # never fall back to passthrough
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


# =============================================================================
# COST LOGGER
# =============================================================================

def log_api_call(
    call_type: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_input_per_m: float,
    cost_output_per_m: float,
    session_id: Optional[str],
    user_id: Optional[str],
    ip_address: Optional[str],
    success: bool,
    error_message: Optional[str] = None,
):
    settings = get_settings()
    cost_usd = (input_tokens * cost_input_per_m / 1_000_000) + \
               (output_tokens * cost_output_per_m / 1_000_000)
    cost_inr = cost_usd * settings.INR_PER_USD

    try:
        get_supabase().table("api_calls").insert({
            "call_type":     call_type,
            "provider":      provider,
            "model":         model,
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
            "cost_usd":      round(cost_usd, 6),
            "cost_inr":      round(cost_inr, 4),
            "session_id":    session_id,
            "user_id":       user_id,
            "ip_address":    ip_address,
            "success":       success,
            "error_message": error_message,
        }).execute()
    except Exception:
        pass  # never let logging failure break the main flow


# =============================================================================
# OPENAI CALLER
# =============================================================================

def _call_openai(
    provider: dict,
    system_prompt: str,
    user_prompt: str,
    image_url: Optional[str] = None,
) -> tuple[str, int, int]:
    """Returns (text_response, input_tokens, output_tokens)."""
    api_key = os.environ.get(provider["api_key_env_var"], "")
    if not api_key:
        raise RuntimeError(f"Missing env var: {provider['api_key_env_var']}")

    client = OpenAI(api_key=api_key)

    user_content = []
    if image_url:
        user_content.append({"type": "image_url", "image_url": {"url": image_url}})
    user_content.append({"type": "text", "text": user_prompt})

    response = client.chat.completions.create(
        model=provider["model_name"],
        max_tokens=provider["max_tokens"],
        temperature=provider["temperature"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_content},
        ],
    )

    text         = response.choices[0].message.content or ""
    input_tokens  = response.usage.prompt_tokens
    output_tokens = response.usage.completion_tokens
    return text, input_tokens, output_tokens


# =============================================================================
# ANTHROPIC CALLER
# =============================================================================

def _call_anthropic(
    provider: dict,
    system_prompt: str,
    user_prompt: str,
    image_url: Optional[str] = None,
) -> tuple[str, int, int]:
    """Returns (text_response, input_tokens, output_tokens)."""
    api_key = os.environ.get(provider["api_key_env_var"], "")
    if not api_key:
        raise RuntimeError(f"Missing env var: {provider['api_key_env_var']}")

    client = Anthropic(api_key=api_key)

    user_content = []
    if image_url and provider.get("vision_enabled"):
        user_content.append({
            "type": "image",
            "source": {"type": "url", "url": image_url},
        })
    user_content.append({"type": "text", "text": user_prompt})

    response = client.messages.create(
        model=provider["model_name"],
        max_tokens=provider["max_tokens"],
        temperature=provider["temperature"],
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )

    text         = response.content[0].text if response.content else ""
    input_tokens  = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    return text, input_tokens, output_tokens


# =============================================================================
# GEMINI CALLER
# =============================================================================

def _call_gemini(
    provider: dict,
    system_prompt: str,
    user_prompt: str,
    image_url: Optional[str] = None,
) -> tuple[str, int, int]:
    """
    Calls Google Gemini via the REST API (no SDK dependency).
    Uses generativelanguage.googleapis.com endpoint.
    Returns (text_response, input_tokens, output_tokens).
    """
    import httpx
    import base64

    api_key = os.environ.get(provider["api_key_env_var"], "")
    if not api_key:
        raise RuntimeError(f"Missing env var: {provider['api_key_env_var']}")

    model = provider["model_name"]  # e.g. "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    # Build parts
    parts = []

    # System instruction becomes the first text part for Gemini
    if system_prompt:
        parts.append({"text": system_prompt})

    # Image (download and embed as base64 for reliability with signed URLs)
    if image_url and provider.get("vision_enabled"):
        try:
            img_response = httpx.get(image_url, timeout=30, follow_redirects=True)
            img_response.raise_for_status()
            img_b64 = base64.b64encode(img_response.content).decode("utf-8")
            content_type = img_response.headers.get("content-type", "image/jpeg").split(";")[0]
            parts.append({
                "inline_data": {
                    "mime_type": content_type,
                    "data": img_b64,
                }
            })
        except Exception as e:
            raise RuntimeError(f"Failed to fetch image for Gemini: {e}")

    parts.append({"text": user_prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature":    provider["temperature"],
            "maxOutputTokens": provider["max_tokens"],
        },
    }

    resp = httpx.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    # Parse response
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {data}")

    text = ""
    for part in candidates[0].get("content", {}).get("parts", []):
        text += part.get("text", "")

    # Token counts from usageMetadata
    usage        = data.get("usageMetadata", {})
    input_tokens  = usage.get("promptTokenCount", 0)
    output_tokens = usage.get("candidatesTokenCount", 0)

    return text, input_tokens, output_tokens


# =============================================================================
# MAIN ROUTER — call with automatic fallback
# =============================================================================

def call_llm(
    purpose: str,
    system_prompt: str,
    user_prompt: str,
    image_url: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> str:
    """
    Main entry point for all LLM calls.
    1. Reads active provider from DB
    2. If provider is 'none' → raises NoneProviderSignal (caller handles passthrough)
    3. Calls primary provider; on failure tries fallback
    4. Logs every attempt to api_calls table
    Returns the text response string.
    """
    call_type = {
        "question_generation": "generate_questions",
        "evaluation":          "evaluate_answers",
        "ocr":                 "ocr_answers",
        "tutor":               "tutor",
    }.get(purpose, purpose)

    primary = get_active_provider(purpose)

    # ── 'none' provider — passthrough signal ──────────────────────────────────
    if primary["provider_name"] == "none":
        raise NoneProviderSignal("passthrough — no LLM rephrasing")

    providers_to_try = [primary]
    fallback = get_fallback_provider(purpose, primary["provider_name"])
    if fallback:
        providers_to_try.append(fallback)

    last_error = None

    for provider in providers_to_try:
        name = provider["provider_name"]
        try:
            if name == "openai":
                text, in_tok, out_tok = _call_openai(provider, system_prompt, user_prompt, image_url)
            elif name == "anthropic":
                text, in_tok, out_tok = _call_anthropic(provider, system_prompt, user_prompt, image_url)
            elif name == "gemini":
                text, in_tok, out_tok = _call_gemini(provider, system_prompt, user_prompt, image_url)
            else:
                raise RuntimeError(f"Unknown provider: {name}")

            log_api_call(
                call_type=call_type, provider=name, model=provider["model_name"],
                input_tokens=in_tok, output_tokens=out_tok,
                cost_input_per_m=provider["cost_input_per_m"],
                cost_output_per_m=provider["cost_output_per_m"],
                session_id=session_id, user_id=user_id, ip_address=ip_address,
                success=True,
            )
            return text

        except NoneProviderSignal:
            raise  # propagate immediately

        except Exception as e:
            last_error = e
            log_api_call(
                call_type=call_type, provider=name, model=provider["model_name"],
                input_tokens=0, output_tokens=0,
                cost_input_per_m=provider["cost_input_per_m"],
                cost_output_per_m=provider["cost_output_per_m"],
                session_id=session_id, user_id=user_id, ip_address=ip_address,
                success=False, error_message=str(e),
            )
            if fallback and provider == primary:
                continue
            break

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


# =============================================================================
# SENTINEL — raised when 'none' provider is active (passthrough)
# =============================================================================

class NoneProviderSignal(Exception):
    """Raised by call_llm when the active provider is 'none' (no LLM rephrasing)."""
    pass
