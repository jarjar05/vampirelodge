import base64
import io
import zipfile
from email.message import EmailMessage
from types import SimpleNamespace

import pytest

from app.services import document_tasks, llm

LETTER = (
    "Dear Parents, the school bookshop will sell uniforms and textbooks for the new term on "
    "Saturday 14 November from 9.00am to 1.00pm in the School Hall. Payment by PayNow or NETS only."
)


@pytest.fixture
def fake_model(monkeypatch):
    calls = SimpleNamespace(requests=[], answer=None, error=None)

    def generate_json(**kwargs):
        calls.requests.append(kwargs)
        if calls.error:
            raise calls.error
        return calls.answer

    monkeypatch.setattr(llm, "generate_json", generate_json)
    return calls


def _draft(**overrides):
    return {"title": "Buy school uniform and books", "details": "PayNow or NETS only.", "location": "School Hall", "due_date": "2031-11-14", "due_time": "09:00", "priority": "Normal", **overrides}


def _pdf(text: str) -> bytes:
    """A minimal one-page PDF containing `text`."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % number + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for offset in offsets:
        out.write(b"%010d 00000 n \n" % offset)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref))
    return out.getvalue()


def _docx(text: str) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>",
        )
    return out.getvalue()


def _eml(text: str, html: bool = False) -> bytes:
    message = EmailMessage()
    message["Subject"] = "Uniform and book sale"
    message["From"] = "office@school.example"
    message.set_content(f"<html><style>p{{color:red}}</style><body><p>{text}</p><script>x()</script></body></html>" if html else text, subtype="html" if html else "plain")
    return message.as_bytes()


@pytest.mark.parametrize("filename, content_type, data", [
    ("letter.pdf", "application/pdf", _pdf(LETTER)),
    ("letter.pdf", "", _pdf(LETTER)),
    ("letter.docx", "application/octet-stream", _docx(LETTER)),
    ("letter.eml", "message/rfc822", _eml(LETTER)),
    ("letter.eml", "", _eml(LETTER, html=True)),
    ("letter.txt", "text/plain", LETTER.encode()),
    ("letter.html", "text/html", f"<p>{LETTER}</p>".encode()),
])
def test_text_is_read_from_each_kind_of_document(filename, content_type, data):
    text, images = document_tasks.read_document(filename, content_type, data)
    assert images == []
    assert "uniforms and textbooks" in " ".join(text.split()) and "School Hall" in text
    assert "<p>" not in text and "x()" not in text and "color:red" not in text


def test_an_email_keeps_its_subject():
    text, _images = document_tasks.read_document("letter.eml", "message/rfc822", _eml(LETTER))
    assert "Subject: Uniform and book sale" in text


def test_a_picture_is_passed_on_for_the_model_to_read():
    text, images = document_tasks.read_document("letter.jpg", "image/jpeg", b"\xff\xd8fake")
    assert text == "" and images == [("image/jpeg", b"\xff\xd8fake")]


@pytest.mark.parametrize("filename, content_type, data, message", [
    ("empty.pdf", "application/pdf", b"", "empty"),
    ("big.txt", "text/plain", b"a" * (document_tasks.MAX_FILE_BYTES + 1), "too large"),
    ("photo.heic", "image/heic", b"abc", "picture format"),
    ("scan.pdf", "application/pdf", _pdf("Hi"), "no readable text"),
    ("broken.pdf", "application/pdf", b"%PDF-1.4 not really", "could not be read"),
    ("broken.docx", "", b"not a zip", "could not be read"),
    ("archive.zip", "application/zip", b"PK\x03\x04", "not supported"),
    ("blank.txt", "text/plain", b"   \n ", "No text"),
])
def test_unreadable_files_are_refused_with_a_reason(filename, content_type, data, message):
    with pytest.raises(document_tasks.DocumentError, match=message):
        document_tasks.read_document(filename, content_type, data)


def _upload(client, data: bytes, filename="letter.txt", content_type="text/plain", **extra):
    return client.post("/api/families/me/tasks/from-document", json={"filename": filename, "content_type": content_type, "data_base64": base64.b64encode(data).decode(), **extra})


def test_drafts_come_back_for_review_and_nothing_is_created(family, fake_model):
    admin, _member = family
    fake_model.answer = {"document_summary": "  A school letter about a uniform and book sale.  ", "tasks": [_draft(recurrence="weekly"), _draft(title="Return the consent form", location=None, due_date=None, due_time=None, priority="High", recurrence="monthly")]}

    response = _upload(admin, LETTER.encode(), timezone="Asia/Singapore")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "summary": "A school letter about a uniform and book sale.",
        "tasks": [
            {"title": "Buy school uniform and books", "detail": "PayNow or NETS only.", "location": "School Hall", "due_date": "2031-11-14", "due_time": "09:00:00", "priority": "Normal", "recurrence": "weekly"},
            {"title": "Return the consent form", "detail": "PayNow or NETS only.", "location": None, "due_date": None, "due_time": None, "priority": "High", "recurrence": None},
        ],
    }
    assert admin.get("/api/families/me/tasks").json() == []
    assert admin.get("/api/families/me/knowledge").json() == []

    request = fake_model.requests[0]
    assert f"<document>\n{LETTER}\n</document>" in request["prompt"] and "<today>" in request["prompt"]
    assert request["images"] is None and request["schema_name"] == "document_tasks"
    # Strict structured output: every object lists all its properties as required and allows no others.
    schema = request["schema"]
    for part in (schema, schema["properties"]["tasks"]["items"]):
        assert part["additionalProperties"] is False and sorted(part["required"]) == sorted(part["properties"])


def test_pasted_text_and_pictures_are_accepted(family, fake_model):
    admin, _member = family
    fake_model.answer = {"document_summary": "An email.", "tasks": []}

    response = admin.post("/api/families/me/tasks/from-document", json={"text": f"  {LETTER}  "})
    assert response.status_code == 200 and response.json() == {"summary": "An email.", "tasks": []}
    assert LETTER in fake_model.requests[0]["prompt"]

    assert _upload(admin, b"\x89PNGfake", "letter.png", "image/png").status_code == 200
    request = fake_model.requests[1]
    assert request["images"] == [("image/png", b"\x89PNGfake")] and "attached picture" in request["prompt"]


def test_model_answers_are_cleaned_before_they_reach_the_form(family, fake_model):
    admin, _member = family
    fake_model.answer = {
        "document_summary": "A letter.",
        "tasks": [
            _draft(title="  " + "x" * 150, details="y" * 900, location="  ", due_date="14 November", due_time="9am", priority="Urgent"),
            _draft(title="   "),
            "not a task",
            _draft(due_date="2031-02-30", due_time="25:00"),
            *[_draft(title=f"Extra {number}") for number in range(6)],
        ],
    }
    tasks = _upload(admin, LETTER.encode()).json()["tasks"]
    assert len(tasks) == document_tasks.MAX_DRAFTS
    assert len(tasks[0]["title"]) == 100 and len(tasks[0]["detail"]) == 500
    assert tasks[0]["location"] is None and tasks[0]["due_date"] is None and tasks[0]["due_time"] is None and tasks[0]["priority"] == "Normal"
    assert tasks[1]["due_date"] is None and tasks[1]["due_time"] is None


def test_bad_uploads_and_model_failures_are_reported(family, fake_model, login):
    admin, _member = family
    fake_model.answer = {"document_summary": "x", "tasks": []}

    for body in ({}, {"text": "   "}, {"data_base64": "not base64!!"}, {"filename": "a.zip", "data_base64": base64.b64encode(b"PK").decode()}):
        assert admin.post("/api/families/me/tasks/from-document", json=body).status_code == 400, body
    assert fake_model.requests == []

    fake_model.answer = {"document_summary": "x"}
    assert _upload(admin, LETTER.encode()).status_code == 503
    fake_model.error = llm.LLMUnavailable("The AI service is busy. Try again in a moment.")
    response = _upload(admin, LETTER.encode())
    assert response.status_code == 503 and response.json()["detail"] == "The AI service is busy. Try again in a moment."

    # Someone with no family cannot use it.
    assert _upload(login("Olivia"), LETTER.encode()).status_code in (403, 404)


def test_pictures_are_sent_to_the_model_as_image_parts(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        message = SimpleNamespace(content='{"ok": true}', refusal=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="stop")])

    monkeypatch.setattr(llm, "_get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    llm.generate_json(system="s", prompt="read this", schema={}, images=[("image/png", b"abc")])
    assert captured["messages"][1]["content"] == [
        {"type": "text", "text": "read this"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,YWJj"}},
    ]
