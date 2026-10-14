import { useEffect, useRef, useState } from "react";
import {
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { type AuthUser } from "@/components/auth/login-page";
import { FamilyAvatar } from "@/components/family-avatar";
import { FamilyStats } from "@/components/family-stats";
import { type CareData } from "@/hooks/use-care-data";
import {
  availabilityOptions,
  type Availability,
  type Family,
  type FamilyMember,
} from "@/types/care";
import { countActiveTasks, FamilyWorkloadBar, fieldClassName, PageHeading } from "@/components/page-parts";

export function CareCirclePage({ care, family, currentUser }: { care: CareData; family: Family; currentUser: AuthUser }) {
  const { members, tasks } = care;
  const me = members.find((member) => member.id === currentUser.id);
  const isAdmin = family.myRole === "ADMIN";
  const [isEditing, setIsEditing] = useState(false);
  const [familyNameDraft, setFamilyNameDraft] = useState(family.name);
  const [roleDraft, setRoleDraft] = useState(me?.relationshipLabel ?? "");
  const [availabilityDraft, setAvailabilityDraft] = useState<Availability>(me?.availability ?? "Available");
  const [noteDraft, setNoteDraft] = useState(me?.availabilityNote ?? "");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isDeletingFamily, setIsDeletingFamily] = useState(false);
  // A family always keeps one admin, so the last one is not offered "Remove admin".
  const adminCount = members.filter((member) => member.accessRole === "ADMIN").length;
  const maxWorkload = Math.max(1, ...members.map((member) => countActiveTasks(tasks, member.id)));
  const detailsChanged = roleDraft.trim() !== (me?.relationshipLabel ?? "")
    || availabilityDraft !== (me?.availability ?? "Available")
    || noteDraft.trim() !== (me?.availabilityNote ?? "");

  const saveMyDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void care.updateMember(currentUser.id, {
      relationshipLabel: roleDraft.trim() || null,
      availability: availabilityDraft,
      availabilityNote: noteDraft.trim() || null,
    });
  };

  const copyInviteCode = async () => {
    if (!family.inviteCode) return;
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setInviteCopied(true);
    } catch {
      // Clipboard access can be blocked; the code stays visible to copy by hand.
    }
  };

  const removeMember = (member: FamilyMember) => {
    if (window.confirm(`Remove ${member.name} from ${family.name}? Their tasks will return to the unassigned queue.`)) {
      void care.removeMember(member.id);
    }
  };

  return (
    <>
      <PageHeading title="Family" />
      <Card>
        <CardHeader className="items-center">
          <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Family team</p><h2 className="mt-1 font-display text-xl font-semibold">Members</h2></div>
          <Button variant="outline" size="sm" onClick={() => setIsEditing((current) => !current)}>
            {isEditing ? "Done" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent className="pt-3">
          {isEditing && (
            <>
              {isAdmin && (
                <div className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="min-w-0 text-sm font-medium">Family name
                    <input maxLength={120} value={familyNameDraft} onChange={(event) => setFamilyNameDraft(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <Button type="button" size="sm" disabled={!familyNameDraft.trim() || familyNameDraft.trim() === family.name} onClick={() => void care.renameFamily(familyNameDraft.trim())}>Save family name</Button>
                </div>
              )}
              <form onSubmit={saveMyDetails} className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-4">
                <p className="text-sm font-semibold md:col-span-4">Your details</p>
                <label className="text-sm font-medium">
                  Role
                  <input maxLength={80} placeholder="e.g. Daughter" value={roleDraft} onChange={(event) => setRoleDraft(event.target.value)} className={fieldClassName} />
                </label>
                <label className="text-sm font-medium">
                  Availability
                  <select value={availabilityDraft} onChange={(event) => setAvailabilityDraft(event.target.value as Availability)} className={fieldClassName}>
                    {availabilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Availability note <span className="font-normal text-muted-foreground">(optional)</span>
                  <input maxLength={200} placeholder="e.g. Available this evening" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} className={fieldClassName} />
                </label>
                <div className="flex justify-end md:col-span-4">
                  <Button type="submit" size="sm" disabled={!detailsChanged}>Save my details</Button>
                </div>
              </form>
            </>
          )}

          <div className="stagger divide-y divide-border">
          {members.map((member) => (
            <div key={member.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 sm:px-2">
              <div className="flex min-w-0 items-center gap-3">
                {isEditing && isAdmin && member.id !== currentUser.id && (
                  <button
                    type="button"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => removeMember(member)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-alert bg-alert/10 text-xs font-bold text-alert hover:bg-alert/20"
                  >
                    −
                  </button>
                )}
                <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{member.name}{member.id === currentUser.id && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                    {member.accessRole === "ADMIN" && <Badge variant="outline" className="shrink-0 px-2 py-0.5 text-[10px]">Admin</Badge>}
                  </p>
                  <FamilyWorkloadBar name={member.name} activeTasks={countActiveTasks(tasks, member.id)} maxTasks={maxWorkload} />
                </div>
              </div>
              {isEditing && isAdmin && (member.accessRole !== "ADMIN" || adminCount > 1) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void care.updateMember(member.id, { role: member.accessRole === "ADMIN" ? "MEMBER" : "ADMIN" }).then(() => care.reload())}
                >
                  {member.accessRole === "ADMIN" ? "Remove admin" : "Make admin"}
                </Button>
              )}
            </div>
          ))}
          </div>
          {family.inviteCode && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground sm:px-2">
              <span>Invite code</span>
              <code className="font-mono tracking-widest text-foreground/80">{family.inviteCode}</code>
              <button type="button" onClick={() => void copyInviteCode()} className="font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {inviteCopied ? "Copied" : "Copy"}
              </button>
              <span className="basis-full sm:basis-auto">· Share it so someone with an account can join.</span>
            </p>
          )}
        </CardContent>
      </Card>
      <FamilyStats className="mt-6" members={members} tasks={tasks} />
      {isEditing && isAdmin && (
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => setIsDeletingFamily(true)} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-alert hover:bg-alert/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert">
            <Trash2 size={15} aria-hidden="true" />Delete family
          </button>
        </div>
      )}
      {isDeletingFamily && <DeleteFamilyDialog familyName={family.name} onDelete={care.deleteFamily} onClose={() => setIsDeletingFamily(false)} />}
    </>
  );
}

/** Asks for the family's name before deleting it, so it cannot happen by a stray click. */
function DeleteFamilyDialog({ familyName, onDelete, onClose }: { familyName: string; onDelete: (confirmName: string) => Promise<boolean | undefined>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typedName, setTypedName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const matches = typedName.trim().toLowerCase() === familyName.trim().toLowerCase();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matches) return;
    setIsDeleting(true);
    // On success the whole page is replaced by the create-or-join screen, so there is nothing left to close.
    if (!(await onDelete(typedName))) {
      setIsDeleting(false);
      dialogRef.current?.close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-family-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
    >
      <form onSubmit={submit} className="p-5 sm:p-7">
        <h2 id="delete-family-title" className="font-display text-2xl font-semibold">Delete {familyName}?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Every task and note is removed for everyone. This cannot be undone.</p>
        <label className="mt-5 block text-sm font-medium" htmlFor="delete-family-name">Type <span className="font-semibold">{familyName}</span> to confirm</label>
        <input id="delete-family-name" autoFocus autoComplete="off" value={typedName} onChange={(event) => setTypedName(event.target.value)} className={fieldClassName} />
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>Cancel</Button>
          <button type="submit" disabled={!matches || isDeleting} className="inline-flex h-10 items-center justify-center rounded-md bg-alert px-4 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:shadow-alert/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
            {isDeleting ? "Deleting…" : "Delete family"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
