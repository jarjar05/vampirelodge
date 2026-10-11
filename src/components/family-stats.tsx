import { useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Timer } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { FamilyAvatar } from "@/components/family-avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CareTask, FamilyMember } from "@/types/care";

const periods = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: null },
] as const;

type MemberStats = {
  member: FamilyMember;
  /** Finished in the chosen period. */
  completed: number;
  /** Of those, finished by the due time. A task with no due time counts as on time. */
  onTime: number;
  /** Still to do, whenever it was assigned. */
  open: number;
  overdue: number;
  /** Everything they have carried: finished in the period plus still open. */
  assigned: number;
};

function buildStats(members: readonly FamilyMember[], tasks: readonly CareTask[], days: number | null, now: Date): MemberStats[] {
  const since = days === null ? null : now.getTime() - days * 24 * 60 * 60_000;
  return members.map((member) => {
    const mine = tasks.filter((task) => task.assigneeId === member.id);
    const completed = mine.filter((task) => task.complete && (since === null || (task.completedAt !== undefined && new Date(task.completedAt).getTime() >= since)));
    const onTime = completed.filter((task) => !task.dueAt || !task.completedAt || new Date(task.completedAt).getTime() <= new Date(task.dueAt).getTime());
    const open = mine.filter((task) => !task.complete);
    return {
      member,
      completed: completed.length,
      onTime: onTime.length,
      open: open.length,
      overdue: open.filter((task) => task.attention === "Overdue").length,
      assigned: completed.length + open.length,
    };
  });
}

/** Names of whoever has the highest score, e.g. "Jerry" or "Jerry and Siti". Null when nobody scores above zero. */
function leaders(stats: readonly MemberStats[], score: (entry: MemberStats) => number | null) {
  const scored = stats.flatMap((entry) => {
    const value = score(entry);
    return value === null ? [] : [{ name: entry.member.firstName, value }];
  });
  const best = Math.max(0, ...scored.map((entry) => entry.value));
  if (best === 0) return null;
  const names = scored.filter((entry) => entry.value === best).map((entry) => entry.name);
  return { best, names: names.length <= 2 ? names.join(" and ") : `${names.length} people tied` };
}

function Highlight({ icon: Icon, label, name, value }: { icon: typeof Timer; label: string; name: string | null; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"><Icon size={14} aria-hidden="true" />{label}</p>
      {/* Keyed by its text, so a new leader or figure rises into place instead of snapping. */}
      <div key={`${name}|${value}`} className="swap-in">
        <p className="mt-2 truncate font-display text-xl font-semibold">{name ?? "No one yet"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{name ? value : "Nothing to show for this period"}</p>
      </div>
    </div>
  );
}

/** Who has been finishing tasks, who finishes on time, and who is carrying the most. */
export function FamilyStats({ members, tasks, className }: { members: readonly FamilyMember[]; tasks: readonly CareTask[]; className?: string }) {
  const [periodIndex, setPeriodIndex] = useState(0);
  const period = periods[periodIndex];
  const stats = buildStats(members, tasks, period.days, new Date()).sort((first, second) => second.completed - first.completed || second.assigned - first.assigned);
  const mostCompleted = leaders(stats, (entry) => entry.completed);
  const mostAssigned = leaders(stats, (entry) => entry.assigned);
  // One finished task is too little to call someone the most punctual, unless nobody has more.
  const minimumForOnTime = stats.some((entry) => entry.completed >= 3) ? 3 : 1;
  const mostOnTime = leaders(stats, (entry) => (entry.completed >= minimumForOnTime ? Math.round((entry.onTime / entry.completed) * 100) : null));
  const maxCompleted = Math.max(1, ...stats.map((entry) => entry.completed));
  const periodPhrase = period.days === null ? "so far" : `in the last ${period.days} days`;

  // When the order changes, each row glides from where it was to where it now belongs.
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const previousTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    rows.current.forEach((row, id) => {
      const top = row.offsetTop;
      const before = previousTops.current.get(id);
      if (before !== undefined && before !== top && !reduceMotion && typeof row.animate === "function") {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
      previousTops.current.set(id, top);
    });
  });

  return (
    <Card className={className}>
      <CardHeader className="flex-wrap items-center">
        <h2 className="font-display text-xl font-semibold">Task history</h2>
        <div role="radiogroup" aria-label="Period" className="relative grid grid-cols-3 rounded-lg border border-border bg-muted/60 p-1">
          <span aria-hidden="true" className="segment-thumb pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-card shadow-sm" style={{ translate: `${periodIndex * 100}% 0` }} />
          {periods.map((option, index) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={periodIndex === index}
              onClick={() => setPeriodIndex(index)}
              className={`relative whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${periodIndex === index ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Highlight icon={CheckCircle2} label="Most completed" name={mostCompleted?.names ?? null} value={`${mostCompleted?.best} ${mostCompleted?.best === 1 ? "task" : "tasks"} ${periodPhrase}`} />
          <Highlight icon={Timer} label="Most on time" name={mostOnTime?.names ?? null} value={`${mostOnTime?.best}% finished by the due time`} />
          <Highlight icon={ClipboardList} label="Most assigned" name={mostAssigned?.names ?? null} value={`${mostAssigned?.best} ${mostAssigned?.best === 1 ? "task" : "tasks"}, done or still open`} />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-semibold">Member</th>
                <th scope="col" className="w-[34%] px-3 py-2 font-semibold">Completed</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">On time</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Open</th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Overdue</th>
              </tr>
            </thead>
            <tbody className="stagger divide-y divide-border">
              {stats.map(({ member, completed, onTime, open, overdue }) => (
                <tr key={member.id} ref={(row) => { if (row) rows.current.set(member.id, row); else rows.current.delete(member.id); }}>
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2.5">
                      <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-8" />
                      <span className="truncate font-semibold">{member.firstName}</span>
                    </span>
                  </th>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="bar-fill block h-full rounded-full bg-primary" style={{ width: `${(completed / maxCompleted) * 100}%` }} />
                      </span>
                      <span className="w-6 text-right font-semibold"><CountUp value={completed} /></span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums" title={completed > 0 ? `${onTime} of ${completed} finished by the due time` : undefined}>
                    {completed > 0 ? <CountUp value={Math.round((onTime / completed) * 100)} suffix="%" /> : <span className="text-muted-foreground" aria-label="No completed tasks">–</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{open}</td>
                  <td className={`py-3 pl-3 text-right tabular-nums ${overdue > 0 ? "font-semibold text-alert" : "text-muted-foreground"}`}>{overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
