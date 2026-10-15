import { FamilyAvatar, toneColours } from "@/components/family-avatar";
import { formatClock, getLocalDateInputValue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { FamilyMember, MemberSchedule, ScheduleItem } from "@/types/care";

const dayMs = 24 * 60 * 60_000;

/** Midnight at the start of a local day given as YYYY-MM-DD. */
export function dayStart(day: string) {
  return new Date(`${day}T00:00`);
}

export function addDays(day: string, count: number) {
  const date = dayStart(day);
  date.setDate(date.getDate() + count);
  return getLocalDateInputValue(date);
}

/** The items that touch a local day, all-day ones first, then by time. */
export function itemsOnDay(member: MemberSchedule | undefined, day: string) {
  if (!member) return [];
  const from = dayStart(day).getTime();
  const to = from + dayMs;
  return member.items.filter((item) => {
    const start = new Date(item.start).getTime();
    const end = item.end ? new Date(item.end).getTime() : start + 1;
    return start < to && end > from;
  });
}

/** Whether an empty day means they are free: their calendar was read, or they typed in their own schedule. */
function knowsFreeTime(schedule: MemberSchedule | undefined) {
  return Boolean(schedule && ((schedule.linkedCalendar && schedule.calendarOk) || schedule.manualSchedule));
}

function timeRange(item: ScheduleItem) {
  if (item.allDay) return "All day";
  const start = formatClock(new Date(item.start));
  return item.end ? `${start} – ${formatClock(new Date(item.end))}` : start;
}

/** A task in the schedule whose due time has passed. The schedule only holds open tasks. */
function isLate(item: ScheduleItem, now = Date.now()) {
  return item.kind === "task" && new Date(item.start).getTime() < now;
}

/** One entry, in its person's colour. A busy time from a calendar only ever says "Busy": what the event is stays private.
 * One typed in by hand shows the label its owner chose to share. */
export function ScheduleChip({ item, colour, onOpenTask }: { item: ScheduleItem; colour: string; onOpenTask?: (taskId: string) => void }) {
  const late = isLate(item);
  const opens = item.kind === "task" && item.id && onOpenTask;
  const Tag = opens ? "button" : "div";
  return (
    <Tag
      type={opens ? "button" : undefined}
      onClick={opens ? () => onOpenTask(item.id!) : undefined}
      aria-haspopup={opens ? "dialog" : undefined}
      style={{ "--person": colour } as React.CSSProperties}
      className={cn(
        "block w-full rounded-xl px-2.5 py-1.5 text-left text-[12px] leading-snug transition-[translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]",
        opens && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        item.kind === "busy" && "border-[1.5px] border-dashed border-[color-mix(in_srgb,var(--person)_50%,transparent)] text-muted-foreground",
        // A task always keeps its person's colour; being overdue adds a red outline and a label.
        item.kind === "task" && "border border-[color-mix(in_srgb,var(--person)_40%,transparent)] bg-[color-mix(in_srgb,var(--person)_18%,var(--card))]",
        late && "border-alert shadow-[0_0_0_1px_var(--alert)]",
      )}
    >
      <span className="block font-extrabold tabular-nums">{timeRange(item)}</span>
      <span className="block">{item.kind === "busy" ? item.title ?? "Busy" : item.title}</span>
      {late && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-alert/12 px-1.5 py-px text-[10.5px] font-extrabold text-alert">● Overdue</span>}
    </Tag>
  );
}

export function ScheduleLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] font-bold text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3.5 rounded border border-primary bg-primary/25" />Task, in each person’s colour</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3.5 rounded border-[1.5px] border-dashed border-muted-foreground" />Busy: their calendar or own schedule</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3.5 rounded border-2 border-alert" />Overdue: outlined in red</span>
    </div>
  );
}

const availabilityDots: Record<FamilyMember["availability"], string> = {
  Available: "bg-sage",
  "With family": "bg-sage",
  "On duty": "bg-teal",
  "Away today": "bg-alert",
};

/** Name, picture and current availability, with a note when their calendar is not linked or cannot be read. */
export function MemberLabel({ member, schedule, isYou = false }: { member: FamilyMember; schedule?: MemberSchedule; isYou?: boolean }) {
  const calendarNote = !schedule ? null
    : schedule.linkedCalendar ? (schedule.calendarOk ? null : "Calendar unavailable")
      : schedule.manualSchedule ? "Own schedule" : "No schedule shared";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-8" />
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-extrabold", isYou && "text-primary")}>{isYou ? "You" : member.firstName}</p>
        <p className="flex items-center gap-1.5 truncate text-[12px] font-bold text-muted-foreground">
          <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", availabilityDots[member.availability])} />
          {member.availability}
        </p>
        {calendarNote && <p className="truncate text-[12px] font-bold text-muted-foreground">{calendarNote}</p>}
      </div>
    </div>
  );
}

type Week = { days: readonly string[]; schedules: readonly MemberSchedule[] };

/**
 * One cell's content. While the grid moves to another week, the old week's content slides out and the new one in
 * across the whole row of days, both in the same cell, so each row stays one row and its lines stay straight.
 */
function Sliding({ before, children, className }: { before?: React.ReactNode; children: React.ReactNode; className?: string }) {
  if (before === undefined) return <div className={className}>{children}</div>;
  return (
    <div className="grid">
      <div aria-hidden="true" inert className={cn("week-cell-out [grid-area:1/1]", className)}>{before}</div>
      <div className={cn("week-cell-in [grid-area:1/1]", className)}>{children}</div>
    </div>
  );
}

/**
 * A grid of family members down the side and days across the top. Given the week it is leaving (`previous`), the
 * days slide across to the new week in `direction` (1 for later, -1 for earlier) while the members stay put.
 */
export function WeekGrid({ members, schedules, days, currentUserId, onOpenTask, previous, direction = 1, onSlideEnd }: {
  members: readonly FamilyMember[];
  schedules: readonly MemberSchedule[];
  days: readonly string[];
  /** The signed-in person, whose row says "You" instead of their name. */
  currentUserId?: string;
  onOpenTask?: (taskId: string) => void;
  previous?: Week;
  direction?: 1 | -1;
  onSlideEnd?: () => void;
}) {
  const today = getLocalDateInputValue();
  const byMember = new Map(schedules.map((schedule) => [schedule.memberId, schedule]));
  const before = previous ? new Map(previous.schedules.map((schedule) => [schedule.memberId, schedule])) : undefined;
  const dayLabel = (day: string) => (
    <span className={cn("inline-block rounded-full px-3 py-1 text-[13px] font-extrabold", day === today ? "bg-primary text-primary-foreground shadow-[0_8px_16px_-10px_var(--primary)]" : "text-muted-foreground")}>
      {new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric" }).format(dayStart(day))}
    </span>
  );
  const dayItems = (schedule: MemberSchedule | undefined, day: string, colour: string, opens?: (taskId: string) => void) => {
    const items = itemsOnDay(schedule, day);
    return (
      <div className="space-y-1.5">
        {items.map((item, index) => <ScheduleChip key={`${item.kind}-${item.id ?? index}-${item.start}`} item={item} colour={colour} onOpenTask={opens} />)}
        {/* An empty day for someone whose free time is known shows as free. */}
        {items.length === 0 && knowsFreeTime(schedule) && <p className="px-1 py-1.5 text-[12px] font-bold text-muted-foreground/70">Free</p>}
      </div>
    );
  };
  const isSliding = previous !== undefined;

  return (
    // Hidden rather than scrolling while sliding, so the week coming in does not briefly widen the scroll area.
    <div className={cn("custom-scrollbar", isSliding ? "overflow-x-hidden" : "overflow-x-auto")}>
      <table
        className="w-full min-w-[60rem] table-fixed border-separate border-spacing-0 text-left"
        style={{ "--slide": direction } as React.CSSProperties}
        onAnimationEnd={(event) => { if (event.animationName === "week-cell-out") onSlideEnd?.(); }}
      >
        <colgroup><col className="w-44" />{days.map((day) => <col key={day} />)}</colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-card pb-3 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Member</th>
            {days.map((day, column) => (
              <th key={column} scope="col" className="px-0 pb-3 text-center">
                <Sliding className="px-1.5" before={previous && dayLabel(previous.days[column])}>{dayLabel(day)}</Sliding>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="stagger">
          {members.map((member) => {
            const schedule = byMember.get(member.id);
            const colour = toneColours[member.tone];
            return (
              <tr key={member.id}>
                <th scope="row" className="sticky left-0 z-10 border-t border-border bg-card py-3 pr-3 align-top font-normal">
                  <MemberLabel member={member} schedule={schedule} isYou={member.id === currentUserId} />
                </th>
                {days.map((day, column) => (
                  // Today's column is tinted; the tint fades out during a slide and back in where today lands.
                  <td key={column} className={cn("border-t border-border px-0 py-2.5 align-top transition-colors duration-500", day === today && !isSliding && "bg-primary/[0.05]")}>
                    <Sliding className="px-1.5" before={previous && dayItems(before?.get(member.id), previous.days[column], colour)}>
                      {dayItems(schedule, day, colour, onOpenTask)}
                    </Sliding>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The span of the day the timeline shows, in hours. Anything earlier or later is drawn at the edge.
const firstHour = 7;
const lastHour = 22;

/** Today for everyone on one timeline: a lane per person, busy times dashed, tasks as solid marks. Used on the Overview. */
export function DayTimeline({ members, schedules, currentUserId, onOpenTask }: { members: readonly FamilyMember[]; schedules: readonly MemberSchedule[]; currentUserId?: string; onOpenTask?: (taskId: string) => void }) {
  const today = getLocalDateInputValue();
  const byMember = new Map(schedules.map((schedule) => [schedule.memberId, schedule]));
  const start = dayStart(today).getTime() + firstHour * 3_600_000;
  const span = (lastHour - firstHour) * 3_600_000;
  const position = (time: number) => Math.min(100, Math.max(0, ((time - start) / span) * 100));
  const now = Date.now();
  const nowAt = now > start && now < start + span ? position(now) : null;
  const hourLabels = [7, 10, 13, 16, 19, 22].map((hour) => formatClock(new Date(dayStart(today).getTime() + hour * 3_600_000)).replace(":00", ""));

  return (
    <div className="mt-4 flex flex-1 flex-col">
      <div className="stagger flex flex-1 flex-col justify-evenly gap-2.5">
        {members.map((member, lane) => {
          const schedule = byMember.get(member.id);
          const items = itemsOnDay(schedule, today);
          const colour = toneColours[member.tone];
          return (
            <div key={member.id} className="grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)]">
              <div className="flex min-w-0 items-center gap-2.5">
                <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-8" />
                <span className={cn("truncate text-sm font-extrabold", member.id === currentUserId && "text-primary")}>{member.id === currentUserId ? "You" : member.firstName}</span>
              </div>
              <div className="day-track relative h-9 rounded-xl" style={{ "--person": colour } as React.CSSProperties}>
                {/* What the lane shows, for screen readers. */}
                <span className="sr-only">
                  {items.length === 0
                    ? (knowsFreeTime(schedule) ? "Free all day" : "Nothing planned")
                    : items.filter((item) => item.kind === "busy" || !onOpenTask).map((item) => `${timeRange(item)}: ${item.kind === "busy" ? item.title ?? "Busy" : item.title}${isLate(item, now) ? " (overdue)" : ""}`).join("; ")}
                </span>
                {items.map((item, index) => {
                  const from = item.allDay ? 0 : position(new Date(item.start).getTime());
                  const to = item.allDay ? 100 : item.end ? position(new Date(item.end).getTime()) : from;
                  const late = isLate(item, now);
                  // A task can be clicked to open its details; a busy time is only a picture.
                  const opens = item.kind === "task" && item.id && onOpenTask;
                  const Tag = opens ? "button" : "span";
                  return (
                    <Tag
                      key={`${item.kind}-${item.id ?? index}-${item.start}`}
                      type={opens ? "button" : undefined}
                      onClick={opens ? () => onOpenTask(item.id!) : undefined}
                      aria-haspopup={opens ? "dialog" : undefined}
                      aria-label={opens ? `${item.title}, ${timeRange(item)}${late ? ", overdue" : ""}` : undefined}
                      aria-hidden={opens ? undefined : true}
                      title={`${timeRange(item)} · ${item.kind === "busy" ? item.title ?? "Busy" : item.title}${late ? " · Overdue" : ""}`}
                      className={cn("day-block absolute top-[5px] bottom-[5px] z-0 [&.task]:z-[1] overflow-hidden text-ellipsis whitespace-nowrap rounded-[9px] px-2 text-left text-[12px] font-extrabold leading-[26px]", item.kind, late && "late", item.kind === "busy" && "text-muted-foreground", opens && "cursor-pointer transition-[translate,filter] hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                      style={{
                        left: `${Math.min(from, 97)}%`,
                        width: item.kind === "task" ? undefined : `${Math.max(to - from, 2)}%`,
                        minWidth: item.kind === "task" ? 28 : undefined,
                        maxWidth: item.kind === "task" ? `${100 - Math.min(from, 97)}%` : undefined,
                        animationDelay: `${0.2 + lane * 0.06 + index * 0.05}s`,
                      }}
                    >
                      {item.kind === "busy" ? item.title ?? "Busy" : item.title}
                    </Tag>
                  );
                })}
                {items.length === 0 && (
                  <span aria-hidden="true" className="absolute inset-y-0 left-3 flex items-center text-[12px] font-bold text-muted-foreground/70">
                    {knowsFreeTime(schedule) ? "Free all day" : "Nothing planned"}
                  </span>
                )}
                {nowAt !== null && <span aria-hidden="true" className={cn("absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-primary", lane === 0 && "now-line")} style={{ left: `${nowAt}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-2 grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-3 text-[12px] font-bold text-muted-foreground sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)]">
        <span />
        <div className="flex justify-between whitespace-nowrap">
          {/* On a narrow screen every other hour, so each fits on one line. */}
          {hourLabels.map((label, index) => <span key={label} className={index % 2 ? "hidden sm:inline" : undefined}>{label}</span>)}
        </div>
      </div>
    </div>
  );
}
