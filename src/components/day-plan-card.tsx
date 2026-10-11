import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { careApi } from "@/api/care";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatRelative } from "@/lib/dates";
import type { CareTask, DayPlan } from "@/types/care";

// The latest request, shared by every mount of the card (React's development mode mounts twice),
// so returning to the overview does not ask again while my tasks are unchanged.
let latest: { signature: string; refreshToken: number; requestedAt: number; plan: Promise<DayPlan> } | null = null;
// After this long the server is asked again. It answers from its own saved plan unless something changed,
// which is how a new event on a linked calendar reaches a page that has stayed open.
const recheckAfterMs = 5 * 60_000;
const staleEvent = "day-plan-stale";

/** Call after something the plan depends on changes outside the task list, such as linking a calendar. */
export function markDayPlanStale() {
  latest = null;
  window.dispatchEvent(new Event(staleEvent));
}
// Each click on refresh takes the next number, so one click forces exactly one new request.
let refreshClicks = 0;

function requestPlan(signature: string, refreshToken: number) {
  const refresh = refreshToken > (latest?.refreshToken ?? 0);
  if (!latest || latest.signature !== signature || refresh || Date.now() - latest.requestedAt > recheckAfterMs) {
    const plan = careApi.planMyDay(refresh);
    latest = { signature, refreshToken: Math.max(refreshToken, latest?.refreshToken ?? 0), requestedAt: Date.now(), plan };
    // A failed request is forgotten so "Try again" asks afresh.
    plan.catch(() => { if (latest?.plan === plan) latest = null; });
  }
  return latest.plan;
}

type PlanState =
  | { status: "loading" }
  | { status: "ready"; plan: DayPlan }
  | { status: "unavailable"; message: string };

/** An AI summary of the signed-in person's open tasks, with a suggested order to do them in. */
export function DayPlanCard({ tasks }: { tasks: readonly CareTask[] }) {
  // Anything the plan depends on; a change here means the old plan is out of date.
  const signature = tasks
    .map((task) => [task.id, task.title, task.location ?? "", task.dueAt ?? "", task.priority, task.status].join("|"))
    .sort()
    .join("\n");
  const [state, setState] = useState<PlanState>({ status: "loading" });
  const [request, setRequest] = useState({ attempt: 0, refreshToken: 0 });

  useEffect(() => {
    let isCurrent = true;
    setState({ status: "loading" });
    requestPlan(signature, request.refreshToken)
      .then((plan) => { if (isCurrent) setState({ status: "ready", plan }); })
      .catch((error) => { if (isCurrent) setState({ status: "unavailable", message: error instanceof Error ? error.message : "The summary could not be loaded." }); });
    return () => { isCurrent = false; };
  }, [signature, request]);

  useEffect(() => {
    const reload = () => setRequest((current) => ({ ...current, attempt: current.attempt + 1 }));
    window.addEventListener(staleEvent, reload);
    return () => window.removeEventListener(staleEvent, reload);
  }, []);

  const steps = state.status === "ready"
    ? state.plan.steps.flatMap((step) => {
        const task = tasks.find((item) => item.id === step.taskId);
        return task ? [{ task, note: step.note }] : [];
      })
    : [];

  return (
    <Card className="border-primary/25">
      <CardHeader className="items-center">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Sparkles size={18} className="text-primary" aria-hidden="true" />Your plan</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline">AI summary</Badge>
          <button
            type="button"
            aria-label="Refresh the summary"
            title="Refresh the summary"
            disabled={state.status === "loading"}
            onClick={() => { refreshClicks += 1; setRequest((current) => ({ ...current, refreshToken: refreshClicks })); }}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RefreshCw size={15} className={state.status === "loading" ? "animate-spin" : undefined} aria-hidden="true" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {state.status === "loading" && (
          <div role="status" className="space-y-2.5 py-1">
            <p className="text-sm font-medium text-muted-foreground">Looking over your tasks…</p>
            <span aria-hidden="true" className="block h-2.5 w-full animate-pulse rounded-full bg-primary/10" />
            <span aria-hidden="true" className="block h-2.5 w-2/3 animate-pulse rounded-full bg-primary/10" />
          </div>
        )}
        {state.status === "unavailable" && (
          <p className="text-sm text-muted-foreground">
            {state.message}{" "}
            <button type="button" onClick={() => setRequest((current) => ({ ...current, attempt: current.attempt + 1 }))} className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button>
          </p>
        )}
        {state.status === "ready" && (
          <>
            {state.plan.summary && <p className="text-sm leading-relaxed">{state.plan.summary}</p>}
            {steps.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-primary">Suggested order</h3>
                <ol className="mt-2 space-y-3">
                  {steps.map(({ task, note }, index) => (
                    <li key={task.id} className="flex gap-3">
                      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="min-w-0 text-sm font-semibold">{task.title}</p>
                          <span className={`shrink-0 whitespace-nowrap text-xs font-medium ${task.attention === "Overdue" ? "text-alert" : "text-muted-foreground"}`}>{task.time}</span>
                        </div>
                        {note && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{note}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {state.plan.generatedAt && <p className="mt-4 text-xs text-muted-foreground">A suggestion only · updated {formatRelative(state.plan.generatedAt).toLowerCase()}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
