import { type CareData } from "@/hooks/use-care-data";
import { FamilyAvatar, toneColours } from "@/components/family-avatar";
import { EmptyNote, PageHeader } from "@/components/page-parts";
import { formatClock, formatDay } from "@/lib/dates";
import type { FamilyActivityItem } from "@/types/care";

/** Everything the family has done, newest first, told as a journal and grouped by day. */
export function ActivityPage({ care }: { care: CareData }) {
  const days: { label: string; items: FamilyActivityItem[] }[] = [];
  for (const item of care.activity) {
    const label = formatDay(new Date(item.at));
    const day = days.at(-1);
    if (day?.label === label) day.items.push(item);
    else days.push({ label, items: [item] });
  }
  let entry = 0;

  return (
    <>
      <PageHeader eyebrow="What everyone has been doing" title="Activity" lead="Every task added, handed over, changed and finished, newest first" />
      {days.length === 0 && <EmptyNote>No activity yet.</EmptyNote>}
      <div className="space-y-6">
        {days.map((day) => (
          <section key={day.label} aria-label={day.label}>
            <h2 className="flex items-center gap-3 font-display text-[22px] font-bold after:h-px after:flex-1 after:bg-border">{day.label === "Today" || day.label === "Yesterday" ? day.label : new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(new Date(day.items[0].at))}</h2>
            <ol className="journal-entries relative mt-3.5 space-y-3 pl-7">
              {day.items.map((item) => {
                const member = care.members.find((person) => person.id === item.actorId);
                const done = item.action.startsWith("completed");
                return (
                  <li
                    key={item.id}
                    className="journal-entry enter-rise relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3"
                    style={{ "--person": member ? toneColours[member.tone] : "var(--muted-foreground)", "--i": Math.min(entry++, 10) } as React.CSSProperties}
                  >
                    <FamilyAvatar initials={member?.initials ?? item.person.slice(0, 1)} tone={member?.tone} imageUrl={member?.avatarUrl} className="size-8 text-[11px]" />
                    <p className="min-w-0 text-[15px]">
                      <span className="font-extrabold">{item.person}</span>{" "}
                      <span className={done ? "font-bold text-success-foreground" : undefined}>{done ? `✓ ${item.action}` : item.action}</span>{" "}
                      <span className="font-extrabold">{item.subject}</span>
                    </p>
                    <time dateTime={item.at} className="whitespace-nowrap text-[13px] font-bold text-muted-foreground">{formatClock(new Date(item.at))}</time>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
