from pydantic import BaseModel, Field


class KnowledgeDocumentInput(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    category: str = Field(min_length=1, max_length=80)
    source: str = Field(min_length=1, max_length=500)


class KnowledgeBatchInput(BaseModel):
    documents: list[KnowledgeDocumentInput] = Field(min_length=1, max_length=100)


class KnowledgeDocumentResponse(BaseModel):
    id: str
    family_id: str
    category: str
    source: str
    created_at: str


class KnowledgeSearchResult(BaseModel):
    id: str
    content: str
    metadata: dict[str, str]
    distance: float | None = None