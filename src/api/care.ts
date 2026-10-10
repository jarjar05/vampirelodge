import { api } from "@/api/client";
import { formatClock, formatDay, formatDue, formatRelative, formatTimestamp } from "@/lib/dates";
import type {
  Availability,
  CareAppointment,
  CareTask,
  Family,
  FamilyActivityItem,
  FamilyMember,
  TaskActivity,
  TaskActivityAction,
} from "@/types/care";

// Shapes returned by the backend. Pages use the view types from @/types/care instead.
export type ApiFamily = { id: string; name: string; my_role: "ADMIN" | "MEMBER"; invite_code: string | null };

export type ApiMember = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: "ADMIN" | "MEMBER";
  relationship_label: string | null;
  availability: Availability;
  availability_note: string | null;
};

type ApiActivity = {
  id: string;
  action: TaskActivityAction;
  actor_id: string | null;
  actor_name: string;
  detail: string;
  created_at: string;
};

export type ApiTask = {
  id: string;
  title: string;
  detail: string;
  location: string | null;
  due_at: string | null;
  assignee_id: string | null;
  category: CareTask["category"];
  /** Older data may still hold the retired "Urgent" level. */
  priority: CareTask["priority"] | "Urgent";
  status: CareTask["status"];
  recipient: string;
  created_at: string;
  activity: ApiActivity[];
};

export type ApiAppointment = {
  id: string;
  title: string;
  place: string | null;
  starts_at: string;
  attendee_id: string | null;
  related_task_id: string | null;
};

export type ApiFamilyActivity = ApiActivity & { task_id: string; task_title: string };

export type NewTask = { title: string; detail: string; location?: string; dueAt: string; priority: CareTask["priority"] };
export type NewAppointment = { title: string; place?: string; startsAt: string; attendeeId: string | null };
export type MemberChanges = { relationshipLabel?: string | null; availability?: Availability; availabilityNote?: string | null };

export const careApi = {
  getFamily: () => api<ApiFamily>("/families/me"),
  createFamily: (name: string) => api("/families", { method: "POST", body: { name } }),
  joinFamily: (inviteCode: string) => api("/families/join", { method: "POST", body: { invite_code: inviteCode } }),
  renameFamily: (name: string) => api<ApiFamily>("/families/me", { method: "PATCH", body: { name } }),
  listMembers: () => api<ApiMember[]>("/families/me/members"),
  updateMember: (userId: string, changes: MemberChanges) => api<ApiMember>(`/families/me/members/${userId}`, {
    method: "PATCH",
    body: {
      ...(changes.relationshipLabel !== undefined && { relationship_label: changes.relationshipLabel }),
      ...(changes.availability !== undefined && { availability: changes.availability }),
      ...(changes.availabilityNote !== undefined && { availability_note: changes.availabilityNote }),
    },
  }),
  removeMember: (userId: string) => api(`/families/me/members/${userId}`, { method: "DELETE" }),

  listTasks: () => api<ApiTask[]>("/families/me/tasks"),
  createTask: (task: NewTask) => api<ApiTask>("/families/me/tasks", {
    method: "POST",
    body: { title: task.title, detail: task.detail, location: task.location || null, due_at: task.dueAt, priority: task.priority },
  }),
  assignTask: (taskId: string, assigneeId: string | null) => api<ApiTask>(`/families/me/tasks/${taskId}/assign`, {
    method: "POST",
    body: { assignee_id: assigneeId },
  }),
  taskAction: (taskId: string, action: "accept" | "decline" | "complete" | "reopen") =>
    api<ApiTask>(`/families/me/tasks/${taskId}/${action}`, { method: "POST" }),
  listActivity: () => api<ApiFamilyActivity[]>("/families/me/activity?limit=20"),

  listAppointments: () => api<ApiAppointment[]>("/families/me/appointments"),
  createAppointment: (appointment: NewAppointment) => api<ApiAppointment>("/families/me/appointments", {
    method: "POST",
    body: { title: appointment.title, place: appointment.place || null, starts_at: appointment.startsAt, attendee_id: appointment.attendeeId },
  }),
  deleteAppointment: (appointmentId: string) => api(`/families/me/appointments/${appointmentId}`, { method: "DELETE" }),
};

const tones: FamilyMember["tone"][] = ["sage", "coral", "gold"];

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase() || "?";
}

export function toFamily(family: ApiFamily): Family {
  return { id: family.id, name: family.name, myRole: family.my_role, inviteCode: family.invite_code };
}

export function toMember(member: ApiMember, index: number): FamilyMember {
  return {
    id: member.id,
    name: member.name,
    firstName: member.name.trim().split(/\s+/)[0] || member.name,
    email: member.email,
    accessRole: member.role,
    role: member.relationship_label ?? "Family member",
    relationshipLabel: member.relationship_label,
    initials: initialsFor(member.name),
    avatarUrl: member.avatar_url ?? undefined,
    availability: member.availability,
    availabilityNote: member.availability_note ?? undefined,
    tone: tones[index % tones.length],
  };
}

function toActivity(activity: ApiActivity): TaskActivity {
  return {
    id: activity.id,
    action: activity.action,
    actorId: activity.actor_id,
    actor: activity.actor_name,
    detail: activity.detail,
    time: formatTimestamp(activity.created_at),
  };
}

export function toTask(task: ApiTask, membersById: ReadonlyMap<string, FamilyMember>, now = new Date()): CareTask {
  const assignee = task.assignee_id ? membersById.get(task.assignee_id) : undefined;
  const complete = task.status === "Completed";
  const overdue = !complete && task.due_at !== null && new Date(task.due_at).getTime() < now.getTime();
  return {
    id: task.id,
    title: task.title,
    detail: task.detail,
    location: task.location ?? undefined,
    time: formatDue(task.due_at),
    dueAt: task.due_at ?? undefined,
    createdAt: task.created_at,
    assigneeId: task.assignee_id,
    owner: assignee?.firstName ?? "Unassigned",
    initials: assignee?.initials.slice(0, 1) ?? "?",
    category: task.category,
    complete,
    attention: complete ? undefined : task.assignee_id === null ? "Unassigned" : overdue ? "Overdue" : undefined,
    recipient: task.recipient,
    priority: task.priority === "Urgent" ? "High" : task.priority,
    status: task.status,
    activity: task.activity.map(toActivity),
  };
}

export function toAppointment(
  appointment: ApiAppointment,
  membersById: ReadonlyMap<string, FamilyMember>,
  taskTitlesById: ReadonlyMap<string, string>,
): CareAppointment {
  const startsAt = new Date(appointment.starts_at);
  return {
    id: appointment.id,
    title: appointment.title,
    place: appointment.place ?? undefined,
    startsAt: appointment.starts_at,
    date: formatDay(startsAt),
    time: formatClock(startsAt),
    attendeeId: appointment.attendee_id,
    person: appointment.attendee_id ? membersById.get(appointment.attendee_id)?.firstName : undefined,
    relatedTask: appointment.related_task_id ? taskTitlesById.get(appointment.related_task_id) : undefined,
  };
}

const activityVerbs: Record<TaskActivityAction, string> = {
  Created: "added",
  Assigned: "updated who is handling",
  Reassigned: "reassigned",
  Accepted: "accepted",
  Declined: "declined",
  Completed: "completed",
  Reopened: "reopened",
};

export function toFamilyActivity(activity: ApiFamilyActivity, membersById: ReadonlyMap<string, FamilyMember>): FamilyActivityItem {
  return {
    id: activity.id,
    actorId: activity.actor_id,
    person: (activity.actor_id && membersById.get(activity.actor_id)?.firstName) || activity.actor_name,
    action: activityVerbs[activity.action],
    subject: activity.task_title,
    time: formatRelative(activity.created_at),
  };
}
