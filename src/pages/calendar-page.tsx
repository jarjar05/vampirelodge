import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { addDays, dayStart, ScheduleLegend, WeekGrid } from "@/components/family-schedule";
import { useFamilySchedule } from "@/hooks/use-family-schedule";
import { PageHeader } from "@/components/page-parts";
import { getLocalDateInputValue } from "@/lib/dates";
import { type CareData } from "@/hooks/use-care-data";
import { TaskDetails } from "@/pages/tasks-page";

/** The Monday of the week that contains `day`. */
function weekStart(day: string) {
  const date = dayStart(day);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return getLocalDateInputValue(date);
}

/** Everyone's week: tasks due, and busy times from linked calendars. */
export function CalendarPage({ care }: { care: CareData }) {
  const { members, tasks } = care;
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const thisWeek = weekStart(getLocalDateInputValue());
  const [start, setStart] = useState(thisWeek);
  // Fetched again whenever a task changes.
  const { schedule, errorMessage } = useFamilySchedule(start, 7, tasks);
  const days = Array.from({ length: 7 }, (_unused, index) => addDays(start, index));
  const range = `${new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(dayStart(days[0]))} – ${new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(dayStart(days[6]))}`;

  return (
    <>
      <PageHeader eyebrow="Everyone’s week" title="Calendar" lead="Tasks, and busy times from the calendars people have linked" />
      <Card>
        <CardHeader className="flex-wrap items-center">
          <h2 className="font-display text-2xl font-bold">{range}</h2>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={start === thisWeek} onClick={() => setStart(thisWeek)}>This week</Button>
            <Button size="icon" variant="outline" className="size-10 hover:scale-105" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={18} aria-hidden="true" /></Button>
            <Button size="icon" variant="outline" className="size-10 hover:scale-105" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={18} aria-hidden="true" /></Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <ScheduleLegend className="mb-4" />
          {errorMessage && <p role="alert" className="mb-3 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
          {schedule
            ? <WeekGrid members={members} schedules={schedule.start === start ? schedule.members : []} days={days} onOpenTask={setOpenTaskId} />
            : !errorMessage && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading the family’s week…</p>}
        </CardContent>
      </Card>
      {openTaskId && <TaskDetails care={care} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
