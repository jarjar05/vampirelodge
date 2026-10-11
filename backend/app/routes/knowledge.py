import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import AuthenticatedUser
from app.dependencies.family import FamilyMemberContext
from app.models import KnowledgeDocument, User
from app.schemas.knowledge import (
    KnowledgeBatchInput,
    KnowledgeDocumentInput,
    KnowledgeDocumentResponse,
    KnowledgeSearchResult,
)
from app.services import knowledge
from app.services.chroma_service import ChromaServiceError
from app.services.chunking import chunk_text

router = APIRouter(prefix="/api/families/me/knowledge", tags=["family knowledge"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def _response(document: KnowledgeDocument, author_name: str | None) -> KnowledgeDocumentResponse:
    return KnowledgeDocumentResponse(
        id=document.id,
        family_id=document.family_id,
        title=document.title,
        category=document.category,
        source=document.source,
        content=document.content,
        chunk_count=len(chunk_text(document.content)),
        created_by_id=document.created_by_id,
        created_by_name=author_name,
        created_at=document.created_at,
    )


def _create(
    inputs: list[KnowledgeDocumentInput],
    family_access: FamilyMemberContext,
    user: User,
    database: Session,
) -> list[KnowledgeDocumentResponse]:
    try:
        documents = knowledge.create_documents(database, family_access.family.id, user.id, inputs)
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return [_response(document, user.name) for document in documents]


@router.get("", response_model=list[KnowledgeDocumentResponse])
def list_knowledge_documents(family_access: FamilyMemberContext, database: DatabaseSession) -> list[KnowledgeDocumentResponse]:
    rows = database.execute(
        select(KnowledgeDocument, User.name)
        .outerjoin(User, User.id == KnowledgeDocument.created_by_id)
        .where(KnowledgeDocument.family_id == family_access.family.id)
        .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id)
    ).all()
    return [_response(document, author_name) for document, author_name in rows]


@router.post("", response_model=KnowledgeDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_knowledge_document(
    payload: KnowledgeDocumentInput,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> KnowledgeDocumentResponse:
    return _create([payload], family_access, user, database)[0]


@router.post("/batch", response_model=list[KnowledgeDocumentResponse], status_code=status.HTTP_201_CREATED)
def create_knowledge_documents(
    payload: KnowledgeBatchInput,
    family_access: FamilyMemberContext,
    user: AuthenticatedUser,
    database: DatabaseSession,
) -> list[KnowledgeDocumentResponse]:
    return _create(payload.documents, family_access, user, database)


@router.get("/search", response_model=list[KnowledgeSearchResult])
def search_family_knowledge(
    family_access: FamilyMemberContext,
    query: Annotated[str, Query(min_length=1, max_length=2_000)],
    limit: Annotated[int, Query(ge=1, le=100)] = 5,
    category: Annotated[str | None, Query(max_length=80)] = None,
) -> list[KnowledgeSearchResult]:
    try:
        results = knowledge.search(family_access.family.id, query, limit=limit, category=category)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return [KnowledgeSearchResult(**result) for result in results]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_knowledge_document(document_id: uuid.UUID, family_access: FamilyMemberContext, database: DatabaseSession) -> None:
    document = knowledge.get_family_document(database, family_access.family.id, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge document not found")
    try:
        knowledge.delete_document(database, document)
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
