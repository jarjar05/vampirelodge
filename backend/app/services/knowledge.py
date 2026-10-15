import math
import re
import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import KnowledgeDocument
from app.schemas.knowledge import KnowledgeDocumentInput
from app.services import chroma_service
from app.services.chroma_service import KnowledgeChunk
from app.services.chunking import chunk_text


# Words too common to tell notes apart.
_STOPWORDS = frozenset(
    "the and for with that this from are was were has have had you your our their its but not all any can will what when "
    "who how why which where does did into out about there them they she him her his been being also than then".split()
)


def _in_database() -> bool:
    """True where notes are searched by keywords in the database instead of by meaning with ChromaDB."""
    return settings.knowledge_search == "database"


def _words(text: str) -> list[str]:
    return [word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2 and word not in _STOPWORDS]


def _stem(word: str) -> str:
    """A rough stem, so "tablets" finds "tablet" and "walking" finds "walk"."""
    for ending in ("ing", "es", "s"):
        if word.endswith(ending) and len(word) - len(ending) >= 3:
            return word[: -len(ending)]
    return word


def _keyword_search(family_id: uuid.UUID, query: str, limit: int, category: str | None) -> list[dict]:
    """Rank the family's note excerpts by the query's words: rarer words count more, and a word in the title more
    again. For a family's notes this is quick enough to do in Python, and works the same on SQLite and Postgres."""
    with SessionLocal() as database:
        statement = select(KnowledgeDocument).where(KnowledgeDocument.family_id == family_id)
        if category:
            statement = statement.where(KnowledgeDocument.category == category.strip())
        chunks = [chunk for document in database.scalars(statement).all() for chunk in chunks_for(document)]
    terms = {_stem(word) for word in _words(query)}
    if not chunks or not terms:
        return []
    counted = [(chunk, Counter(_stem(word) for word in _words(chunk.content)), {_stem(word) for word in _words(chunk.title)}) for chunk in chunks]
    holding = Counter(term for _chunk, counts, title in counted for term in terms if term in counts or term in title)
    scored = []
    for chunk, counts, title in counted:
        score = 0.0
        for term in terms:
            if not holding[term]:
                continue
            rarity = math.log(1 + len(chunks) / holding[term])
            score += rarity * ((1 + math.log(counts[term]) if counts[term] else 0) + (1.5 if term in title else 0))
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda item: -item[0])
    return [
        {
            "id": chunk.id,
            "document_id": chunk.document_id,
            "title": chunk.title,
            "category": chunk.category,
            "content": chunk.content,
            # Smaller is closer, as with ChromaDB's distances.
            "distance": round(1 / (1 + score), 4),
        }
        for score, chunk in scored[:limit]
    ]


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
        if not _in_database():
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
    if not _in_database():
        chroma_service.delete_document_chunks(str(document.id), str(document.family_id))
    database.delete(document)
    database.commit()


def search(family_id: uuid.UUID, query: str, limit: int = 5, category: str | None = None) -> list[dict]:
    """Return the family's best-matching excerpts as plain dicts."""
    if not query.strip():
        raise ValueError("query must not be empty")
    if _in_database():
        return _keyword_search(family_id, query, limit, category)
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
