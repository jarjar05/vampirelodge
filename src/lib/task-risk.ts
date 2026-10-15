import { isAssignedTo, type CareTask, type FamilyMember } from "@/types/care";

export type TaskRiskTag = "Overdue" | "Unassigned" | "Due soon" | "Unavailable" | "Clash";

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
  /** Tasks whose assignee has a calendar event when the task is due. */
  conflictTaskIds?: ReadonlySet<string>,
) => TaskRiskAssessment;

export const taskRiskTagStyles: Record<TaskRiskTag, string> = {
  Overdue: "border-alert/30 bg-alert/10 text-alert",
  Unassigned: "border-warning/40 bg-warning/20 text-warning-foreground",
  "Due soon": "border-accent bg-accent/50 text-accent-foreground",
  Unavailable: "border-primary/25 bg-primary/10 text-primary",
  Clash: "border-alert/30 bg-alert/10 text-alert",
};

export function mockTaskRiskAssessment(
  task: CareTask,
  tasks: readonly CareTask[],
  members: readonly FamilyMember[],
  now: Date,
  conflictTaskIds: ReadonlySet<string> = new Set(),
): TaskRiskAssessment {
  if (task.complete) return { reasons: [], riskTags: [] };

  const reasons: TaskRiskReason[] = [];
  const deadline = task.dueAt ? new Date(task.dueAt) : undefined;
  const remainingMs = deadline ? deadline.getTime() - now.getTime() : undefined;
  const isUnassigned = task.assigneeIds.length === 0;
  const assignedMember = members.find((member) => member.id === task.assigneeId);

  if (remainingMs !== undefined && remainingMs < 0) reasons.push({ tag: "Overdue", label: "Overdue" });
  if (isUnassigned) reasons.push({ tag: "Unassigned", label: "No one is assigned yet" });
  if (isUnassigned && remainingMs !== undefined && remainingMs >= 0 && remainingMs <= 3 * 60 * 60_000) {
    reasons.push({ tag: "Due soon", label: "Due within 3 hours with no one assigned" });
  }
  if (assignedMember && conflictTaskIds.has(task.id)) reasons.push({ tag: "Clash", label: `${assignedMember.firstName} is busy at that time` });
  if (assignedMember?.availability === "Away today") reasons.push({ tag: "Unavailable", label: `${assignedMember.firstName} is unavailable today` });

  if (reasons.length === 0) return { reasons, riskTags: [] };

  const candidates = members.filter((member) => member.availability === "Available" && !isAssignedTo(task, member.id));
  const eveningCandidate = deadline && deadline.toDateString() === now.toDateString()
    ? candidates.find((member) => member.availabilityNote?.toLowerCase().includes("evening"))
    : undefined;
  const suggestedMember = eveningCandidate ?? [...candidates].sort((first, second) => {
    const activeTasks = (member: FamilyMember) => tasks.filter(
      (item) => !item.complete && isAssignedTo(item, member.id),
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
