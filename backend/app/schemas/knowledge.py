import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class KnowledgeDocumentInput(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    category: str = Field(min_length=1, max_length=80)
    # Where the text came from, e.g. a file name. Defaults to "Added in the app".
    source: str = Field(default="Added in the app", min_length=1, max_length=500)
    # Shown in lists and given to the assistant alongside each excerpt. Defaults to the source.
    title: str | None = Field(default=None, max_length=200)

    @field_validator("content", "category", "source")
    @classmethod
    def must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("title")
    @classmethod
    def blank_title_to_none(cls, title: str | None) -> str | None:
        return (title or "").strip() or None


class KnowledgeBatchInput(BaseModel):
    documents: list[KnowledgeDocumentInput] = Field(min_length=1, max_length=100)


class KnowledgeDocumentResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    title: str
    category: str
    source: str
    content: str
    chunk_count: int
    created_by_id: uuid.UUID | None
    created_by_name: str | None
    created_at: datetime


class KnowledgeSearchResult(BaseModel):
    """One matching excerpt. `document_id` and `title` identify the document it came from."""

    id: str
    document_id: str
    title: str
    category: str
    content: str
    distance: float | None = None
