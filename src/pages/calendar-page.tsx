import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, X } from "lucide-react";
import { type AuthUser } from "@/components/auth/login-page";
import { MySchedule } from "@/components/my-schedule";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { addDays, dayStart, ScheduleLegend, WeekGrid } from "@/components/family-schedule";
import { useFamilySchedule } from "@/hooks/use-family-schedule";
import { PageHeader } from "@/components/page-parts";
import { getLocalDateInputValue } from "@/lib/dates";
import { type CareData } from "@/hooks/use-care-data";
import { type FamilySchedule } from "@/types/care";
import { TaskDetails } from "@/pages/tasks-page";

/** The Monday of the week that contains `day`. */
function weekStart(day: string) {
  const date = dayStart(day);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return getLocalDateInputValue(date);
}

type ShownWeek = { start: string; schedule: FamilySchedule };

function weekRange(start: string) {
  const format = (day: string, year: boolean) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }).format(dayStart(day));
  return `${format(start, false)} – ${format(addDays(start, 6), true)}`;
}

/**
 * Everyone's week: tasks due, and busy times from linked calendars and typed-in schedules. Moving to another week slides the old one out
 * and the new one in from the side it lies on. The weeks either side are fetched ahead, so the slide starts at once.
 */
export function CalendarPage({ care, currentUser }: { care: CareData; currentUser: AuthUser }) {
  const { members, tasks } = care;
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const thisWeek = weekStart(getLocalDateInputValue());
  const [start, setStart] = useState(thisWeek);
  const { schedule, errorMessage } = useFamilySchedule(start, 7, tasks, [addDays(start, -7), addDays(start, 7), thisWeek]);

  // The week on screen, and the one sliding away. They only change once the new week's data is in, so the grid
  // never goes blank in between.
  const [shown, setShown] = useState<ShownWeek | null>(null);
  const [leaving, setLeaving] = useState<ShownWeek | null>(null);
  // Later weeks come in from the right (1), earlier ones from the left (-1). Null until the first move.
  const [direction, setDirection] = useState<1 | -1 | null>(null);
  const goTo = (week: string) => {
    if (week === start) return;
    setDirection(week > start ? 1 : -1);
    setStart(week);
  };
  useEffect(() => {
    if (!schedule || schedule.start !== start || (shown?.start === start && shown.schedule === schedule)) return;
    if (shown && shown.start !== start) setLeaving(shown);
    setShown({ start, schedule });
  }, [schedule, start, shown]);
  const slide = { "--slide": direction ?? 1 } as React.CSSProperties;
  // The heading changes with the grid, once the new week is ready.
  const titleWeek = shown?.start ?? start;
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const days = (from: string) => Array.from({ length: 7 }, (_unused, index) => addDays(from, index));

  return (
    <>
      <PageHeader eyebrow="Everyone’s week" title="Calendar" lead="Tasks, and busy times from linked calendars and the schedules people add" />
      <Card>
        <CardHeader className="flex-wrap items-center">
          {/* The dates slide with the grid. */}
          {/* The dates slide with the grid: the old range out, the new one in. */}
          <h2 className="grid font-display text-2xl font-bold" style={slide} aria-live="polite">
            {leaving && <span key={`out-${leaving.start}`} aria-hidden="true" className="week-title-out [grid-area:1/1]">{weekRange(leaving.start)}</span>}
            <span key={titleWeek} className={cn("[grid-area:1/1]", direction && "week-title-in")}>{weekRange(titleWeek)}</span>
          </h2>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => setIsEditingSchedule(true)}><CalendarClock size={15} aria-hidden="true" />My schedule</Button>
            <Button size="sm" variant="outline" disabled={start === thisWeek} onClick={() => goTo(thisWeek)}>This week</Button>
            <Button size="icon" variant="outline" className="size-10 hover:scale-105" aria-label="Previous week" onClick={() => goTo(addDays(start, -7))}><ChevronLeft size={18} aria-hidden="true" /></Button>
            <Button size="icon" variant="outline" className="size-10 hover:scale-105" aria-label="Next week" onClick={() => goTo(addDays(start, 7))}><ChevronRight size={18} aria-hidden="true" /></Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <ScheduleLegend className="mb-4" />
          {errorMessage && <p role="alert" className="mb-3 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
          {shown ? (
            // A new grid for each move, so its slide always starts from the beginning.
            <div aria-busy={shown.start !== start}>
              <WeekGrid
                key={shown.start}
                members={members}
                schedules={shown.schedule.members}
                days={days(shown.start)}
                currentUserId={currentUser.id}
                onOpenTask={setOpenTaskId}
                previous={leaving ? { days: days(leaving.start), schedules: leaving.schedule.members } : undefined}
                direction={direction ?? 1}
                onSlideEnd={() => setLeaving(null)}
              />
            </div>
          ) : !errorMessage && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading the family’s week…</p>}
        </CardContent>
      </Card>
      {isEditingSchedule && <MyScheduleDialog onClose={() => setIsEditingSchedule(false)} />}
      {openTaskId && <TaskDetails care={care} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}

/** The signed-in person's typed-in schedule, opened from the calendar so it is easy to find. */
function MyScheduleDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="my-schedule-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl"
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id="my-schedule-title" className="font-display text-2xl font-bold">My schedule</h2>
          <button autoFocus type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <MySchedule showHeading={false} className="mt-2 border-t-0 pt-0" />
      </div>
    </dialog>
  );
}
