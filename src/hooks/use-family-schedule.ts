import { useEffect, useState } from "react";
import { careApi } from "@/api/care";
import type { CareTask, FamilySchedule } from "@/types/care";

/** A short text that changes whenever anything the schedule shows changes, so it is fetched again then and only then. */
function scheduleKey(tasks: readonly CareTask[]) {
  return tasks.map((task) => `${task.id}:${task.dueAt ?? ""}:${task.assigneeIds.join(",")}:${task.complete}:${task.title}`).join("|");
}

/** Everyone's tasks due and calendar busy times for `days` days from `start` (YYYY-MM-DD, local). */
export function useFamilySchedule(start: string, days: number, tasks: readonly CareTask[]) {
  const version = scheduleKey(tasks);
  const [schedule, setSchedule] = useState<FamilySchedule | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    careApi.getSchedule(start, days)
      .then((result) => { if (isCurrent) { setSchedule(result); setErrorMessage(""); } })
      .catch((error) => { if (isCurrent) setErrorMessage(error instanceof Error ? error.message : "The schedule could not be loaded."); });
    return () => { isCurrent = false; };
  }, [start, days, version]);

  return { schedule, errorMessage };
}
