/** Small pieces shared by several pages: headings, titled cards, empty notes, workload bars and the activity list. */
import {
  Activity as ActivityIcon,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FamilyAvatar } from "@/components/family-avatar";
import {
  type CareTask,
  type FamilyActivityItem,
  type FamilyMember,
} from "@/types/care";

export function PageHeading({ title, eyebrow, description, showDetails = false }: { title: string; eyebrow?: string; description?: string; showDetails?: boolean }) {
  return (
    <div className="mb-8">
      {showDetails && eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>}
      <h1 className={`${showDetails ? "mt-2 " : ""}font-display text-3xl font-semibold tracking-tight md:text-4xl`}>{title}</h1>
      {showDetails && description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

export function countActiveTasks(tasks: readonly CareTask[], memberId: string) {
  return tasks.filter((task) => !task.complete && task.assigneeId === memberId).length;
}

/** A plain titled card for the overview: one heading, one optional link, no eyebrow text. */
export function OverviewCard({ title, to, linkLabel, iconOnlyLink = false, children }: { title: string; to: string; linkLabel: string; iconOnlyLink?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <Link to={to} aria-label={iconOnlyLink ? linkLabel : undefined} className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {!iconOnlyLink && linkLabel}<ArrowRight size={15} aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}

export function FamilyWorkloadBar({ name, activeTasks, maxTasks }: { name: string; activeTasks: number; maxTasks: number }) {
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${name} active tasks`}
        aria-valuemin={0}
        aria-valuemax={maxTasks}
        aria-valuenow={activeTasks}
        aria-valuetext={`${activeTasks} active tasks`}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="bar-fill h-full rounded-full bg-primary" style={{ width: `${(activeTasks / maxTasks) * 100}%` }} />
      </div>
      <span className="w-4 text-right text-xs font-semibold tabular-nums text-muted-foreground">{activeTasks}</span>
    </div>
  );
}

export const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";

export function ActivityCard({ activity, members, to }: { activity: readonly FamilyActivityItem[]; members: readonly FamilyMember[]; to?: string }) {
  const rows = (
    <div className="space-y-4">
      {activity.map((item) => {
        const member = members.find((person) => person.id === item.actorId);
        return (
          <div key={item.id} className="flex gap-3">
            <FamilyAvatar initials={member?.initials.slice(0, 1) ?? item.person.slice(0, 1)} tone={member?.tone} imageUrl={member?.avatarUrl} className="size-8" />
            <div className="min-w-0 flex-1"><p className="text-xs leading-relaxed"><span className="font-semibold">{item.person}</span> {item.action} <span className="font-semibold">{item.subject}</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.time}</p></div>
          </div>
        );
      })}
      {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
    </div>
  );

  // On the overview this is a short preview that links to the full feed.
  if (to) return <OverviewCard title="Activity" to={to} linkLabel="All activity"><div className="pt-1">{rows}</div></OverviewCard>;

  return (
    <Card>
      <CardHeader><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Latest family updates</p><h2 className="mt-1 font-display text-xl font-semibold">Family activity</h2></div><ActivityIcon size={18} className="mt-1 text-primary" aria-hidden="true" /></CardHeader>
      <CardContent className="pt-4">{rows}</CardContent>
    </Card>
  );
}
