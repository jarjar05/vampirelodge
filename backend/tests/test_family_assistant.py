from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

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


def _task(client, title, **fields):
    response = client.post("/api/families/me/tasks", json={"title": title, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def _in(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def test_answers_from_the_familys_tasks_and_people(family, fake_model):
    admin, member = family
    pharmacy = _task(admin, "Pick up medication", location="Oak Pharmacy", due_at=_in(3), assignee_id=member.user_id)
    done = _task(admin, "Call Mum", assignee_id=admin.user_id)
    admin.post(f"/api/families/me/tasks/{done['id']}/complete")
    fake_model.answer = {"answer": "  Your sister is collecting the medication this afternoon.  ", "related_task_ids": [pharmacy["id"], "not-a-task"]}

    response = admin.post("/api/families/me/ask", json={"question": "Who is getting the medicine?", "timezone": "Asia/Singapore"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"] == "Your sister is collecting the medication this afternoon."
    # Only ids of real tasks come back.
    assert body["task_ids"] == [pharmacy["id"]]

    request = fake_model.requests[0]
    prompt = request["prompt"]
    assert "Who is getting the medicine?" in prompt
    assert "Pick up medication" in prompt and "Oak Pharmacy" in prompt
    assert "Call Mum" in prompt and "finished_in_last_14_days" in prompt
    schema = request["schema"]
    assert schema["additionalProperties"] is False and sorted(schema["required"]) == sorted(schema["properties"])


def test_earlier_turns_are_sent_for_follow_up_questions(family, fake_model):
    admin, _member = family
    fake_model.answer = {"answer": "Tomorrow at 10 AM.", "related_task_ids": []}
    history = [{"role": "user", "text": "What does Jerry have on?"}, {"role": "assistant", "text": "Jerry is taking Grandma to the clinic."}]
    response = admin.post("/api/families/me/ask", json={"question": "When is that?", "history": history})
    assert response.status_code == 200, response.text
    prompt = fake_model.requests[0]["prompt"]
    assert "Me: What does Jerry have on?" in prompt and "You: Jerry is taking Grandma to the clinic." in prompt


def test_tasks_from_another_family_are_never_included(family, login, fake_model):
    admin, _member = family
    _task(admin, "Our own task")
    outsider = login("Olive")
    assert outsider.post("/api/families", json={"name": "Other Family"}).status_code == 201
    _task(outsider, "Someone else's secret task")
    fake_model.answer = {"answer": "You have one task.", "related_task_ids": []}
    admin.post("/api/families/me/ask", json={"question": "What is on?"})
    prompt = fake_model.requests[0]["prompt"]
    assert "Our own task" in prompt and "Someone else's secret task" not in prompt


def test_reports_when_the_model_is_unavailable(family, fake_model):
    admin, _member = family
    fake_model.error = llm.LLMUnavailable("AI suggestions are not set up yet.")
    response = admin.post("/api/families/me/ask", json={"question": "Anything due today?"})
    assert response.status_code == 503
    assert response.json()["detail"] == "AI suggestions are not set up yet."


def test_needs_a_question_and_a_family(family, login):
    admin, _member = family
    assert admin.post("/api/families/me/ask", json={"question": ""}).status_code == 422
    loner = login("Lee")
    assert loner.post("/api/families/me/ask", json={"question": "Hello?"}).status_code in (403, 404)
