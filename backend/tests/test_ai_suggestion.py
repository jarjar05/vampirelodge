import json
from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import llm


@pytest.fixture
def fake_model(monkeypatch):
    """Replace the model call. Records what was sent; answers with whatever `answer` is set to."""
    calls = SimpleNamespace(requests=[], answer=None, error=None)

    def generate_json(**kwargs):
        calls.requests.append(kwargs)
        if calls.error:
            raise calls.error
        return calls.answer(kwargs) if callable(calls.answer) else calls.answer

    monkeypatch.setattr(llm, "generate_json", generate_json)
    return calls


def _task(client, **overrides):
    return client.post("/api/families/me/tasks", json={"title": "Pick up medication", "detail": "Oak Pharmacy", **overrides}).json()


def test_suggestion_uses_members_workload_and_family_notes(family, fake_model):
    admin, member = family
    member.patch(f"/api/families/me/members/{member.user_id}", json={"relationship_label": "Son", "availability": "Away today"})
    _task(admin, title="Call clinic", assignee_id=member.user_id)
    admin.post("/api/families/me/knowledge", json={"title": "Who does what", "category": "care_note", "content": "Alice collects medication from Oak Pharmacy."})
    task = _task(admin)
    fake_model.answer = {"member_ids": [admin.user_id], "reason": "Alice is available and already collects medication."}

    response = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "member_id": admin.user_id,
        "member_ids": [admin.user_id],
        "reason": "Alice is available and already collects medication.",
        "note_titles": ["Who does what"],
    }

    request = fake_model.requests[0]
    prompt = request["prompt"]
    assert "Pick up medication" in prompt and "Oak Pharmacy" in prompt
    assert '"availability": "Away today"' in prompt and '"role_in_family": "Son"' in prompt
    assert "Call clinic" in prompt  # Ben's existing workload
    assert "Alice collects medication from Oak Pharmacy." in prompt
    # The model can only answer with a member of this family.
    assert sorted(request["schema"]["properties"]["member_ids"]["items"]["enum"]) == sorted([admin.user_id, member.user_id])
    # Nothing was assigned by asking.
    listed = {item["id"]: item for item in admin.get("/api/families/me/tasks").json()}
    assert listed[task["id"]]["assignee_id"] is None


def test_other_families_notes_and_members_never_reach_the_prompt(family, login, fake_model):
    admin, _member = family
    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    outsider.post("/api/families/me/knowledge", json={"title": "Private", "category": "care_note", "content": "Olivia secret medication note."})
    task = _task(admin)
    fake_model.answer = {"member_ids": [admin.user_id], "reason": "Available."}

    assert admin.post(f"/api/families/me/tasks/{task['id']}/suggestion").status_code == 200
    prompt = fake_model.requests[0]["prompt"]
    assert "Olivia" not in prompt and "secret" not in prompt
    assert outsider.user_id not in json.dumps(fake_model.requests[0]["schema"])
    assert outsider.post(f"/api/families/me/tasks/{task['id']}/suggestion").status_code == 404


def test_unusable_or_missing_answers_become_a_503(family, fake_model, login):
    admin, _member = family
    task = _task(admin)
    outsider = login("Olivia")

    for answer in ({"member_ids": [outsider.user_id], "reason": "x"}, {"member_ids": [admin.user_id], "reason": "  "}, {"member_ids": [], "reason": "x"}, {}):
        fake_model.answer = answer
        assert admin.post(f"/api/families/me/tasks/{task['id']}/suggestion").status_code == 503, answer

    fake_model.error = llm.LLMUnavailable("The AI service is busy. Try again in a moment.")
    response = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion")
    assert response.status_code == 503
    assert response.json()["detail"] == "The AI service is busy. Try again in a moment."


def test_suggestion_still_works_when_notes_cannot_be_searched(family, fake_model, monkeypatch):
    from app.services import chroma_service

    admin, _member = family
    task = _task(admin)
    fake_model.answer = {"member_ids": [admin.user_id], "reason": "Available."}

    def fail(**_kwargs):
        raise chroma_service.ChromaServiceError("down")

    monkeypatch.setattr(chroma_service, "search_chunks", fail)
    response = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion")
    assert response.status_code == 200
    assert response.json()["note_titles"] == []


def test_without_an_api_key_no_request_is_made(family, monkeypatch):
    admin, _member = family
    task = _task(admin)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "_get_client", lambda: pytest.fail("the model must not be called without a key"))

    response = admin.post(f"/api/families/me/tasks/{task['id']}/suggestion")
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


class FakeOpenAIClient:
    """Stands in for openai.OpenAI(); records the request and returns a canned completion."""

    def __init__(self, completion):
        self.request = None
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self._completion = completion

    def _create(self, **kwargs):
        self.request = kwargs
        return self._completion


def _completion(content=None, finish_reason="stop", refusal=None):
    message = SimpleNamespace(content=content, refusal=refusal)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])


def test_generate_json_sends_the_expected_request(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = FakeOpenAIClient(_completion('{"member_id": "a", "reason": "b"}'))
    monkeypatch.setattr(llm, "_get_client", lambda: client)
    schema = {"type": "object", "properties": {}, "required": [], "additionalProperties": False}

    assert llm.generate_json(system="sys", prompt="who?", schema=schema, schema_name="pick") == {"member_id": "a", "reason": "b"}
    # The model comes from LLM_MODEL in backend/.env, so compare with the setting rather than a fixed name.
    assert client.request["model"] == settings.llm_model
    assert client.request["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "who?"}]
    assert client.request["response_format"] == {"type": "json_schema", "json_schema": {"name": "pick", "strict": True, "schema": schema}}
    # Newer models reject the old max_tokens name and non-default sampling settings.
    assert "max_completion_tokens" in client.request
    assert not {"max_tokens", "temperature", "top_p"} & client.request.keys()


def test_the_assignment_schema_meets_strict_mode_rules(family, fake_model):
    admin, _member = family
    task = _task(admin)
    fake_model.answer = {"member_ids": [admin.user_id], "reason": "Available."}
    admin.post(f"/api/families/me/tasks/{task['id']}/suggestion")

    request = fake_model.requests[0]
    schema = request["schema"]
    assert schema["additionalProperties"] is False
    assert sorted(schema["required"]) == sorted(schema["properties"])
    assert request["schema_name"] == "assignment_suggestion"


@pytest.mark.parametrize("completion", [
    _completion(refusal="I can't help with that."),
    _completion(finish_reason="content_filter"),
    _completion('{"cut', finish_reason="length"),
    _completion(None),
    _completion("not json"),
    _completion("[1]"),
    SimpleNamespace(choices=[]),
])
def test_generate_json_rejects_unusable_responses(monkeypatch, completion):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(llm, "_get_client", lambda: FakeOpenAIClient(completion))
    with pytest.raises(llm.LLMUnavailable):
        llm.generate_json(system="s", prompt="p", schema={})


def test_api_errors_become_readable_messages(monkeypatch):
    import httpx
    import openai

    monkeypatch.setenv("OPENAI_API_KEY", "bad-key")
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")

    def failing_client(error):
        def create(**_kwargs):
            raise error
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    cases = [
        (openai.AuthenticationError("bad", response=httpx.Response(401, request=request), body=None), "rejected the API key"),
        (openai.NotFoundError("no model", response=httpx.Response(404, request=request), body=None), "was not found"),
        (openai.RateLimitError("slow", response=httpx.Response(429, request=request), body=None), "busy or the account is out of credit"),
        (openai.APIConnectionError(request=request), "Could not reach"),
    ]
    for error, expected in cases:
        monkeypatch.setattr(llm, "_get_client", lambda error=error: failing_client(error))
        with pytest.raises(llm.LLMUnavailable, match=expected):
            llm.generate_json(system="s", prompt="p", schema={})
