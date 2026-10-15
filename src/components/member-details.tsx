import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, MapPin, Plus, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker, TimePicker } from "@/components/ui/date-time-picker";
import { FamilyAvatar, toneColours } from "@/components/family-avatar";
import { type CareData } from "@/hooks/use-care-data";
import { formatRelative, getLocalDateInputValue, localInputsToIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { TaskDetails } from "@/pages/tasks-page";
import {
  isAssignedTo, recurrencePhrases, type CareTask, type FamilyMember } from "@/types/care";

const dayMs = 24 * 60 * 60_000;

/** "2 hr ago" or "3 days ago" within the week, otherwise just the date, e.g. "Oct 6". */
function finishedWhen(value: string, now: number) {
  return now - new Date(value).getTime() < 7 * dayMs
    ? formatRelative(value)
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

const availabilityDots: Record<FamilyMember["availability"], string> = {
  Available: "bg-sage",
  "With family": "bg-sage",
  "On duty": "bg-teal",
  "Away today": "bg-alert",
};

const priorityDots: Record<CareTask["priority"], string> = {
  High: "bg-alert",
  Normal: "bg-mustard",
  Low: "bg-muted-foreground/50",
};

/**
 * One family member at a glance: how they are fixed, what they have on and how their load compares with the rest
 * of the family. Their tasks open in their details; closing those comes back here.
 */
export function MemberDetails({ care, memberId, onClose }: { care: CareData; memberId: string; onClose: () => void }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const member = care.members.find((person) => person.id === memberId);
  if (!member) return null;
  if (openTaskId) return <TaskDetails care={care} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />;
  return <MemberDialog care={care} member={member} onOpenTask={setOpenTaskId} onClose={onClose} />;
}

function MemberDialog({ care, member, onOpenTask, onClose }: { care: CareData; member: FamilyMember; onOpenTask: (taskId: string) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isAdding, setIsAdding] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const now = Date.now();
  const endOfToday = new Date(new Date().setHours(24, 0, 0, 0)).getTime();
  const mine = care.tasks.filter((task) => isAssignedTo(task, member.id));
  // Overdue first, then soonest due; anything without a date last.
  const open = mine
    .filter((task) => !task.complete)
    .sort((first, second) => Number(second.attention === "Overdue") - Number(first.attention === "Overdue") || (first.dueAt ?? "9999").localeCompare(second.dueAt ?? "9999"));
  const overdue = open.filter((task) => task.attention === "Overdue").length;
  const dueToday = open.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < endOfToday && task.attention !== "Overdue").length;
  const done = mine
    .filter((task) => task.complete && task.completedAt && now - new Date(task.completedAt).getTime() <= 30 * dayMs)
    .sort((first, second) => (second.completedAt ?? "").localeCompare(first.completedAt ?? ""));
  const onTime = done.filter((task) => !task.dueAt || new Date(task.completedAt!).getTime() <= new Date(task.dueAt).getTime()).length;
  const familyOpen = care.tasks.filter((task) => !task.complete && task.assigneeIds.length > 0).length;
  const loads = care.members.map((person) => care.tasks.filter((task) => !task.complete && isAssignedTo(task, person.id)).length);
  const heaviest = Math.max(1, ...loads);
  const average = loads.length ? loads.reduce((sum, load) => sum + load, 0) / loads.length : 0;
  const colour = toneColours[member.tone];
  const loadNote = open.length === 0 ? "Nothing on their list right now."
    : open.length >= heaviest && loads.filter((load) => load === heaviest).length === 1 ? "The most of anyone in the family."
      : open.length > average + 0.5 ? "More than most of the family."
        : open.length < average - 0.5 ? "Lighter than most of the family."
          : "About the same as the rest of the family.";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="member-details-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl"
      style={{ "--person": colour } as React.CSSProperties}
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-[68px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${colour} ${Math.round((open.length / heaviest) * 100)}%, var(--muted) 0)` }}>
            <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-14 text-base ring-4 ring-card" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="member-details-title" className="font-display text-2xl font-bold">{member.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm font-bold text-muted-foreground">
              <span>{member.role}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={cn("size-2 rounded-full", availabilityDots[member.availability])} />{member.availability}</span>
            </p>
            {member.availabilityNote && <p className="mt-1 font-display text-[15px] italic text-foreground/80">“{member.availabilityNote}”</p>}
          </div>
          <button autoFocus type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-4 gap-2">
          {[
            ["Open", open.length, false],
            ["Due today", dueToday, false],
            ["Overdue", overdue, overdue > 0],
            ["Done, 30 days", done.length, false],
          ].map(([label, value, warn]) => (
            <div key={label as string} className="flex flex-col-reverse rounded-2xl border border-border bg-muted px-2 py-2.5 text-center">
              <dt className="mt-1 text-[11.5px] font-bold leading-tight text-muted-foreground">{label as string}</dt>
              <dd className={cn("font-display text-2xl font-bold leading-none", warn && "text-alert")}>{value as number}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="member-load-title" className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="member-load-title" className="text-sm font-extrabold">Workload</h3>
            <span className="text-xs font-bold text-muted-foreground">{open.length} of the family’s {familyOpen} open {familyOpen === 1 ? "task" : "tasks"}</span>
          </div>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${open.length} open tasks; the busiest person has ${heaviest}`}>
            <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${open.length === 0 ? 0 : Math.max(3, (open.length / heaviest) * 100)}%`, background: colour }} />
            {/* The family average, as a small mark. */}
            <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${(average / heaviest) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {loadNote}{done.length > 0 && ` ${Math.round((onTime / done.length) * 100)}% of what they finished this month was on time.`}
          </p>
        </section>

        <section aria-labelledby="member-open-title" className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 id="member-open-title" className="text-sm font-extrabold">On their list</h3>
            {!isAdding && (
              <button type="button" onClick={() => setIsAdding(true)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Plus size={14} aria-hidden="true" />Give {member.firstName} a task
              </button>
            )}
          </div>
          {isAdding && <NewTaskForMember care={care} member={member} onDone={() => setIsAdding(false)} />}
          {open.length === 0
            ? <p className="mt-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">No open tasks.</p>
            : (
              <ul className="mt-2 space-y-2">
                {open.map((task) => {
                  const late = task.attention === "Overdue";
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.id)}
                        aria-haspopup="dialog"
                        className={cn("flex w-full items-start gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", late && "border-l-4 border-l-alert!")}
                      >
                        <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", priorityDots[task.priority])} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-extrabold">{task.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                            <span className={cn("inline-flex items-center gap-1", late && "font-extrabold text-alert")}><Clock3 size={13} aria-hidden="true" />{task.time}{late ? " · Overdue" : ""}</span>
                            {task.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={13} aria-hidden="true" /><span className="truncate">{task.location}</span></span>}
                            {task.recurrence && <span className="inline-flex items-center gap-1"><Repeat size={13} aria-hidden="true" />{recurrencePhrases[task.recurrence]}</span>}
                          </span>
                        </span>
                        <span className="sr-only">{task.priority} priority</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>

        {done.length > 0 && (
          <section aria-labelledby="member-done-title" className="mt-5">
            <h3 id="member-done-title" className="text-sm font-extrabold">Recently finished</h3>
            <ul className="mt-2 space-y-1.5">
              {done.slice(0, 3).map((task) => (
                <li key={task.id} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 size={15} aria-hidden="true" className="shrink-0 text-success-foreground" />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{finishedWhen(task.completedAt!, now)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </dialog>
  );
}

const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";
const priorities: CareTask["priority"][] = ["High", "Normal", "Low"];

/** A short form for a task that goes straight onto this person's list. */
function NewTaskForMember({ care, member, onDone }: { care: CareData; member: FamilyMember; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(() => getLocalDateInputValue());
  const [time, setTime] = useState("18:00");
  const [priority, setPriority] = useState<CareTask["priority"]>("Normal");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    const created = await care.createTask({
      title: title.trim(),
      detail: detail.trim(),
      dueAt: localInputsToIso(date, time),
      priority,
      recurrence: null,
      assigneeIds: [member.id],
    });
    setIsSaving(false);
    if (created) onDone();
  };

  return (
    <form onSubmit={submit} aria-label={`New task for ${member.firstName}`} className="mt-2 grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3.5 sm:grid-cols-2">
      <label className="text-sm font-semibold sm:col-span-2">What needs doing
        <input autoFocus required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClassName} />
      </label>
      <label className="text-sm font-semibold sm:col-span-2">Details <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea rows={2} maxLength={500} value={detail} onChange={(event) => setDetail(event.target.value)} className={fieldClassName} />
      </label>
      <div className="text-sm font-semibold">
        <span id="member-task-date-label">Due date</span>
        <DatePicker labelledBy="member-task-date-label" min={getLocalDateInputValue()} value={date} onChange={setDate} />
      </div>
      <div className="text-sm font-semibold">
        <span id="member-task-time-label">Time</span>
        <TimePicker labelledBy="member-task-time-label" value={time} onChange={setTime} />
      </div>
      <div className="text-sm font-semibold sm:col-span-2">
        <span id="member-task-priority-label">Priority</span>
        <div role="radiogroup" aria-labelledby="member-task-priority-label" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/60 p-1">
          {priorities.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={priority === option}
              onClick={() => setPriority(option)}
              className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", priority === option ? "bg-card text-foreground shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground")}
            >
              <span aria-hidden="true" className={cn("size-2 rounded-full", priorityDots[option])} />{option}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={isSaving || !title.trim()}>Add to {member.firstName}’s list</Button>
      </div>
    </form>
  );
}
