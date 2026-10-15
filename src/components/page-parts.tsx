/** Small pieces shared by several pages: headings, titled cards, empty notes, workload bars and the activity list. */
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FamilyAvatar } from "@/components/family-avatar";
import { BannerContent } from "@/components/scene-banner";
import {
  type CareTask,
  type FamilyActivityItem,
  type FamilyMember,
} from "@/types/care";

/** The top of a page, shown in the illustrated header: the title, a line about the page, and its main actions. */
export function PageHeader({ title, eyebrow, lead, actions }: { title: React.ReactNode; eyebrow?: React.ReactNode; lead?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <BannerContent className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-[128px] sm:px-8 sm:pt-7 sm:pb-[118px]">
      <div className="min-w-0">
        {eyebrow && <p className="text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-[clamp(30px,4vw,44px)] font-bold leading-[1.05]">{title}</h1>
        {lead && <p className="mt-2 max-w-2xl text-[15px] text-foreground/80">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </BannerContent>
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
        <h2 className="font-display text-[23px] font-bold">{title}</h2>
        <Link to={to} aria-label={iconOnlyLink ? linkLabel : undefined} className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-extrabold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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

export function FamilyWorkloadBar({ name, activeTasks, maxTasks, colour = "var(--primary)" }: { name: string; activeTasks: number; maxTasks: number; colour?: string }) {
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${name} active tasks`}
        aria-valuemin={0}
        aria-valuemax={maxTasks}
        aria-valuenow={activeTasks}
        aria-valuetext={`${activeTasks} active tasks`}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="bar-fill h-full rounded-full" style={{ width: `${Math.max(4, (activeTasks / maxTasks) * 100)}%`, background: colour }} />
      </div>
    </div>
  );
}

export const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm font-normal focus:outline-none";

/** The latest few updates, as a short preview on the Overview that links to the full feed. */
export function ActivityCard({ activity, members, to }: { activity: readonly FamilyActivityItem[]; members: readonly FamilyMember[]; to: string }) {
  return (
    <OverviewCard title="Activity" to={to} linkLabel="All activity">
      <div className="stagger space-y-3.5 pt-1">
        {activity.map((item) => {
          const member = members.find((person) => person.id === item.actorId);
          return (
            <div key={item.id} className="flex gap-3">
              <FamilyAvatar initials={member?.initials.slice(0, 1) ?? item.person.slice(0, 1)} tone={member?.tone} imageUrl={member?.avatarUrl} className="size-[30px] text-[10px]" />
              <div className="min-w-0 flex-1"><p className="text-[15px] leading-snug"><span className="font-extrabold">{item.person}</span> {item.action} <span className="font-extrabold">{item.subject}</span></p><p className="mt-0.5 text-[12.5px] text-muted-foreground">{item.time}</p></div>
            </div>
          );
        })}
        {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
      </div>
    </OverviewCard>
  );
}
