import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { type AuthUser } from "@/components/auth/login-page";
import { FamilyAvatar } from "@/components/family-avatar";
import { DayPlanCard } from "@/components/day-plan-card";
import { CountUp } from "@/components/count-up";
import { SortableList } from "@/components/sortable-list";
import { TodayList } from "@/components/family-schedule";
import { useFamilySchedule } from "@/hooks/use-family-schedule";
import { api } from "@/api/client";
import { areaOf, defaultOverviewLayout, overviewCards, resolveOverviewLayout, type OverviewArea, type OverviewCardId } from "@/lib/overview-layout";
import { type CareData } from "@/hooks/use-care-data";
import { useReveal } from "@/hooks/use-reveal";
import { formatLongDate, getLocalDateInputValue, partOfDay } from "@/lib/dates";
import { ActivityCard, countActiveTasks, EmptyNote, FamilyWorkloadBar, OverviewCard, PageHeading } from "@/components/page-parts";

export function OverviewPage({ care, currentUser, onUserUpdated }: { care: CareData; currentUser: AuthUser; onUserUpdated: (user: AuthUser) => void }) {
  const { tasks, members } = care;
  const now = new Date();
  const activeTasks = tasks.filter((task) => !task.complete);
  const attentionTasks = activeTasks.filter((task) => task.attention);
  const unassignedTasks = activeTasks.filter((task) => task.assigneeId === null);
  const myTasks = activeTasks.filter((task) => task.assigneeId === currentUser.id);
  // Open tasks due before the end of today, including any already overdue.
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const dueTodayTasks = activeTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < endOfToday);
  const maxWorkload = Math.max(1, ...members.map((member) => countActiveTasks(tasks, member.id)));
  const firstName = currentUser.name.trim().split(/\s+/)[0];
  const layout = resolveOverviewLayout(currentUser.overview_layout);
  const [isCustomising, setIsCustomising] = useState(false);

  const cards: Record<OverviewCardId, React.ReactNode> = {
    summary: (
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Care summary">
        <SummaryTile order={0} to="/tasks" icon={ClipboardList} label="Active tasks" value={activeTasks.length} tone="bg-primary text-primary-foreground shadow-primary/30" />
        <SummaryTile order={1} to="/calendar" icon={CalendarDays} label="Due today" value={dueTodayTasks.length} tone="bg-amber-400 text-amber-950 shadow-amber-400/40" />
        <SummaryTile order={2} to="/tasks?filter=Unassigned" icon={UserRound} label="Unassigned" value={unassignedTasks.length} tone="bg-sky-600 text-white shadow-sky-600/30" />
        <SummaryTile order={3} to="/tasks?filter=Needs%20attention" icon={AlertTriangle} label="Needs attention" value={attentionTasks.length} tone="bg-alert text-white shadow-alert/30" />
      </section>
    ),
    // The plan lists my tasks in its suggested order, so a separate list is only needed when I have none.
    plan: myTasks.length > 0 ? <DayPlanCard tasks={myTasks} /> : (
      <OverviewCard title="My tasks" to="/tasks" linkLabel="All tasks">
        <EmptyNote>Nothing is assigned to you.</EmptyNote>
      </OverviewCard>
    ),
    schedule: <TodayScheduleCard care={care} />,
    family: (
      <OverviewCard title="Family" to="/circle" linkLabel="View family" iconOnlyLink>
        <div className="stagger space-y-4 pt-1">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{member.firstName}</p>
                <FamilyWorkloadBar name={member.name} activeTasks={countActiveTasks(tasks, member.id)} maxTasks={maxWorkload} />
              </div>
            </div>
          ))}
        </div>
      </OverviewCard>
    ),
    activity: <ActivityCard activity={care.activity.slice(0, 4)} members={members} to="/activity" />,
  };
  const inArea = (area: OverviewArea) => layout.filter((id) => areaOf(id) === area);
  const [top, main, side] = [inArea("top"), inArea("main"), inArea("side")];

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeading showDetails eyebrow={formatLongDate(now)} title={`Good ${partOfDay(now)}, ${firstName}`} />
        <Button size="sm" variant="outline" className="mt-1 shrink-0" onClick={() => setIsCustomising(true)}><SlidersHorizontal size={14} aria-hidden="true" />Customise</Button>
      </div>
      {top.map((id) => <div key={id} className="mb-6">{cards[id]}</div>)}
      {(main.length > 0 || side.length > 0) && (
        <div className={`grid items-start gap-6 ${main.length > 0 && side.length > 0 ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)]" : ""}`}>
          {main.length > 0 && <div className="space-y-6">{main.map((id) => <div key={id}>{cards[id]}</div>)}</div>}
          {side.length > 0 && <div className="space-y-6">{side.map((id) => <div key={id}>{cards[id]}</div>)}</div>}
        </div>
      )}
      {layout.length === 0 && <EmptyNote>Nothing is shown here. Choose Customise to add cards.</EmptyNote>}
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
  const { schedule, errorMessage } = useFamilySchedule(today, 1, care.tasks);
  return (
    <OverviewCard title="Today" to="/calendar" linkLabel="Calendar">
      {errorMessage
        ? <EmptyNote>{errorMessage}</EmptyNote>
        : schedule
          ? <TodayList members={care.members} schedules={schedule.members} />
          : <p role="status" className="py-4 text-sm text-muted-foreground">Loading today…</p>}
    </OverviewCard>
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

function SummaryTile({ to, icon: Icon, label, value, tone, order }: { to: string; icon: typeof CalendarDays; label: string; value: number; tone: string; order: number }) {
  // The wrapper does the scroll reveal so the link keeps its own hover and press transitions.
  const ref = useReveal<HTMLDivElement>();
  return (
    // Each tile follows the one before it as the row comes into view.
    <div ref={ref} className="reveal" style={{ "--reveal-delay": `${order * 70}ms` } as React.CSSProperties}>
      <Link
        to={to}
        className="card-lift flex h-full items-center gap-4 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
      >
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl shadow-md ${tone}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-3xl font-semibold leading-none"><CountUp value={value} /></p>
          <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </Link>
    </div>
  );
}
