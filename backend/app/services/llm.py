"""The one place that talks to the language model. The API key stays on the server."""

import base64
import json
import os
from typing import Any

import logging

import openai

from app.config import settings

logger = logging.getLogger("uvicorn.error")
REQUEST_TIMEOUT_SECONDS = 60.0
# A ceiling on the answer (including any reasoning the model does), not a target.
MAX_COMPLETION_TOKENS = 8000


class LLMUnavailable(RuntimeError):
    """The model could not give a usable answer. The message is safe to show to users."""


_client: openai.OpenAI | None = None


def is_configured() -> bool:
    """True when an API key is available. app.config loads backend/.env into the environment."""
    return bool(os.getenv("OPENAI_API_KEY"))


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        # Reads OPENAI_API_KEY from the environment; the key is never written in code.
        _client = openai.OpenAI(timeout=REQUEST_TIMEOUT_SECONDS)
    return _client


def _user_content(prompt: str, images: list[tuple[str, bytes]] | None) -> str | list[dict[str, Any]]:
    if not images:
        return prompt
    parts: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for media_type, data in images:
        encoded = base64.b64encode(data).decode("ascii")
        parts.append({"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{encoded}"}})
    return parts


def generate_json(
    *,
    system: str,
    prompt: str,
    schema: dict[str, Any],
    schema_name: str = "answer",
    images: list[tuple[str, bytes]] | None = None,
) -> dict[str, Any]:
    """Ask the model for an answer that matches `schema` and return it as a dict.

    `images` are (media type, bytes) pairs, such as a photo of a letter, shown to the model alongside the prompt.

    `schema` must follow OpenAI's strict structured-output rules: every property listed in
    `required`, and `additionalProperties: false` on every object.

    Raises LLMUnavailable when no key is set, the API fails, or the model declines.
    """
    if not is_configured():
        raise LLMUnavailable("AI features are switched off right now. Everything else works as usual.")

    try:
        completion = _get_client().chat.completions.create(
            model=settings.llm_model,
            max_completion_tokens=MAX_COMPLETION_TOKENS,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": _user_content(prompt, images)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        )
    except openai.AuthenticationError as error:
        logger.error("OpenAI rejected the key: check OPENAI_API_KEY")
        raise LLMUnavailable("AI features are unavailable right now. Everything else works as usual.") from error
    except openai.PermissionDeniedError as error:
        raise LLMUnavailable("The API key is not allowed to use this AI model.") from error
    except openai.NotFoundError as error:
        logger.error("OpenAI has no model called %r: check LLM_MODEL", settings.llm_model)
        raise LLMUnavailable("AI features are unavailable right now. Everything else works as usual.") from error
    except openai.RateLimitError as error:
        # OpenAI also uses this status when the account has run out of credit.
        raise LLMUnavailable("The AI service is busy or the account is out of credit. Try again in a moment.") from error
    except openai.APIStatusError as error:
        raise LLMUnavailable("The AI service returned an error. Try again in a moment.") from error
    except openai.APIConnectionError as error:
        raise LLMUnavailable("Could not reach the AI service. Check the internet connection.") from error

    if not completion.choices:
        raise LLMUnavailable("The AI returned an empty answer. Try again.")
    choice = completion.choices[0]
    if getattr(choice.message, "refusal", None) or choice.finish_reason == "content_filter":
        raise LLMUnavailable("The AI declined to answer this request.")
    if choice.finish_reason == "length":
        raise LLMUnavailable("The AI answer was cut off. Try again.")
    if not choice.message.content:
        raise LLMUnavailable("The AI returned an empty answer. Try again.")
    try:
        answer = json.loads(choice.message.content)
    except json.JSONDecodeError as error:
        raise LLMUnavailable("The AI returned an answer that could not be read. Try again.") from error
    if not isinstance(answer, dict):
        raise LLMUnavailable("The AI returned an answer that could not be read. Try again.")
    return answer
