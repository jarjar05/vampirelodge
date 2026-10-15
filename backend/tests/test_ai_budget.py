"""The app's own monthly spending limit on the AI."""

import json
from types import SimpleNamespace

import pytest

from app.services import ai_budget, llm

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}


@pytest.fixture
def model(monkeypatch):
    """A stand-in for OpenAI that answers every call and reports 1M input and 100k output tokens."""
    calls = []

    def create(**request):
        calls.append(request)
        message = SimpleNamespace(content=json.dumps({"ok": True}), refusal=None)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message, finish_reason="stop")],
            usage=SimpleNamespace(prompt_tokens=1_000_000, completion_tokens=100_000),
        )

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(llm, "_client", SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    return calls


def _ask():
    return llm.generate_json(system="s", prompt="p", schema=SCHEMA)


def test_each_call_is_costed_and_added_to_the_month(model, monkeypatch):
    monkeypatch.setenv("AI_INPUT_PRICE_PER_MILLION", "2")
    monkeypatch.setenv("AI_OUTPUT_PRICE_PER_MILLION", "8")
    _ask()
    _ask()
    month = ai_budget.usage()
    assert month.requests == 2 and month.input_tokens == 2_000_000 and month.output_tokens == 200_000
    # Each call: 1M in at $2 plus 0.1M out at $8 = $2.80.
    assert month.cost_usd == pytest.approx(5.60)


def test_the_ai_pauses_once_the_limit_is_reached(model, monkeypatch):
    monkeypatch.setenv("AI_MONTHLY_BUDGET_USD", "5")
    monkeypatch.setenv("AI_INPUT_PRICE_PER_MILLION", "2")
    monkeypatch.setenv("AI_OUTPUT_PRICE_PER_MILLION", "8")
    _ask()  # $2.80
    _ask()  # $5.60: the last call may take it a little over
    with pytest.raises(llm.LLMUnavailable, match="spending limit has been reached"):
        _ask()
    assert len(model) == 2  # the third was never sent

    # Raising the limit turns it back on.
    monkeypatch.setenv("AI_MONTHLY_BUDGET_USD", "20")
    assert _ask() == {"ok": True}


def test_a_limit_without_prices_keeps_the_ai_off(model, monkeypatch):
    monkeypatch.setenv("AI_MONTHLY_BUDGET_USD", "5")
    monkeypatch.delenv("AI_INPUT_PRICE_PER_MILLION", raising=False)
    with pytest.raises(llm.LLMUnavailable, match="prices are not"):
        _ask()
    assert model == []


def test_no_limit_means_no_pause(model, monkeypatch):
    monkeypatch.delenv("AI_MONTHLY_BUDGET_USD", raising=False)
    assert _ask() == {"ok": True}


def test_suggestions_fall_back_to_the_rules_when_paused(family, model, monkeypatch):
    admin, _member = family
    monkeypatch.setenv("AI_MONTHLY_BUDGET_USD", "0")
    monkeypatch.setenv("AI_INPUT_PRICE_PER_MILLION", "2")
    monkeypatch.setenv("AI_OUTPUT_PRICE_PER_MILLION", "8")
    task = admin.post("/api/families/me/tasks", json={"title": "Sort out the post"}).json()
    response = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion")
    assert response.status_code == 503 and "spending limit" in response.json()["detail"]
    # The free, rule-based suggestion still works.
    assert admin.get(f"/api/families/me/tasks/{task['id']}/quick-suggestion").status_code == 200
    assert model == []
