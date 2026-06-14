"""
services/llm_router.py
======================
Reads the active LLM provider from the DB at runtime (no restart needed).
Routes to OpenAI or Anthropic.
Auto-falls back to the inactive provider if the primary fails.
Logs every call to api_calls table.
"""
import time
import os
from typing import Optional
from openai import OpenAI
from anthropic import Anthropic
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
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
    """Fetch inactive provider as fallback."""
    supabase = get_supabase()
    res = (
        supabase.table("providers")
        .select("*")
        .eq("purpose", purpose)
        .eq("active", False)
        .neq("provider_name", exclude_name)
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
    settings = get_settings()
    api_key = os.environ.get(provider["api_key_env_var"], "")
    if not api_key:
        raise RuntimeError(f"Missing env var: {provider['api_key_env_var']}")

    client = OpenAI(api_key=api_key)

    # Build message content
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
            {"role": "user", "content": user_content},
        ],
    )

    text = response.choices[0].message.content or ""
    input_tokens = response.usage.prompt_tokens
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

    # Build message content
    user_content = []
    if image_url and provider.get("vision_enabled"):
        # Anthropic vision uses URL source
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

    text = response.content[0].text if response.content else ""
    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
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
    2. Calls primary provider
    3. On failure, tries fallback provider
    4. Logs every attempt to api_calls table
    Returns the text response string.
    """
    call_type = {
        "question_generation": "generate_questions",
        "evaluation": "evaluate_answers",
        "tutor": "tutor",
    }.get(purpose, purpose)

    primary = get_active_provider(purpose)
    providers_to_try = [primary]

    fallback = get_fallback_provider(purpose, primary["provider_name"])
    if fallback:
        providers_to_try.append(fallback)

    last_error = None

    for provider in providers_to_try:
        name = provider["provider_name"]
        start = time.time()
        try:
            if name == "openai":
                text, in_tok, out_tok = _call_openai(
                    provider, system_prompt, user_prompt, image_url
                )
            elif name == "anthropic":
                text, in_tok, out_tok = _call_anthropic(
                    provider, system_prompt, user_prompt, image_url
                )
            else:
                raise RuntimeError(f"Unknown provider: {name}")

            log_api_call(
                call_type=call_type,
                provider=name,
                model=provider["model_name"],
                input_tokens=in_tok,
                output_tokens=out_tok,
                cost_input_per_m=provider["cost_input_per_m"],
                cost_output_per_m=provider["cost_output_per_m"],
                session_id=session_id,
                user_id=user_id,
                ip_address=ip_address,
                success=True,
            )
            return text

        except Exception as e:
            last_error = e
            log_api_call(
                call_type=call_type,
                provider=name,
                model=provider["model_name"],
                input_tokens=0,
                output_tokens=0,
                cost_input_per_m=provider["cost_input_per_m"],
                cost_output_per_m=provider["cost_output_per_m"],
                session_id=session_id,
                user_id=user_id,
                ip_address=ip_address,
                success=False,
                error_message=str(e),
            )
            if fallback and provider == primary:
                continue  # try fallback
            break

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")
