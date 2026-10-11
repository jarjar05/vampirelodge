from app.services.chunking import MAX_CHUNK_CHARS, chunk_text

LONG_PLAN = "\n\n".join(
    f"Section {number}. " + " ".join(f"Detail {number}-{sentence} about the care routine." for sentence in range(12))
    for number in range(8)
) + "\n\nEmergency contact: Dr Tan at Riverside, phone 6123 4567."


def test_short_text_is_one_chunk():
    assert chunk_text("  Mum takes amlodipine at 8am.  ") == ["Mum takes amlodipine at 8am."]
    assert chunk_text("   ") == []


def test_long_text_is_split_within_the_embedding_limit_and_loses_nothing():
    chunks = chunk_text(LONG_PLAN)
    assert len(chunks) > 3
    assert all(len(chunk) <= MAX_CHUNK_CHARS for chunk in chunks)
    # Every sentence of the original appears in some chunk, including the very last line.
    joined = " ".join(chunks)
    for number in range(8):
        for sentence in range(12):
            assert f"Detail {number}-{sentence} about the care routine." in joined
    assert "Dr Tan at Riverside, phone 6123 4567." in chunks[-1]


def test_chunks_overlap_so_boundary_facts_are_not_lost():
    chunks = chunk_text(LONG_PLAN)
    for previous, following in zip(chunks, chunks[1:]):
        assert following.split("\n\n")[0] in previous


def test_text_without_any_breaks_is_still_split():
    chunks = chunk_text("x" * 5000)
    assert all(len(chunk) <= MAX_CHUNK_CHARS for chunk in chunks)
    assert sum(chunk.count("x") for chunk in chunks) >= 5000


def _add(client, **overrides):
    body = {"title": "Medication list", "category": "medication", "content": "Mum takes amlodipine at 8am.", **overrides}
    response = client.post("/api/families/me/knowledge", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_documents_are_listed_newest_first_with_author_and_content(family):
    admin, member = family
    _add(admin)
    _add(member, title="Care plan", category="care_note", content=LONG_PLAN)

    listed = admin.get("/api/families/me/knowledge").json()
    assert {document["title"] for document in listed} == {"Medication list", "Care plan"}
    plan = next(document for document in listed if document["title"] == "Care plan")
    assert plan["created_by_name"] == "Ben"
    assert plan["content"] == LONG_PLAN
    assert plan["chunk_count"] == len(chunk_text(LONG_PLAN)) > 3


def test_the_end_of_a_long_document_is_searchable(family, knowledge_store):
    admin, _member = family
    document = _add(admin, title="Care plan", content=LONG_PLAN)
    assert len(knowledge_store.rows) == document["chunk_count"]

    results = admin.get("/api/families/me/knowledge/search", params={"query": "emergency contact phone Dr Tan"}).json()
    assert results[0]["document_id"] == document["id"]
    assert results[0]["title"] == "Care plan"
    assert "6123 4567" in results[0]["content"]


def test_title_defaults_to_the_source(family):
    admin, _member = family
    created = admin.post("/api/families/me/knowledge", json={"content": "Notes", "category": "care_note", "source": "care-plan.pdf"})
    assert created.json()["title"] == "care-plan.pdf"
    assert admin.post("/api/families/me/knowledge", json={"content": "   ", "category": "care_note"}).status_code == 422


def test_knowledge_is_family_scoped(family, login, knowledge_store):
    admin, _member = family
    document = _add(admin, content="Mum takes amlodipine at 8am.")

    outsider = login("Olivia")
    outsider.post("/api/families", json={"name": "Other Family"})
    assert outsider.get("/api/families/me/knowledge").json() == []
    assert outsider.get("/api/families/me/knowledge/search", params={"query": "amlodipine"}).json() == []
    assert outsider.delete(f"/api/families/me/knowledge/{document['id']}").status_code == 404
    assert len(knowledge_store.rows) == 1


def test_deleting_a_document_removes_its_chunks(family, knowledge_store):
    admin, member = family
    keep = _add(admin, title="Keep me", content="Physio is on Thursdays.")
    remove = _add(admin, title="Care plan", content=LONG_PLAN)

    assert member.delete(f"/api/families/me/knowledge/{remove['id']}").status_code == 204
    assert [document["id"] for document in admin.get("/api/families/me/knowledge").json()] == [keep["id"]]
    assert {metadata["document_id"] for _content, metadata in knowledge_store.rows.values()} == {keep["id"]}
    assert member.delete(f"/api/families/me/knowledge/{remove['id']}").status_code == 404


def test_batch_add(family, knowledge_store):
    admin, _member = family
    response = admin.post("/api/families/me/knowledge/batch", json={"documents": [
        {"title": "A", "category": "care_note", "content": "First note."},
        {"title": "B", "category": "care_note", "content": "Second note."},
    ]})
    assert response.status_code == 201, response.text
    assert [document["title"] for document in response.json()] == ["A", "B"]
    assert len(knowledge_store.rows) == 2


def test_nothing_is_saved_when_indexing_fails(family, monkeypatch):
    from app.services import chroma_service

    admin, _member = family

    def fail(_chunks):
        raise chroma_service.ChromaServiceError("Could not add documents to the knowledge collection")

    monkeypatch.setattr(chroma_service, "add_chunks", fail)
    assert admin.post("/api/families/me/knowledge", json={"title": "x", "category": "care_note", "content": "y"}).status_code == 503
    assert admin.get("/api/families/me/knowledge").json() == []
