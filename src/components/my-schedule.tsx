import { useEffect, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { careApi } from "@/api/care";
import { markDayPlanStale } from "@/components/day-plan-card";
import { Button } from "@/components/ui/button";
import { DatePicker, TimePicker } from "@/components/ui/date-time-picker";
import { scheduleChangedEvent } from "@/hooks/use-family-schedule";
import { getLocalDateInputValue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MyScheduleEntry, NewScheduleEntry } from "@/types/care";

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";

function clock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}

/** "Mon–Fri", "Mon, Wed" or "Every day". */
function describeDays(weekdays: number[]) {
  if (weekdays.length === 7) return "Every day";
  const isRun = weekdays.length > 2 && weekdays.every((day, index) => index === 0 || day === weekdays[index - 1] + 1);
  return isRun ? `${dayNames[weekdays[0]]}–${dayNames[weekdays.at(-1)!]}` : weekdays.map((day) => dayNames[day]).join(", ");
}

/** e.g. "Mon–Fri · 9:00 AM – 5:30 PM" or "Thu, Oct 22 · 10:00 PM – 6:00 AM (next day)". */
export function describeEntry(entry: NewScheduleEntry) {
  const when = entry.onDate
    ? new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${entry.onDate}T00:00`))
    : describeDays(entry.weekdays);
  return `${when} · ${clock(entry.startTime)} – ${clock(entry.endTime)}${entry.endTime <= entry.startTime ? " (next day)" : ""}`;
}

const blankEntry = (): NewScheduleEntry => ({ label: "", weekdays: [0, 1, 2, 3, 4], onDate: null, startTime: "09:00", endTime: "17:00" });

/**
 * The signed-in person's own busy times, typed in by hand. For anyone who does not link a calendar, or wants to add
 * something it does not have. The family sees these on the shared calendar, with the label if one is given.
 */
export function MySchedule({ className, showHeading = true }: { className?: string; showHeading?: boolean }) {
  const [entries, setEntries] = useState<MyScheduleEntry[] | null>(null);
  // The entry being written: a new one ("new"), one being changed (its id), or none.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewScheduleEntry>(blankEntry);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    careApi.mySchedule()
      .then((result) => { if (isCurrent) setEntries(result); })
      .catch((error) => { if (isCurrent) setErrorMessage(error instanceof Error ? error.message : "Your schedule could not be loaded."); });
    return () => { isCurrent = false; };
  }, []);

  const changed = () => {
    markDayPlanStale();
    window.dispatchEvent(new Event(scheduleChangedEvent));
  };
  const startEditing = (entry?: MyScheduleEntry) => {
    setErrorMessage("");
    setEditing(entry?.id ?? "new");
    setDraft(entry ? { label: entry.label ?? "", weekdays: entry.weekdays, onDate: entry.onDate, startTime: entry.startTime, endTime: entry.endTime } : blankEntry());
  };
  const save = async () => {
    if (!editing) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      const entry = { ...draft, label: draft.label?.trim() || null };
      const saved = editing === "new" ? await careApi.addScheduleEntry(entry) : await careApi.updateScheduleEntry(editing, entry);
      setEntries((current) => editing === "new" ? [...(current ?? []), saved] : (current ?? []).map((item) => item.id === saved.id ? saved : item));
      setEditing(null);
      changed();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That could not be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const remove = async (entry: MyScheduleEntry) => {
    setErrorMessage("");
    try {
      await careApi.deleteScheduleEntry(entry.id);
      setEntries((current) => (current ?? []).filter((item) => item.id !== entry.id));
      if (editing === entry.id) setEditing(null);
      changed();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That could not be removed. Please try again.");
    }
  };

  const isWeekly = draft.onDate === null;
  const toggleDay = (day: number) => setDraft((current) => ({
    ...current,
    weekdays: current.weekdays.includes(day) ? current.weekdays.filter((item) => item !== day) : [...current.weekdays, day].sort(),
  }));
  const canSave = !isSaving && draft.startTime !== draft.endTime && (isWeekly ? draft.weekdays.length > 0 : Boolean(draft.onDate));

  return (
    <fieldset className={cn("mt-6 border-t border-border pt-5", className)}>
      <legend className={showHeading ? "float-left mb-1 flex w-full items-center gap-2 text-sm font-semibold" : "sr-only"}><CalendarClock size={15} aria-hidden="true" />My schedule</legend>
      <p className="clear-both text-xs leading-relaxed text-muted-foreground">
        No calendar to link? Add the times you are usually busy, like work or school. They show on the family calendar, and suggestions work around them. Your family sees the label you give.
      </p>

      {entries && entries.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{entry.label ?? "Busy"}</p>
                <p className="truncate text-xs text-muted-foreground">{describeEntry(entry)}{entry.onDate ? "" : " · every week"}</p>
              </div>
              <button type="button" aria-label={`Change ${entry.label ?? "busy time"}, ${describeEntry(entry)}`} onClick={() => startEditing(entry)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Pencil size={14} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Remove ${entry.label ?? "busy time"}, ${describeEntry(entry)}`} onClick={() => void remove(entry)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-alert/10 hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        // Not a <form>: this sits inside the profile form, and saves on its own.
        <div role="group" aria-label={editing === "new" ? "Add a busy time" : "Change a busy time"} className="mt-3 grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3.5 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">Label <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              autoFocus
              maxLength={60}
              placeholder="e.g. Work, School, Gym"
              value={draft.label ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (canSave) void save(); } }}
              className={fieldClassName}
            />
          </label>
          <div className="text-sm font-semibold sm:col-span-2">
            <span id="schedule-repeat-label">How often</span>
            <div role="radiogroup" aria-labelledby="schedule-repeat-label" className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/60 p-1">
              {[["Every week", true], ["One date", false]].map(([label, weekly]) => (
                <button
                  key={label as string}
                  type="button"
                  role="radio"
                  aria-checked={isWeekly === weekly}
                  onClick={() => setDraft((current) => ({ ...current, onDate: weekly ? null : current.onDate ?? getLocalDateInputValue() }))}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isWeekly === weekly ? "bg-card text-foreground shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground")}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>
          {isWeekly ? (
            <div className="text-sm font-semibold sm:col-span-2">
              <span id="schedule-days-label">On</span>
              <div role="group" aria-labelledby="schedule-days-label" className="mt-1.5 flex flex-wrap gap-1.5">
                {dayLetters.map((letter, day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={draft.weekdays.includes(day)}
                    aria-label={dayNames[day]}
                    onClick={() => toggleDay(day)}
                    className={cn("grid size-9 place-items-center rounded-full border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", draft.weekdays.includes(day) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
                  >
                    {letter}
                  </button>
                ))}
                <button type="button" onClick={() => setDraft((current) => ({ ...current, weekdays: [0, 1, 2, 3, 4] }))} className="rounded-full px-2.5 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Weekdays</button>
              </div>
            </div>
          ) : (
            <div className="text-sm font-semibold sm:col-span-2">
              <span id="schedule-date-label">Date</span>
              <DatePicker labelledBy="schedule-date-label" min={getLocalDateInputValue()} value={draft.onDate ?? getLocalDateInputValue()} onChange={(onDate) => setDraft((current) => ({ ...current, onDate }))} />
            </div>
          )}
          <div className="text-sm font-semibold">
            <span id="schedule-start-label">From</span>
            <TimePicker labelledBy="schedule-start-label" value={draft.startTime} onChange={(startTime) => setDraft((current) => ({ ...current, startTime }))} />
          </div>
          <div className="text-sm font-semibold">
            <span id="schedule-end-label">Until</span>
            <TimePicker labelledBy="schedule-end-label" value={draft.endTime} onChange={(endTime) => setDraft((current) => ({ ...current, endTime }))} />
          </div>
          {draft.endTime < draft.startTime && <p className="text-xs text-muted-foreground sm:col-span-2">Ends the next morning.</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!canSave} onClick={() => void save()}>{isSaving ? "Saving…" : editing === "new" ? "Add to my schedule" : "Save"}</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="mt-3" disabled={entries === null && !errorMessage} onClick={() => startEditing()}>
          <Plus size={14} aria-hidden="true" />Add a busy time
        </Button>
      )}
      {errorMessage && <p role="alert" className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
    </fieldset>
  );
}
