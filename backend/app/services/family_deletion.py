"""Delete a family and everything stored for it."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Appointment, Family, FamilyMembership, KnowledgeDocument, Task, TaskActivity, TelegramDraft, User
from app.seed_demo import DEMO_EMAIL_DOMAIN
from app.services import calendar_feed, chroma_service, day_plan


def delete_family(database: Session, family: Family) -> None:
    """Remove the family's tasks, history, appointments, notes and memberships, then the family itself.

    People's own accounts are kept: they can create or join another family. The exception is sample members
    made by the demo seeder, who cannot sign in and would otherwise be left behind with nowhere to belong.
    """
    family_id = family.id
    members = database.scalars(
        select(User).join(FamilyMembership, FamilyMembership.user_id == User.id).where(FamilyMembership.family_id == family_id)
    ).all()

    # Search chunks live outside the database, so they are removed first, one document at a time.
    for document_id in database.scalars(select(KnowledgeDocument.id).where(KnowledgeDocument.family_id == family_id)).all():
        try:
            chroma_service.delete_document_chunks(str(document_id), str(family_id))
        except chroma_service.ChromaServiceError:
            # The document row is deleted regardless; an orphaned chunk is scoped to a family id that no longer exists.
            pass

    database.execute(delete(KnowledgeDocument).where(KnowledgeDocument.family_id == family_id))
    database.execute(delete(TelegramDraft).where(TelegramDraft.family_id == family_id))
    database.execute(delete(Appointment).where(Appointment.family_id == family_id))
    database.execute(delete(TaskActivity).where(TaskActivity.family_id == family_id))
    database.execute(delete(Task).where(Task.family_id == family_id))
    database.execute(delete(FamilyMembership).where(FamilyMembership.family_id == family_id))
    for member in members:
        day_plan.forget(member.id)
        if member.email.endswith(DEMO_EMAIL_DOMAIN):
            calendar_feed.forget(member.id)
            database.delete(member)
    database.delete(family)
    database.commit()
