import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { careApi } from "@/api/care";
import { markDayPlanStale } from "@/components/day-plan-card";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/dates";
import type { CalendarStatus } from "@/types/care";

const fieldClassName = "min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";

/** Lets the signed-in person link their own calendar by its sharing link. Saves straight away, separately from the profile form. */
export function CalendarLink() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    careApi.calendarStatus()
      .then((result) => { if (isCurrent) setStatus(result); })
      .catch((error) => { if (isCurrent) setErrorMessage(error instanceof Error ? error.message : "Your calendar settings could not be loaded."); });
    return () => { isCurrent = false; };
  }, []);

  const run = async (action: () => Promise<CalendarStatus>) => {
    setBusy(true);
    setErrorMessage("");
    try {
      setStatus(await action());
      setUrl("");
      markDayPlanStale();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const connect = () => { if (url.trim()) void run(() => careApi.linkCalendar(url.trim())); };

  return (
    <fieldset className="mt-6 border-t border-border pt-5">
      <legend className="float-left mb-1 flex w-full items-center gap-2 text-sm font-semibold"><CalendarDays size={15} aria-hidden="true" />Calendar</legend>
      <p className="clear-both text-xs leading-relaxed text-muted-foreground">
        Link your own calendar so AI suggestions can work around the times you are busy. Only when you are busy is used, never what the events are.
      </p>

      {status?.connected ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-3">
          <p className="text-sm font-medium">Calendar linked</p>
          <p role="status" className={`mt-0.5 text-xs ${status.error ? "text-alert" : "text-muted-foreground"}`}>
            {status.error
              ? status.error
              : `${status.eventCount ?? 0} busy ${status.eventCount === 1 ? "time" : "times"} in the next 30 days${status.syncedAt ? ` · checked ${formatRelative(status.syncedAt).toLowerCase()}` : ""}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(careApi.syncCalendar)}>{busy ? "Working…" : "Sync now"}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(careApi.unlinkCalendar)}>Unlink</Button>
          </div>
        </div>
      ) : (
        <>
          <label className="mt-3 block text-sm font-medium" htmlFor="calendar-link-url">Calendar sharing link</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id="calendar-link-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={2000}
              placeholder="webcal://…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              // Enter links the calendar instead of submitting the whole profile form.
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); connect(); } }}
              className={fieldClassName}
            />
            <Button type="button" variant="outline" disabled={busy || !url.trim()} onClick={connect}>{busy ? "Checking…" : "Link calendar"}</Button>
          </div>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-primary">Where do I find the link?</summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
              <li><span className="font-semibold">Apple Calendar:</span> open the calendar’s sharing settings, turn on Public Calendar, then copy the link.</li>
              <li><span className="font-semibold">Google Calendar:</span> Settings → your calendar → Integrate calendar → Secret address in iCal format.</li>
              <li><span className="font-semibold">Outlook:</span> Settings → Calendar → Shared calendars → Publish a calendar → ICS link.</li>
            </ul>
            <p className="mt-2 leading-relaxed">Anyone who has this link can read that calendar, so share it only here. It is stored on the server and never shown again, to you or your family.</p>
          </details>
        </>
      )}
      {errorMessage && <p role="alert" className="mt-2 text-xs text-alert">{errorMessage}</p>}
    </fieldset>
  );
}
