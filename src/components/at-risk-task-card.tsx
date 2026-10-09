import { useState } from "react";
import { ArrowRight, Clock3, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { familyMembers, type CareTask, type FamilyMember } from "@/data/care-tasks";

export type TaskRiskTag = "Overdue" | "No confirmation" | "Due soon" | "Unavailable";

export type TaskRiskReason = {
  tag: TaskRiskTag;
  label: string;
};

export type TaskRiskAssessment = {
  reasons: TaskRiskReason[];
  riskTags: TaskRiskTag[];
  suggestedMember?: FamilyMember;
  suggestion?: string;
};

export type TaskRiskEngine = (
  task: CareTask,
  tasks: readonly CareTask[],
  members: readonly FamilyMember[],
  now: Date,
) => TaskRiskAssessment;

export const taskRiskTagStyles: Record<TaskRiskTag, string> = {
  Overdue: "border-alert/30 bg-alert/10 text-alert",
  "No confirmation": "border-warning/40 bg-warning/20 text-warning-foreground",
  "Due soon": "border-accent bg-accent/50 text-accent-foreground",
  Unavailable: "border-primary/25 bg-primary/10 text-primary",
};

export function mockTaskRiskAssessment(
  task: CareTask,
  tasks: readonly CareTask[],
  members: readonly FamilyMember[],
  now: Date,
): TaskRiskAssessment {
  if (task.complete) return { reasons: [], riskTags: [] };

  const reasons: TaskRiskReason[] = [];
  const deadline = task.dueAt ? new Date(task.dueAt) : undefined;
  const remainingMs = deadline ? deadline.getTime() - now.getTime() : undefined;
  const accepted = task.status === "In progress";
  const assignedMember = members.find((member) => member.name.split(" ")[0] === task.owner);

  if (remainingMs !== undefined && remainingMs < 0) reasons.push({ tag: "Overdue", label: "Overdue" });
  if (!accepted) reasons.push({
    tag: "No confirmation",
    label: task.owner === "Unassigned" ? "No one assigned or confirmed yet" : "No confirmation yet",
  });
  if (!accepted && remainingMs !== undefined && remainingMs >= 0 && remainingMs <= 3 * 60 * 60_000) {
    reasons.push({ tag: "Due soon", label: "Due soon without confirmation" });
  }
  if (assignedMember?.availability === "Away today") reasons.push({ tag: "Unavailable", label: `${assignedMember.name.split(" ")[0]} is unavailable today` });

  if (reasons.length === 0) return { reasons, riskTags: [] };

  const candidates = members.filter((member) => member.availability === "Available" && member.name.split(" ")[0] !== task.owner);
  const eveningCandidate = deadline && deadline.toDateString() === now.toDateString()
    ? candidates.find((member) => member.availabilityNote?.toLowerCase().includes("evening"))
    : undefined;
  const suggestedMember = eveningCandidate ?? [...candidates].sort((first, second) => {
    const activeTasks = (member: FamilyMember) => tasks.filter(
      (item) => !item.complete && item.owner === member.name.split(" ")[0],
    ).length;
    return activeTasks(first) - activeTasks(second);
  })[0];

  return {
    reasons,
    riskTags: [...new Set(reasons.map((reason) => reason.tag))],
    suggestedMember,
    suggestion: suggestedMember
      ? "Recommended based on current workload."
      : "No suggested family member.",
  };
}

export function AtRiskTaskCard({
  task,
  tasks,
  members = familyMembers,
  riskEngine = mockTaskRiskAssessment,
  onReassign,
  onOpen,
}: {
  task: CareTask;
  tasks: readonly CareTask[];
  members?: readonly FamilyMember[];
  riskEngine?: TaskRiskEngine;
  onReassign: (owner: string) => void;
  onOpen: () => void;
}) {
  const [selectedMemberName, setSelectedMemberName] = useState("");
  const assessment = riskEngine(task, tasks, members, new Date());
  const assignedMember = members.find((member) => member.name.split(" ")[0] === task.owner);
  const selectedMember = selectedMemberName || assessment.suggestedMember?.name.split(" ")[0] || "";

  return (
    <article className="grid gap-3 bg-card px-4 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(225px,1.35fr)_minmax(145px,1fr)_minmax(100px,0.8fr)_100px] xl:items-center xl:px-5">
      <div className="min-w-0">
        <button type="button" onClick={onOpen} className="text-left text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{task.title}</button>
        <p className="mt-1 truncate text-xs text-muted-foreground">For {task.recipient} · {task.detail}</p>
        {task.location && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} aria-hidden="true" />{task.location}</p>}
        <Button size="sm" variant="ghost" className="mt-1 h-7 px-0 text-xs text-primary" onClick={onOpen}>View details</Button>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Assigned to</p>
        <p className="mt-0.5 text-sm font-semibold">{assignedMember?.name.split(" ")[0] ?? "Unassigned"}</p>
        {assessment.suggestedMember && (
          <div className="mt-1.5">
            <p className="flex min-w-0 items-center gap-1.5 rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary">
              <Sparkles size={13} className="shrink-0" aria-hidden="true" />
              <span className="shrink-0 font-semibold">Suggested: {assessment.suggestedMember.name.split(" ")[0]}</span>
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <label className="sr-only" htmlFor={`risk-assignment-${task.id}`}>Choose assignee for {task.title}</label>
              <select
                id={`risk-assignment-${task.id}`}
                aria-label={`Choose assignee for ${task.title}`}
                value={selectedMember}
                onChange={(event) => setSelectedMemberName(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {members.filter((member) => member.name.split(" ")[0] !== task.owner).map((member) => <option key={member.name} value={member.name.split(" ")[0]}>{member.name}</option>)}
              </select>
              <Button size="sm" className="h-8 shrink-0 px-2.5 text-xs" aria-label={`${task.owner === "Unassigned" ? "Assign" : "Reassign"} ${task.title} to ${selectedMember}`} disabled={!selectedMember} onClick={() => { onReassign(selectedMember); setSelectedMemberName(""); }}>
                {task.owner === "Unassigned" ? "Assign" : "Reassign"} <ArrowRight size={13} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="text-sm">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">Due</span>
        <span className="inline-flex items-center gap-1.5 text-foreground/80"><Clock3 size={14} aria-hidden="true" />{task.time}</span>
      </div>

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">Priority</span>
        <Badge variant={task.priority === "Urgent" ? "warning" : task.priority === "High" ? "default" : task.priority === "Normal" ? "secondary" : "outline"}>{task.priority}</Badge>
        <ul className="mt-1.5 flex max-w-48 flex-wrap gap-1" aria-label={`Risk tags for ${task.title}`}>
          {assessment.reasons.filter((reason) => reason.tag !== "Unavailable").map((reason) => <li key={`${reason.tag}-${reason.label}`}><Badge title={reason.label} className={`${taskRiskTagStyles[reason.tag]} text-[10px]`} variant="outline">{reason.tag}</Badge></li>)}
        </ul>
      </div>

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">Status</span>
        <Badge variant={task.status === "In progress" ? "default" : task.status === "At risk" ? "warning" : "outline"}>{task.status}</Badge>
      </div>
    </article>
  );
}