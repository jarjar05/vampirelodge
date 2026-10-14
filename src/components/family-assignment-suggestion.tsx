import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { careApi } from "@/api/care";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FamilyAvatar } from "@/components/family-avatar";
import type { AssignmentSuggestion, CareTask, FamilyMember } from "@/types/care";
import { cn } from "@/lib/utils";

export type AssignmentRecommendation = {
  memberId: string;
  reason: string;
};

export type AssignmentRecommendationEngine = (
  members: readonly FamilyMember[],
  tasks: readonly CareTask[],
  /** Members who have something else on when the task is due. */
  busyMemberIds?: ReadonlySet<string>,
) => AssignmentRecommendation;

export function mockAssignmentRecommendation(
  members: readonly FamilyMember[],
  tasks: readonly CareTask[],
  busyMemberIds: ReadonlySet<string> = new Set(),
): AssignmentRecommendation {
  const workload = (member: FamilyMember) => tasks.filter(
    (task) => !task.complete && task.assigneeId === member.id,
  ).length;
  // People who are busy at the task's time are left out, unless that leaves nobody.
  const freeMembers = members.filter((member) => !busyMemberIds.has(member.id));
  const pool = freeMembers.length > 0 ? freeMembers : members;
  const availableMembers = pool.filter((member) => member.availability === "Available");
  const candidates = availableMembers.length > 0 ? availableMembers : pool;
  const suggestedMember = [...candidates].sort((first, second) => workload(first) - workload(second))[0];
  const skippedSomeone = freeMembers.length > 0 && freeMembers.length < members.length;

  return {
    memberId: suggestedMember.id,
    reason: freeMembers.length === 0
      ? "Everyone has something on at that time; this person has the lightest workload."
      : skippedSomeone
        ? "Free at that time, with the lightest workload."
        : "Currently has the lightest workload.",
  };
}

// One request per task, shared by every mount of the card (React's development mode mounts twice).
const aiSuggestions = new Map<string, Promise<AssignmentSuggestion>>();

function requestAiSuggestion(taskId: string) {
  let pending = aiSuggestions.get(taskId);
  if (!pending) {
    pending = careApi.suggestAssignee(taskId);
    aiSuggestions.set(taskId, pending);
    // A failed request is forgotten so "Try again" asks afresh.
    pending.catch(() => aiSuggestions.delete(taskId));
  }
  return pending;
}

type AiState =
  | { status: "loading" }
  | { status: "ready"; suggestion: AssignmentSuggestion }
  | { status: "unavailable"; message: string };

export function FamilyAssignmentSuggestion({
  task,
  tasks,
  members,
  recommendationEngine = mockAssignmentRecommendation,
  onAssign,
  className,
}: {
  task: CareTask;
  tasks: readonly CareTask[];
  members: readonly FamilyMember[];
  recommendationEngine?: AssignmentRecommendationEngine;
  onAssign: (memberId: string) => void;
  className?: string;
}) {
  const [choosingAnother, setChoosingAnother] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [ai, setAi] = useState<AiState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Who is busy when the task is due, from linked calendars. This check is free: it makes no AI call.
  const [busyMemberIds, setBusyMemberIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let isCurrent = true;
    careApi.busyMembersForTask(task.id)
      .then((ids) => { if (isCurrent) setBusyMemberIds(new Set(ids)); })
      // Without it the suggestion falls back to workload alone.
      .catch(() => {});
    return () => { isCurrent = false; };
  }, [task.id]);

  useEffect(() => {
    let isCurrent = true;
    setAi({ status: "loading" });
    requestAiSuggestion(task.id)
      .then((suggestion) => { if (isCurrent) setAi({ status: "ready", suggestion }); })
      .catch((error) => { if (isCurrent) setAi({ status: "unavailable", message: error instanceof Error ? error.message : "The AI suggestion could not be loaded." }); });
    return () => { isCurrent = false; };
  }, [task.id, attempt]);

  // The schedule-and-workload rule is the fallback whenever the model cannot answer.
  const ruleBased = recommendationEngine(members, tasks, busyMemberIds);
  const aiMember = ai.status === "ready" ? members.find((member) => member.id === ai.suggestion.memberId) : undefined;
  const recommendation = aiMember && ai.status === "ready" ? { memberId: aiMember.id, reason: ai.suggestion.reason } : ruleBased;
  const suggestedMember = members.find((member) => member.id === recommendation.memberId) ?? members[0];
  const noteTitles = aiMember && ai.status === "ready" ? ai.suggestion.noteTitles : [];
  const activeTaskCount = (member: FamilyMember) => tasks.filter(
    (item) => !item.complete && item.assigneeId === member.id,
  ).length;

  return (
    <Card className={cn("border-primary/25", className)}>
      <CardHeader>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">New task · {task.title}</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Who should handle this?</h2>
        </div>
        <Badge variant="outline">Recommendation only</Badge>
      </CardHeader>
      <CardContent className="space-y-5 pt-2">
        <div className="divide-y divide-border rounded-lg border border-border">
          {members.map((member) => {
            const isBusy = busyMemberIds.has(member.id);
            return (
              // Someone busy when the task is due is greyed out; the words say why for anyone who cannot see the fade.
              <div key={member.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4", isBusy && "bg-muted/50")}>
                <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className={cn(isBusy && "opacity-40 grayscale")} />
                <div className={cn("min-w-0 flex-1", isBusy && "opacity-50")}>
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 pl-12 sm:w-auto sm:pl-0">
                  <span className="text-xs text-muted-foreground">
                    {isBusy ? "Busy at that time" : `${activeTaskCount(member)} active ${activeTaskCount(member) === 1 ? "task" : "tasks"}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary"><Sparkles size={14} aria-hidden="true" />Suggested assignment</div>
            {ai.status !== "loading" && <Badge variant={aiMember ? "default" : "outline"}>{aiMember ? "AI suggestion" : busyMemberIds.size > 0 ? "Based on schedule and workload" : "Based on workload"}</Badge>}
          </div>
          {ai.status === "loading" && (
            <div role="status" className="mt-3 flex items-center gap-3">
              <span aria-hidden="true" className="size-11 shrink-0 animate-pulse rounded-full bg-primary/15" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Working out who fits best…</p>
                <span aria-hidden="true" className="block h-2.5 w-2/3 animate-pulse rounded-full bg-primary/10" />
              </div>
            </div>
          )}
          {ai.status !== "loading" && suggestedMember && (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FamilyAvatar initials={suggestedMember.initials} tone={suggestedMember.tone} imageUrl={suggestedMember.avatarUrl} className="size-11" />
                <div className="min-w-0">
                  <p className="text-base font-semibold">{suggestedMember.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{recommendation.reason}</p>
                </div>
              </div>
              <Button className="shrink-0" onClick={() => onAssign(suggestedMember.id)}>
                Assign to {suggestedMember.firstName} <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          )}
          {noteTitles.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Notes considered: {noteTitles.join(", ")}</p>}
          {ai.status === "unavailable" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {ai.message}{" "}
              <button type="button" onClick={() => setAttempt((current) => current + 1)} className="rounded font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button>
            </p>
          )}
          <div className="mt-3 border-t border-primary/10 pt-3">
            {!choosingAnother ? (
              <Button variant="outline" size="sm" onClick={() => setChoosingAnother(true)}>Choose someone else</Button>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor={`assignment-choice-${task.id}`}>Choose a family member</label>
                <select
                  id={`assignment-choice-${task.id}`}
                  value={selectedMember}
                  onChange={(event) => setSelectedMember(event.target.value)}
                  className="min-h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a family member</option>
                  {members.map((member) => {
                    // Busy members cannot be picked here, unless everyone is busy.
                    const isBusy = busyMemberIds.has(member.id) && busyMemberIds.size < members.length;
                    return <option key={member.id} value={member.id} disabled={isBusy}>{member.name}{isBusy ? " (busy at that time)" : ""}</option>;
                  })}
                </select>
                <Button size="sm" disabled={!selectedMember} onClick={() => onAssign(selectedMember)}>Assign selected member</Button>
                <Button size="sm" variant="ghost" onClick={() => setChoosingAnother(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}