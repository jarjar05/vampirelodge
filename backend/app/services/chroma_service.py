from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Sequence

import chromadb

from app.config import settings

COLLECTION_NAME = "family_care_knowledge"


class ChromaServiceError(RuntimeError):
    """Raised when a semantic knowledge operation fails."""


@dataclass(frozen=True)
class KnowledgeDocument:
    id: str
    content: str
    family_id: str
    category: str
    source: str
    created_at: str | None = None


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


def _as_metadata(document: KnowledgeDocument) -> dict[str, str]:
    values = {
        "family_id": document.family_id.strip(),
        "category": document.category.strip(),
        "source": document.source.strip(),
        "created_at": document.created_at or datetime.now(timezone.utc).isoformat(),
    }
    if any(not value for value in values.values()):
        raise ValueError("family_id, category, and source must not be empty")
    return values


def add_document(
    document_id: str,
    content: str,
    family_id: str,
    category: str,
    source: str,
    created_at: str | None = None,
) -> None:
    """Add or replace one document and its family-scoped metadata."""
    add_documents([
        KnowledgeDocument(
            id=document_id,
            content=content,
            family_id=family_id,
            category=category,
            source=source,
            created_at=created_at,
        )
    ])


def add_documents(documents: Sequence[KnowledgeDocument]) -> None:
    """Add or replace a batch of documents with required family metadata."""
    if not documents:
        return
    if any(not document.id.strip() or not document.content.strip() for document in documents):
        raise ValueError("Each document requires a non-empty id and content")

    try:
        collection = _get_collection()
        collection.upsert(
            ids=[document.id.strip() for document in documents],
            documents=[document.content for document in documents],
            metadatas=[_as_metadata(document) for document in documents],
        )
    except ValueError:
        raise
    except Exception as error:
        raise ChromaServiceError("Could not add documents to the knowledge collection") from error


def search_documents(
    query: str,
    family_id: str,
    limit: int = 5,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Search semantically within one family's documents only."""
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
                "id": document_id,
                "content": contents[index],
                "metadata": metadatas[index],
                "distance": distances[index] if index < len(distances) else None,
            }
            for index, document_id in enumerate(ids)
        ]
    except ValueError:
        raise
    except Exception as error:
        raise ChromaServiceError("Could not search the knowledge collection") from error


def delete_document(document_id: str, family_id: str) -> bool:
    """Delete a document only when it belongs to the requested family."""
    if not document_id.strip() or not family_id.strip():
        raise ValueError("document_id and family_id must not be empty")

    try:
        collection = _get_collection()
        existing = collection.get(
            ids=[document_id.strip()],
            where={"family_id": family_id.strip()},
            include=["metadatas"],
        )
        if not existing.get("ids"):
            return False
        collection.delete(ids=[document_id.strip()], where={"family_id": family_id.strip()})
        return True
    except ValueError:
        raise
    except Exception as error:
        raise ChromaServiceError("Could not delete the knowledge document") from error