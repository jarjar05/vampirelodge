from dataclasses import dataclass
from typing import Any, Sequence

import chromadb

from app.config import settings

COLLECTION_NAME = "family_care_knowledge"


class ChromaServiceError(RuntimeError):
    """Raised when a semantic knowledge operation fails."""


@dataclass(frozen=True)
class KnowledgeChunk:
    """One searchable piece of a knowledge document."""

    document_id: str
    chunk_index: int
    content: str
    family_id: str
    title: str
    category: str
    source: str

    @property
    def id(self) -> str:
        return f"{self.document_id}:{self.chunk_index}"


_client: Any | None = None
_collection: Any | None = None


def initialize_collection() -> Any:
    """Create or open the persistent family-care knowledge collection."""
    global _client, _collection
    try:
        settings.chroma_persist_directory.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(settings.chroma_persist_directory))
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        return _collection
    except Exception as error:
        _client = None
        _collection = None
        raise ChromaServiceError("Could not initialize the local knowledge collection") from error


def _get_collection() -> Any:
    if _collection is None:
        return initialize_collection()
    return _collection


def _as_metadata(chunk: KnowledgeChunk) -> dict[str, str | int]:
    return {
        "family_id": chunk.family_id,
        "document_id": chunk.document_id,
        "chunk_index": chunk.chunk_index,
        "title": chunk.title,
        "category": chunk.category,
        "source": chunk.source,
    }


def add_chunks(chunks: Sequence[KnowledgeChunk]) -> None:
    """Add or replace chunks, each tagged with its family and parent document."""
    if not chunks:
        return
    try:
        _get_collection().upsert(
            ids=[chunk.id for chunk in chunks],
            documents=[chunk.content for chunk in chunks],
            metadatas=[_as_metadata(chunk) for chunk in chunks],
        )
    except Exception as error:
        raise ChromaServiceError("Could not add documents to the knowledge collection") from error


def search_chunks(
    query: str,
    family_id: str,
    limit: int = 5,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Search semantically within one family's chunks only."""
    if not query.strip() or not family_id.strip():
        raise ValueError("query and family_id must not be empty")
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")

    filters: dict[str, Any] = {"family_id": family_id.strip()}
    if category:
        filters = {"$and": [filters, {"category": category.strip()}]}

    try:
        result = _get_collection().query(
            query_texts=[query.strip()],
            n_results=limit,
            where=filters,
            include=["documents", "metadatas", "distances"],
        )
        ids = result.get("ids", [[]])[0]
        contents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        return [
            {
                "id": chunk_id,
                "content": contents[index],
                "metadata": metadatas[index],
                "distance": distances[index] if index < len(distances) else None,
            }
            for index, chunk_id in enumerate(ids)
        ]
    except Exception as error:
        raise ChromaServiceError("Could not search the knowledge collection") from error


def delete_document_chunks(document_id: str, family_id: str) -> None:
    """Delete every chunk of a document, only within the given family."""
    try:
        _get_collection().delete(
            where={"$and": [{"document_id": document_id}, {"family_id": family_id}]},
        )
    except Exception as error:
        raise ChromaServiceError("Could not delete the knowledge document") from error
