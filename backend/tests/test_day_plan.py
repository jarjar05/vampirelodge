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


def _in(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _task(client, title, **fields):
    response = client.post("/api/families/me/tasks", json={"title": title, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def _in_listed_order(request):
    """Answer with every task the model was offered, in the order it was offered."""
    ids = request["schema"]["properties"]["steps"]["items"]["properties"]["task_id"]["enum"]
    return {"summary": "You have a few things on today.", "steps": [{"task_id": task_id, "note": "Due soon."} for task_id in ids]}


def test_plan_covers_only_my_open_tasks(family, fake_model):
    admin, member = family
    pharmacy = _task(admin, "Pick up medication", location="Oak Pharmacy", due_at=_in(3), priority="High", assignee_id=admin.user_id)
    overdue = _task(admin, "Pay medical bill", due_at=_in(-5), assignee_id=admin.user_id)
    done = _task(admin, "Call Mum", assignee_id=admin.user_id)
    admin.post(f"/api/families/me/tasks/{done['id']}/complete")
    _task(admin, "Walk the dog", assignee_id=member.user_id)
    _task(admin, "Nobody has this yet")
    fake_model.answer = {
        "summary": "  Pay the overdue bill first, then collect the medication.  ",
        "steps": [{"task_id": pharmacy["id"], "note": "Due this afternoon."}, {"task_id": overdue["id"], "note": "Already overdue."}],
    }

    response = admin.post("/api/families/me/day-plan", json={"timezone": "Asia/Singapore"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == "Pay the overdue bill first, then collect the medication."
    assert body["steps"] == [
        {"task_id": pharmacy["id"], "note": "Due this afternoon."},
        {"task_id": overdue["id"], "note": "Already overdue."},
    ]

    request = fake_model.requests[0]
    prompt = request["prompt"]
    assert "Pick up medication" in prompt and "Oak Pharmacy" in prompt and "Pay medical bill" in prompt
    assert '"overdue": true' in prompt and '"overdue": false' in prompt
    for absent in ("Call Mum", "Walk the dog", "Nobody has this yet"):
        assert absent not in prompt
    schema = request["schema"]
    step_schema = schema["properties"]["steps"]["items"]
    assert sorted(step_schema["properties"]["task_id"]["enum"]) == sorted([pharmacy["id"], overdue["id"]])
    # Strict structured output: every object lists all its properties as required and allows no others.
    for part in (schema, step_schema):
        assert part["additionalProperties"] is False and sorted(part["required"]) == sorted(part["properties"])
    assert request["schema_name"] == "day_plan"


def test_times_are_given_in_the_persons_time_zone(family, fake_model):
    admin, _member = family
    due = datetime(2031, 3, 4, 1, 30, tzinfo=timezone.utc)
    _task(admin, "Pick up medication", due_at=due.isoformat(), assignee_id=admin.user_id)
    fake_model.answer = _in_listed_order

    admin.post("/api/families/me/day-plan", json={"timezone": "Asia/Singapore"})
    assert "Tuesday 04 March 2031, 09:30" in fake_model.requests[0]["prompt"]
    # An unknown zone falls back to UTC rather than failing.
    assert admin.post("/api/families/me/day-plan", json={"timezone": "Not/AZone"}).status_code == 200
    assert "Tuesday 04 March 2031, 01:30" in fake_model.requests[1]["prompt"]


def test_no_open_tasks_means_no_model_call(family, fake_model):
    admin, member = family
    _task(admin, "Walk the dog", assignee_id=member.user_id)

    response = admin.post("/api/families/me/day-plan", json={})
    assert response.status_code == 200
    assert response.json() == {"summary": None, "steps": [], "generated_at": None}
    assert fake_model.requests == []


def test_plan_is_reused_until_my_tasks_change_or_i_ask_again(family, fake_model):
    admin, member = family
    first = _task(admin, "Pick up medication", assignee_id=admin.user_id)
    fake_model.answer = _in_listed_order
    plan = lambda client=admin, **body: client.post("/api/families/me/day-plan", json={"timezone": "Asia/Singapore", **body})  # noqa: E731

    original = plan().json()
    assert plan().json() == original
    assert len(fake_model.requests) == 1

    # Someone else's task changing does not affect my plan.
    _task(admin, "Walk the dog", assignee_id=member.user_id)
    plan()
    assert len(fake_model.requests) == 1

    # Each person has their own plan.
    plan(member)
    assert len(fake_model.requests) == 2

    plan(refresh=True)
    assert len(fake_model.requests) == 3

    _task(admin, "Pay medical bill", assignee_id=admin.user_id)
    assert len(plan().json()["steps"]) == 2
    assert len(fake_model.requests) == 4

    admin.post(f"/api/families/me/tasks/{first['id']}/complete")
    assert len(plan().json()["steps"]) == 1
    assert len(fake_model.requests) == 5


def test_steps_are_cleaned_up(family, fake_model, login):
    admin, member = family
    first = _task(admin, "First", due_at=_in(1), assignee_id=admin.user_id)
    second = _task(admin, "Second", due_at=_in(2), assignee_id=admin.user_id)
    third = _task(admin, "Third", due_at=_in(3), assignee_id=admin.user_id)
    someone_elses = _task(admin, "Walk the dog", assignee_id=member.user_id)
    fake_model.answer = {
        "summary": "Start with the second task.",
        "steps": [
            {"task_id": second["id"], "note": "Most urgent."},
            {"task_id": someone_elses["id"], "note": "Not mine."},
            {"task_id": second["id"], "note": "Repeated."},
            {"task_id": first["id"], "note": "Then this."},
        ],
    }

    steps = admin.post("/api/families/me/day-plan", json={}).json()["steps"]
    # Unknown and repeated tasks are dropped; a task the model left out is added at the end.
    assert steps == [
        {"task_id": second["id"], "note": "Most urgent."},
        {"task_id": first["id"], "note": "Then this."},
        {"task_id": third["id"], "note": ""},
    ]


def test_unusable_answers_and_failures_become_a_503_and_are_not_kept(family, fake_model):
    admin, _member = family
    task = _task(admin, "Pick up medication", assignee_id=admin.user_id)

    for answer in ({}, {"summary": "  ", "steps": [{"task_id": task["id"], "note": "x"}]}, {"summary": "Fine.", "steps": []}, {"summary": "Fine.", "steps": "none"}):
        fake_model.answer = answer
        assert admin.post("/api/families/me/day-plan", json={}).status_code == 503, answer

    fake_model.error = llm.LLMUnavailable("The AI service is busy. Try again in a moment.")
    response = admin.post("/api/families/me/day-plan", json={})
    assert response.status_code == 503
    assert response.json()["detail"] == "The AI service is busy. Try again in a moment."

    fake_model.error = None
    fake_model.answer = _in_listed_order
    assert admin.post("/api/families/me/day-plan", json={}).status_code == 200


def test_plan_requires_a_family_member(login, fake_model):
    outsider = login("Olivia")
    assert outsider.post("/api/families/me/day-plan", json={}).status_code in (403, 404)
    assert fake_model.requests == []
