import type { CareTask, FamilyMember } from "@/types/care";

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
  const assignedMember = members.find((member) => member.id === task.assigneeId);

  if (remainingMs !== undefined && remainingMs < 0) reasons.push({ tag: "Overdue", label: "Overdue" });
  if (!accepted) reasons.push({
    tag: "No confirmation",
    label: task.assigneeId === null ? "No one assigned or confirmed yet" : "No confirmation yet",
  });
  if (!accepted && remainingMs !== undefined && remainingMs >= 0 && remainingMs <= 3 * 60 * 60_000) {
    reasons.push({ tag: "Due soon", label: "Due soon without confirmation" });
  }
  if (assignedMember?.availability === "Away today") reasons.push({ tag: "Unavailable", label: `${assignedMember.firstName} is unavailable today` });

  if (reasons.length === 0) return { reasons, riskTags: [] };

  const candidates = members.filter((member) => member.availability === "Available" && member.id !== task.assigneeId);
  const eveningCandidate = deadline && deadline.toDateString() === now.toDateString()
    ? candidates.find((member) => member.availabilityNote?.toLowerCase().includes("evening"))
    : undefined;
  const suggestedMember = eveningCandidate ?? [...candidates].sort((first, second) => {
    const activeTasks = (member: FamilyMember) => tasks.filter(
      (item) => !item.complete && item.assigneeId === member.id,
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
