import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.family import FamilyMemberContext
from app.schemas.knowledge import (
    KnowledgeBatchInput,
    KnowledgeDocumentInput,
    KnowledgeDocumentResponse,
    KnowledgeSearchResult,
)
from app.services.chroma_service import (
    ChromaServiceError,
    KnowledgeDocument,
    add_document,
    add_documents,
    delete_document,
    search_documents,
)

router = APIRouter(prefix="/api/families/me/knowledge", tags=["family knowledge"])


def _new_knowledge_document(payload: KnowledgeDocumentInput, family_id: str) -> KnowledgeDocument:
    return KnowledgeDocument(
        id=str(uuid.uuid4()),
        content=payload.content,
        family_id=family_id,
        category=payload.category,
        source=payload.source,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("", response_model=KnowledgeDocumentResponse, status_code=status.HTTP_201_CREATED)
def create_knowledge_document(payload: KnowledgeDocumentInput, family_access: FamilyMemberContext) -> KnowledgeDocumentResponse:
    family_id = str(family_access.family.id)
    document = _new_knowledge_document(payload, family_id)
    try:
        add_document(
            document_id=document.id,
            content=document.content,
            family_id=document.family_id,
            category=document.category,
            source=document.source,
            created_at=document.created_at,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return KnowledgeDocumentResponse(
        id=document.id,
        family_id=family_id,
        category=document.category,
        source=document.source,
        created_at=document.created_at or "",
    )


@router.post("/batch", response_model=list[KnowledgeDocumentResponse], status_code=status.HTTP_201_CREATED)
def create_knowledge_documents(payload: KnowledgeBatchInput, family_access: FamilyMemberContext) -> list[KnowledgeDocumentResponse]:
    family_id = str(family_access.family.id)
    documents = [_new_knowledge_document(item, family_id) for item in payload.documents]
    try:
        add_documents(documents)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return [
        KnowledgeDocumentResponse(
            id=document.id,
            family_id=family_id,
            category=document.category,
            source=document.source,
            created_at=document.created_at or "",
        )
        for document in documents
    ]


@router.get("/search", response_model=list[KnowledgeSearchResult])
def search_family_knowledge(
    family_access: FamilyMemberContext,
    query: Annotated[str, Query(min_length=1, max_length=2_000)],
    limit: Annotated[int, Query(ge=1, le=100)] = 5,
    category: Annotated[str | None, Query(max_length=80)] = None,
) -> list[KnowledgeSearchResult]:
    try:
        results: list[dict[str, Any]] = search_documents(
            query=query,
            family_id=str(family_access.family.id),
            limit=limit,
            category=category,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    return [KnowledgeSearchResult(**result) for result in results]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_knowledge_document(document_id: str, family_access: FamilyMemberContext) -> None:
    try:
        removed = delete_document(document_id=document_id, family_id=str(family_access.family.id))
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except ChromaServiceError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge document not found")