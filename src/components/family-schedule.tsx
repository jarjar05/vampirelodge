import { CalendarClock } from "lucide-react";
import { FamilyAvatar } from "@/components/family-avatar";
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

const kindStyles: Record<ScheduleItem["kind"], string> = {
  // Grey with a dashed edge, so a private busy time never looks like a task.
  busy: "border border-dashed border-muted-foreground/30 bg-foreground/[0.03] text-muted-foreground",
  task: "bg-primary/10 text-primary",
};

function timeRange(item: ScheduleItem) {
  if (item.allDay) return "All day";
  const start = formatClock(new Date(item.start));
  return item.end ? `${start} – ${formatClock(new Date(item.end))}` : start;
}

/** One entry. A busy time from a calendar only ever says "Busy": what the event is stays private. */
export function ScheduleChip({ item, compact = false }: { item: ScheduleItem; compact?: boolean }) {
  return (
    <div className={cn("rounded-md px-2 py-1 text-[11px] leading-snug", kindStyles[item.kind], compact && "inline-flex items-center gap-1.5")}>
      <span className="font-semibold tabular-nums">{timeRange(item)}</span>
      <span className={compact ? "" : "block"}>{item.kind === "busy" ? "Busy" : item.title}</span>
    </div>
  );
}

export function ScheduleLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-primary/30" />Task</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm border border-dashed border-muted-foreground/50 bg-foreground/[0.03]" />Busy (from their calendar)</span>
    </div>
  );
}

const availabilityDots: Record<FamilyMember["availability"], string> = {
  Available: "bg-primary",
  "With family": "bg-primary",
  "On duty": "bg-secondary-foreground",
  "Away today": "bg-alert",
};

/** Name, picture and current availability, with a note when their calendar is not linked or cannot be read. */
export function MemberLabel({ member, schedule }: { member: FamilyMember; schedule?: MemberSchedule }) {
  const calendarNote = !schedule ? null : !schedule.linkedCalendar ? "No calendar linked" : !schedule.calendarOk ? "Calendar unavailable" : null;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-8" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{member.firstName}</p>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", availabilityDots[member.availability])} />
          {member.availability}
        </p>
        {calendarNote && <p className="truncate text-[11px] text-muted-foreground/80">{calendarNote}</p>}
      </div>
    </div>
  );
}

/** A grid of family members down the side and days across the top. */
export function WeekGrid({ members, schedules, days }: { members: readonly FamilyMember[]; schedules: readonly MemberSchedule[]; days: readonly string[] }) {
  const today = getLocalDateInputValue();
  const byMember = new Map(schedules.map((schedule) => [schedule.memberId, schedule]));
  const dayLabel = (day: string) => new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric" }).format(dayStart(day));

  return (
    <div className="custom-scrollbar overflow-x-auto">
      <table className="w-full min-w-[60rem] table-fixed border-separate border-spacing-0 text-left">
        <colgroup><col className="w-44" />{days.map((day) => <col key={day} />)}</colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-card pb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Member</th>
            {days.map((day) => (
              <th key={day} scope="col" className="px-1.5 pb-3 text-center">
                <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", day === today ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{dayLabel(day)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="stagger">
          {members.map((member) => {
            const schedule = byMember.get(member.id);
            return (
              <tr key={member.id}>
                <th scope="row" className="sticky left-0 z-10 border-t border-border bg-card py-3 pr-3 align-top font-normal">
                  <MemberLabel member={member} schedule={schedule} />
                </th>
                {days.map((day) => {
                  const items = itemsOnDay(schedule, day);
                  return (
                    <td key={day} className={cn("border-t border-border px-1.5 py-2 align-top", day === today && "bg-primary/[0.04]")}>
                      <div className="space-y-1">
                        {items.map((item, index) => <ScheduleChip key={`${item.kind}-${item.id ?? index}-${item.start}`} item={item} />)}
                        {/* An empty day for someone whose calendar is linked and readable is known to be free. */}
                        {items.length === 0 && schedule?.linkedCalendar && schedule.calendarOk && <p className="px-1 py-1 text-[11px] text-muted-foreground/70">Free</p>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Today for each member, as a compact list. Used on the Overview. */
export function TodayList({ members, schedules }: { members: readonly FamilyMember[]; schedules: readonly MemberSchedule[] }) {
  const today = getLocalDateInputValue();
  const byMember = new Map(schedules.map((schedule) => [schedule.memberId, schedule]));
  return (
    <div className="stagger divide-y divide-border">
      {members.map((member) => {
        const schedule = byMember.get(member.id);
        const items = itemsOnDay(schedule, today);
        return (
          <div key={member.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <div className="sm:w-40 sm:shrink-0"><MemberLabel member={member} schedule={schedule} /></div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 sm:pt-1">
              {items.map((item, index) => <ScheduleChip key={`${item.kind}-${item.id ?? index}-${item.start}`} item={item} compact />)}
              {items.length === 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock size={13} aria-hidden="true" />
                  {schedule?.linkedCalendar && schedule.calendarOk ? "Free all day" : "Nothing planned"}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
