import { useEffect, useRef, useState } from "react";
import { careApi } from "@/api/care";
import type { CareTask, FamilySchedule } from "@/types/care";

/** Sent when someone changes their own typed-in schedule, so calendars on screen fetch again. */
export const scheduleChangedEvent = "care:schedule-changed";

/** A short text that changes whenever anything the schedule shows changes, so it is fetched again then and only then. */
function scheduleKey(tasks: readonly CareTask[]) {
  return tasks.map((task) => `${task.id}:${task.dueAt ?? ""}:${task.assigneeIds.join(",")}:${task.complete}:${task.title}`).join("|");
}

/**
 * Everyone's tasks due and calendar busy times for `days` days from `start` (YYYY-MM-DD, local).
 * Each span fetched is kept, and the spans in `prefetch` are fetched ahead, so moving to one of them shows it at
 * once. When a task changes, what is kept stays on screen while it is fetched again.
 */
export function useFamilySchedule(start: string, days: number, tasks: readonly CareTask[], prefetch: readonly string[] = []) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = () => setRevision((current) => current + 1);
    window.addEventListener(scheduleChangedEvent, bump);
    return () => window.removeEventListener(scheduleChangedEvent, bump);
  }, []);
  const version = `${revision}#${scheduleKey(tasks)}`;
  const [cache, setCache] = useState<ReadonlyMap<string, FamilySchedule>>(new Map());
  const [errorMessage, setErrorMessage] = useState("");
  // Which version of the data each span was last asked for, so a span is asked for only once per version.
  const requested = useRef(new Map<string, string>());
  const latestVersion = useRef(version);
  latestVersion.current = version;
  const prefetchKey = prefetch.join(",");

  useEffect(() => {
    for (const from of [start, ...(prefetchKey ? prefetchKey.split(",") : [])]) {
      const key = `${from}|${days}`;
      if (requested.current.get(key) === version) continue;
      requested.current.set(key, version);
      careApi.getSchedule(from, days)
        .then((result) => {
          // An answer for data that has since changed is dropped; the newer request replaces it.
          if (latestVersion.current !== version) return;
          setCache((current) => new Map(current).set(key, result));
          if (from === start) setErrorMessage("");
        })
        .catch((error) => {
          requested.current.delete(key);
          if (from === start && latestVersion.current === version) setErrorMessage(error instanceof Error ? error.message : "The schedule could not be loaded.");
        });
    }
  }, [start, days, version, prefetchKey]);

  return { schedule: cache.get(`${start}|${days}`) ?? null, errorMessage };
}
