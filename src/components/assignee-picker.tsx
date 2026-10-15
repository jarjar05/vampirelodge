import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FamilyAvatar } from "@/components/family-avatar";
import { cn } from "@/lib/utils";
import type { FamilyMember } from "@/types/care";

/** "Chloe", "Chloe and Max" or "Chloe, Max and Ben". */
export function joinFirstNames(members: readonly FamilyMember[]) {
  const names = members.map((member) => member.firstName);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Everyone on a task as overlapping faces, the lead in front. */
export function AssigneeFaces({ members, className }: { members: readonly FamilyMember[]; className?: string }) {
  const shown = members.slice(0, 3);
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 -space-x-2", className)}>
      {shown.map((member, index) => (
        <span key={member.id} className="relative rounded-full" style={{ zIndex: shown.length - index }}>
          <FamilyAvatar initials={member.initials.slice(0, 1)} tone={member.tone} imageUrl={member.avatarUrl} className="size-7 ring-2 ring-card" />
        </span>
      ))}
      {members.length > 3 && <span className="grid size-7 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground ring-2 ring-card">+{members.length - 3}</span>}
    </span>
  );
}

/**
 * Choose who does a task: one person or several. Each family member is a toggle; the first one picked leads.
 * Until the person changes anything, `preset` is selected, so accepting a suggestion is one click.
 */
export function AssigneePicker({
  members,
  current,
  preset,
  busyMemberIds = new Set(),
  label,
  onSave,
  onCancel,
  className,
}: {
  members: readonly FamilyMember[];
  /** Who has the task now. */
  current: readonly string[];
  /** What starts selected; defaults to `current`. */
  preset?: readonly string[];
  busyMemberIds?: ReadonlySet<string>;
  label: string;
  onSave: (memberIds: string[]) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [chosen, setChosen] = useState<string[] | null>(null);
  const selected = chosen ?? [...(preset ?? current)];
  const toggle = (memberId: string) => setChosen(selected.includes(memberId) ? selected.filter((id) => id !== memberId) : [...selected, memberId]);
  const unchanged = selected.length === current.length && selected.every((id) => current.includes(id));
  const selectedMembers = selected.map((id) => members.find((member) => member.id === id)).filter((member): member is FamilyMember => Boolean(member));

  return (
    <div className={cn("rounded-lg bg-primary/5 p-2", className)}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {members.map((member) => {
          const isOn = selected.includes(member.id);
          const isBusy = busyMemberIds.has(member.id);
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={isOn}
              onClick={() => toggle(member.id)}
              title={isBusy ? `${member.firstName} is busy then` : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isOn ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative">
                <FamilyAvatar initials={member.initials.slice(0, 1)} tone={member.tone} imageUrl={member.avatarUrl} className={cn("size-6 text-[11px]", isBusy && !isOn && "opacity-50 grayscale")} />
                {isOn && <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={9} strokeWidth={4} /></span>}
              </span>
              {member.firstName}
              {isBusy && <span className="text-[11px] font-medium text-muted-foreground">busy</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {selected.length === 0 ? (current.length ? "Nobody: back to unassigned" : "Pick one or more people") : `${joinFirstNames(selectedMembers)}`}
        </p>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={unchanged} onClick={() => onSave(selected)}>
          {selected.length === 0 ? "Unassign" : current.length ? "Save" : "Assign"}
        </Button>
      </div>
    </div>
  );
}
