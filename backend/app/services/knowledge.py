import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import KnowledgeDocument
from app.schemas.knowledge import KnowledgeDocumentInput
from app.services import chroma_service
from app.services.chroma_service import KnowledgeChunk
from app.services.chunking import chunk_text


def chunks_for(document: KnowledgeDocument) -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(
            document_id=str(document.id),
            chunk_index=index,
            content=content,
            family_id=str(document.family_id),
            title=document.title,
            category=document.category,
            source=document.source,
        )
        for index, content in enumerate(chunk_text(document.content))
    ]


def create_documents(
    database: Session,
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    inputs: list[KnowledgeDocumentInput],
) -> list[KnowledgeDocument]:
    """Save documents and index their chunks. Nothing is kept in SQL if indexing fails."""
    documents = [
        KnowledgeDocument(
            family_id=family_id,
            title=item.title or item.source,
            category=item.category,
            source=item.source,
            content=item.content,
            created_by_id=user_id,
        )
        for item in inputs
    ]
    database.add_all(documents)
    database.flush()
    try:
        chroma_service.add_chunks([chunk for document in documents for chunk in chunks_for(document)])
    except Exception:
        database.rollback()
        raise
    database.commit()
    for document in documents:
        database.refresh(document)
    return documents


def get_family_document(database: Session, family_id: uuid.UUID, document_id: uuid.UUID) -> KnowledgeDocument | None:
    return database.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.family_id == family_id,
        )
    )


def delete_document(database: Session, document: KnowledgeDocument) -> None:
    """Remove the search chunks first, so a failure never leaves searchable text without its document."""
    chroma_service.delete_document_chunks(str(document.id), str(document.family_id))
    database.delete(document)
    database.commit()


def search(family_id: uuid.UUID, query: str, limit: int = 5, category: str | None = None) -> list[dict]:
    """Return the family's best-matching excerpts as plain dicts."""
    results = chroma_service.search_chunks(query=query, family_id=str(family_id), limit=limit, category=category)
    return [
        {
            "id": result["id"],
            "document_id": str(result["metadata"].get("document_id", "")),
            "title": str(result["metadata"].get("title", "")),
            "category": str(result["metadata"].get("category", "")),
            "content": result["content"],
            "distance": result["distance"],
        }
        for result in results
    ]
