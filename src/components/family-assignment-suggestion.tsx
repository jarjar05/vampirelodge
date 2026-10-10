import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FamilyAvatar } from "@/components/family-avatar";
import type { CareTask, FamilyMember } from "@/types/care";
import { cn } from "@/lib/utils";

export type AssignmentRecommendation = {
  memberId: string;
  reason: string;
};

export type AssignmentRecommendationEngine = (
  members: readonly FamilyMember[],
  tasks: readonly CareTask[],
) => AssignmentRecommendation;

export function mockAssignmentRecommendation(
  members: readonly FamilyMember[],
  tasks: readonly CareTask[],
): AssignmentRecommendation {
  const workload = (member: FamilyMember) => tasks.filter(
    (task) => !task.complete && task.assigneeId === member.id,
  ).length;
  const availableMembers = members.filter((member) => member.availability === "Available");
  const candidates = availableMembers.length > 0 ? availableMembers : members;
  const suggestedMember = [...candidates].sort((first, second) => workload(first) - workload(second))[0];

  return {
    memberId: suggestedMember.id,
    reason: "Currently has the lightest workload.",
  };
}

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
  const recommendation = recommendationEngine(members, tasks);
  const suggestedMember = members.find((member) => member.id === recommendation.memberId) ?? members[0];
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
          {members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
              <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.role}</p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 pl-12 sm:w-auto sm:pl-0">
                <span className="text-xs text-muted-foreground">{activeTaskCount(member)} active {activeTaskCount(member) === 1 ? "task" : "tasks"}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-primary/5 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary"><Sparkles size={14} aria-hidden="true" />Suggested assignment</div>
          {suggestedMember && (
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
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
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