import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { careApi } from "@/api/care";
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
    <Card>
      <CardHeader className="items-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-extrabold text-primary"><Sparkles size={13} aria-hidden="true" />AI plan</span>
        <button
          type="button"
          aria-label="Refresh the summary"
          title="Refresh the summary"
          disabled={state.status === "loading"}
          onClick={() => { refreshClicks += 1; setRequest((current) => ({ ...current, refreshToken: refreshClicks })); }}
          className="refresh-button grid size-[34px] shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <RefreshCw size={15} className={state.status === "loading" ? "animate-spin" : undefined} aria-hidden="true" />
        </button>
      </CardHeader>
      <CardContent className="pt-2.5">
        <h2 className="font-display text-[23px] font-bold">Your order for today</h2>
        {state.status === "loading" && (
          <div role="status" className="mt-3 space-y-2.5">
            <p className="text-sm font-semibold text-muted-foreground">Looking over your tasks…</p>
            <span aria-hidden="true" className="block h-2.5 w-full animate-pulse rounded-full bg-primary/10" />
            <span aria-hidden="true" className="block h-2.5 w-2/3 animate-pulse rounded-full bg-primary/10" />
          </div>
        )}
        {state.status === "unavailable" && (
          <>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {state.message}{" "}
              <button type="button" onClick={() => setRequest((current) => ({ ...current, attempt: current.attempt + 1 }))} className="rounded font-extrabold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button>
            </p>
            {/* Without a plan, my tasks are still listed, soonest first. */}
            <ol className="stagger mt-4 space-y-3">
              {[...tasks].sort((first, second) => (first.dueAt ?? "9999").localeCompare(second.dueAt ?? "9999")).map((task, index) => (
                <PlanStep key={task.id} number={index + 1} task={task} />
              ))}
            </ol>
          </>
        )}
        {state.status === "ready" && (
          <>
            {state.plan.summary && <p className="mt-2 text-[15.5px] leading-relaxed text-muted-foreground">{state.plan.summary}</p>}
            {steps.length > 0 && (
              <ol aria-label="Suggested order" className="stagger mt-4 space-y-3">
                {steps.map(({ task, note }, index) => <PlanStep key={task.id} number={index + 1} task={task} note={note} />)}
              </ol>
            )}
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {state.status === "ready" && state.plan.generatedAt ? `A suggestion only · updated ${formatRelative(state.plan.generatedAt).toLowerCase()}` : ""}
          </p>
          <Link to="/tasks?filter=My%20Tasks" className="inline-flex items-center gap-1 rounded-md text-sm font-extrabold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            All my tasks<ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** One task in the suggested order: its number, title, when it is due, and why it sits there. */
function PlanStep({ number, task, note }: { number: number; task: CareTask; note?: string }) {
  const overdue = task.attention === "Overdue";
  return (
    <li className="flex gap-3.5 rounded-[18px] border border-border bg-muted px-4 py-3.5">
      <span aria-hidden="true" className="plan-step-number grid size-[34px] shrink-0 place-items-center rounded-xl font-display text-[15px] font-bold text-white">{number}</span>
      <div className="min-w-0">
        <p className="font-extrabold">{task.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className={overdue ? "font-extrabold text-alert" : undefined}>{task.time}</span>
          {note ? ` · ${note}` : ""}
        </p>
      </div>
    </li>
  );
}
