import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ClipboardList,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { type AuthUser } from "@/components/auth/login-page";
import { toneColours } from "@/components/family-avatar";
import { DayPlanCard } from "@/components/day-plan-card";
import { CountUp } from "@/components/count-up";
import { SortableList } from "@/components/sortable-list";
import { DayTimeline } from "@/components/family-schedule";
import { BannerContent } from "@/components/scene-banner";
import { TaskDetails } from "@/pages/tasks-page";
import { MemberDetails } from "@/components/member-details";
import { useFamilySchedule } from "@/hooks/use-family-schedule";
import { api } from "@/api/client";
import { areaOf, defaultOverviewLayout, overviewCards, resolveOverviewLayout, type OverviewArea, type OverviewCardId } from "@/lib/overview-layout";
import { type CareData } from "@/hooks/use-care-data";
import { useReveal } from "@/hooks/use-reveal";
import { formatLongDate, getLocalDateInputValue, partOfDay } from "@/lib/dates";
import { ActivityCard, BannerButton, countActiveTasks, EmptyNote, OverviewCard } from "@/components/page-parts";
import { isAssignedTo } from "@/types/care";

export function OverviewPage({ care, currentUser, onUserUpdated }: { care: CareData; currentUser: AuthUser; onUserUpdated: (user: AuthUser) => void }) {
  const { tasks, members } = care;
  const now = new Date();
  const activeTasks = tasks.filter((task) => !task.complete);
  const attentionTasks = activeTasks.filter((task) => task.attention);
  const unassignedTasks = activeTasks.filter((task) => task.assigneeIds.length === 0);
  const myTasks = activeTasks.filter((task) => isAssignedTo(task, currentUser.id));
  // Open tasks due before the end of today, including any already overdue.
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const dueTodayTasks = activeTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < endOfToday);
  const maxWorkload = Math.max(1, ...members.map((member) => countActiveTasks(tasks, member.id)));
  const firstName = currentUser.name.trim().split(/\s+/)[0];
  const layout = resolveOverviewLayout(currentUser.overview_layout);
  const [isCustomising, setIsCustomising] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);

  const myDueToday = myTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < endOfToday);
  const myOverdue = myTasks.filter((task) => task.attention === "Overdue");

  const cards: Record<OverviewCardId, React.ReactNode> = {
    summary: (
      <section className="grid grid-cols-2 gap-3.5 xl:grid-cols-4" aria-label="Care summary">
        <SummaryTile order={0} to="/tasks" icon={ClipboardList} label="Active tasks" value={activeTasks.length} colour="var(--sage)" />
        <SummaryTile order={1} to="/calendar" icon={CalendarDays} label="Due today" value={dueTodayTasks.length} colour="var(--mustard)" />
        <SummaryTile order={2} to="/tasks?filter=Unassigned" icon={UserRound} label="Unassigned" value={unassignedTasks.length} colour="var(--sky)" />
        <SummaryTile order={3} to="/tasks?filter=Needs%20attention" icon={AlertTriangle} label="Needs attention" value={attentionTasks.length} colour="var(--alert)" />
      </section>
    ),
    // The plan lists my tasks in its suggested order, so a separate list is only needed when I have none.
    plan: myTasks.length > 0 ? <DayPlanCard tasks={myTasks} /> : (
      <OverviewCard title="Your order for today" to="/tasks" linkLabel="All tasks">
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-4 text-center">
          <CheckCircle2 size={30} aria-hidden="true" className="text-sage" />
          <p className="mt-1 font-extrabold">Nothing is assigned to you</p>
          <p className="max-w-[30ch] text-sm text-muted-foreground">Anything given to you will show up here, in a sensible order to do it.</p>
        </div>
      </OverviewCard>
    ),
    schedule: <TodayScheduleCard care={care} />,
    family: (
      <OverviewCard title="The family" to="/circle" linkLabel="View family">
        <p className="-mt-1 text-sm text-muted-foreground">The ring fills with each person’s open tasks</p>
        {/* Each person has a tile; the tiles share out any extra height, so a tall card is filled, not left empty. */}
        <ul className="stagger mt-4 grid flex-1 auto-rows-fr grid-cols-3 gap-2.5">
          {members.map((member) => {
            const open = countActiveTasks(tasks, member.id);
            return (
              <li key={member.id} className="flex min-w-0">
                <button
                  type="button"
                  onClick={() => setMemberId(member.id)}
                  aria-haspopup="dialog"
                  aria-label={`${member.name}: ${open} open ${open === 1 ? "task" : "tasks"}, ${member.availability}. Show their tasks and workload`}
                  className="family-face flex w-full min-w-0 flex-col items-center justify-center rounded-2xl bg-muted/55 px-1.5 py-3 text-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ "--person": toneColours[member.tone], "--load": Math.round((open / maxWorkload) * 100) } as React.CSSProperties}
                >
                <span aria-hidden="true" className="load-ring mx-auto grid size-[clamp(4rem,6vw,5.25rem)] place-items-center rounded-full">
                  {member.avatarUrl
                    ? <img src={member.avatarUrl} alt="" className="size-[82%] rounded-full object-cover" />
                    : <span className="grid size-[82%] place-items-center rounded-full text-[clamp(15px,1.2vw,18px)] font-extrabold">{member.initials}</span>}
                </span>
                <span aria-hidden="true" className="mt-2.5 block max-w-full truncate text-[clamp(1rem,1.1vw,1.1rem)] font-extrabold">{member.firstName}</span>
                <span aria-hidden="true" className="block text-[12.5px] font-bold text-muted-foreground">{open} open</span>
                <span aria-hidden="true" className={`block max-w-full text-[12px] leading-tight ${member.availability === "Away today" ? "text-alert" : "text-muted-foreground"}`}>{member.availability}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </OverviewCard>
    ),
    activity: <ActivityCard activity={care.activity.slice(0, 12)} members={members} to="/activity" />,
  };
  const inArea = (area: OverviewArea) => layout.filter((id) => areaOf(id) === area);
  const [top, main, side] = [inArea("top"), inArea("main"), inArea("side")];
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  // One plain sentence about the day, worked out from the task list.
  const lead = [
    myOverdue.length > 0
      ? `${plural(myDueToday.length, "thing needs", "things need")} you today, and ${myOverdue.length === 1 ? "one is" : `${myOverdue.length} are`} overdue.`
      : myDueToday.length > 0
        ? `${plural(myDueToday.length, "thing needs", "things need")} you today.`
        : myTasks.length > 0
          ? `Nothing is due from you today. You have ${plural(myTasks.length, "task", "tasks")} coming up.`
          : "Nothing is on your list today.",
    unassignedTasks.length > 0 ? `${plural(unassignedTasks.length, "task still needs", "tasks still need")} someone.` : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <BannerContent label="Today" className="px-6 pt-7 pb-[164px] pr-[5.5rem] sm:px-9 sm:pt-9 sm:pb-[146px]">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">{formatLongDate(now)}</p>
        <h1 className="mt-2 font-display text-[clamp(34px,5vw,56px)] font-bold leading-[1.05]">Good {partOfDay(now)}, <em>{firstName}</em></h1>
        <p className="mt-3 max-w-[44ch] text-[17px] sm:text-lg">{lead}</p>
        <div className="absolute right-4 bottom-4 sm:right-5 sm:bottom-5">
          <BannerButton icon={SlidersHorizontal} onClick={() => setIsCustomising(true)}>Customise</BannerButton>
        </div>
      </BannerContent>
      {top.map((id) => <div key={id} className="mb-6">{cards[id]}</div>)}
      {(main.length > 0 || side.length > 0) && (
        // The two columns always end level: each stretches to the taller one, and its last card grows to fill.
        <div className={`grid items-stretch gap-6 ${main.length > 0 && side.length > 0 ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]" : ""}`}>
          {[main, side].filter((column) => column.length > 0).map((column) => (
            <div key={column.join()} className="flex flex-col gap-6">
              {column.map((id, index) => (
                <div key={id} className={index === column.length - 1 ? "flex flex-1 flex-col *:flex-1" : undefined}>{cards[id]}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {layout.length === 0 && <EmptyNote>Nothing is shown here. Choose Customise to add cards.</EmptyNote>}
      {memberId && <MemberDetails care={care} memberId={memberId} onClose={() => setMemberId(null)} />}
      {isCustomising && (
        <OverviewCustomiser
          layout={layout}
          onClose={() => setIsCustomising(false)}
          onSave={async (next) => {
            // Saved to the account, so the same Overview appears on every device.
            onUserUpdated(await api<AuthUser>("/auth/me", { method: "PATCH", body: { overview_layout: next } }));
          }}
        />
      )}
    </>
  );
}

/** Today for everyone in the family, from the same schedule as the Calendar page. */
function TodayScheduleCard({ care }: { care: CareData }) {
  const today = getLocalDateInputValue();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { schedule, errorMessage } = useFamilySchedule(today, 1, care.tasks);
  return (
    <>
      <OverviewCard title="Today" to="/calendar" linkLabel="Calendar">
        {errorMessage
          ? <EmptyNote>{errorMessage}</EmptyNote>
          : schedule
            ? <DayTimeline members={care.members} schedules={schedule.members} onOpenTask={setOpenTaskId} />
            : <p role="status" className="py-4 text-sm text-muted-foreground">Loading today…</p>}
      </OverviewCard>
      {openTaskId && <TaskDetails care={care} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}

/** Choose which cards appear on the Overview, and in what order within each area. */
function OverviewCustomiser({ layout, onSave, onClose }: { layout: readonly OverviewCardId[]; onSave: (layout: OverviewCardId[]) => Promise<void>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Every card, shown ones first in their current order, then the hidden ones.
  const [order, setOrder] = useState<OverviewCardId[]>(() => [...layout, ...overviewCards.map((card) => card.id).filter((id) => !layout.includes(id))]);
  const [shown, setShown] = useState<ReadonlySet<OverviewCardId>>(() => new Set(layout));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const toggle = (id: OverviewCardId) => setShown((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Puts one area's cards in a new order; cards never change area.
  const reorderArea = (area: OverviewArea, ids: OverviewCardId[]) => setOrder((current) => {
    const queue = [...ids];
    return current.map((id) => (areaOf(id) === area ? queue.shift() ?? id : id));
  });
  const save = async () => {
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onSave(order.filter((id) => shown.has(id)));
      dialogRef.current?.close();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Your layout could not be saved.");
      setIsSaving(false);
    }
  };
  const areas: { area: OverviewArea; label: string }[] = [{ area: "top", label: "Top" }, { area: "main", label: "Main column" }, { area: "side", label: "Side column" }];
  const labelOf = (id: string) => overviewCards.find((card) => card.id === id)?.label ?? id;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="customise-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
    >
      <div className="p-5 sm:p-7">
        <h2 id="customise-title" className="font-display text-2xl font-semibold">Customise Overview</h2>
        {areas.map(({ area, label }) => {
          const ids = order.filter((id) => areaOf(id) === area);
          return (
            <section key={area} className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</h3>
              {ids.length > 1 ? (
                <SortableList
                  ids={ids}
                  label={labelOf}
                  onReorder={(next) => reorderArea(area, next as OverviewCardId[])}
                  className="mt-2 divide-y divide-border rounded-lg border border-border"
                  renderRow={(id) => (
                    <label className={`flex cursor-pointer items-center gap-3 py-2.5 pr-3 text-sm font-medium ${shown.has(id as OverviewCardId) ? "" : "text-muted-foreground"}`}>
                      <input type="checkbox" checked={shown.has(id as OverviewCardId)} onChange={() => toggle(id as OverviewCardId)} className="size-4 shrink-0 accent-primary" />
                      <span className="truncate">{labelOf(id as OverviewCardId)}</span>
                    </label>
                  )}
                />
              ) : (
                <ul className="mt-2 rounded-lg border border-border">
                  {ids.map((id) => (
                    <li key={id}>
                      <label className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm font-medium ${shown.has(id) ? "" : "text-muted-foreground"}`}>
                        <input type="checkbox" checked={shown.has(id)} onChange={() => toggle(id)} className="size-4 shrink-0 accent-primary" />
                        <span className="truncate">{labelOf(id)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
        <div className="mt-6 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => { setOrder([...defaultOverviewLayout]); setShown(new Set(defaultOverviewLayout)); }}>Reset</Button>
          <span className="flex-1" />
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>Cancel</Button>
          <Button type="button" disabled={isSaving} onClick={() => void save()}>{isSaving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </dialog>
  );
}

function SummaryTile({ to, icon: Icon, label, value, colour, order }: { to: string; icon: typeof CalendarDays; label: string; value: number; colour: string; order: number }) {
  // The wrapper does the scroll reveal so the link keeps its own hover and press transitions.
  const ref = useReveal<HTMLDivElement>();
  return (
    // Each tile follows the one before it as the row comes into view.
    <div ref={ref} className="reveal" style={{ "--reveal-delay": `${order * 70}ms` } as React.CSSProperties}>
      <Link
        to={to}
        style={{ "--tile": colour } as React.CSSProperties}
        className="summary-tile flex h-full items-center gap-3.5 rounded-[22px] border border-border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-[18px]"
      >
        <span className="tile-icon flex size-11 shrink-0 items-center justify-center rounded-[14px]">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[30px] font-bold leading-none tabular-nums"><CountUp value={value} /></p>
          <p className="mt-1 truncate text-[13px] font-bold text-muted-foreground">{label}</p>
        </div>
      </Link>
    </div>
  );
}
