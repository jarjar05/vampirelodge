import { api } from "@/api/client";
import { formatDue, formatRelative, formatTimestamp } from "@/lib/dates";
import type {
  AssignmentSuggestion,
  CalendarStatus,
  DayPlan,
  DocumentDrafts,
  FamilySchedule,
  QuickSuggestion,
  TaskRecurrence,
  Availability,
  CareTask,
  Family,
  FamilyActivityItem,
  FamilyMember,
  KnowledgeDocument,
  KnowledgeSearchResult,
  TaskActivity,
  TaskActivityAction,
  TelegramStatus,
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
  /** Older data may still hold the retired "Urgent" level. */
  priority: CareTask["priority"] | "Urgent";
  status: CareTask["status"];
  created_at: string;
  completed_at: string | null;
  recurrence: TaskRecurrence | null;
  activity: ApiActivity[];
};

export type ApiFamilyActivity = ApiActivity & { task_id: string; task_title: string };

type ApiKnowledgeDocument = {
  id: string;
  title: string;
  category: string;
  content: string;
  chunk_count: number;
  created_by_name: string | null;
  created_at: string;
};

type ApiKnowledgeSearchResult = { id: string; document_id: string; title: string; content: string };

export type NewKnowledgeDocument = { title: string; category: string; content: string };

function toKnowledgeDocument(document: ApiKnowledgeDocument): KnowledgeDocument {
  return {
    id: document.id,
    title: document.title,
    category: document.category,
    content: document.content,
    chunkCount: document.chunk_count,
    addedBy: document.created_by_name ?? undefined,
    addedAt: formatTimestamp(document.created_at),
  };
}

export type NewTask = { title: string; detail: string; location?: string; dueAt: string; priority: CareTask["priority"]; recurrence?: TaskRecurrence | null };
/** Changes to a task's details. A null due time or location clears it. */
export type TaskChanges = { title: string; detail: string; location: string | null; dueAt: string | null; priority: CareTask["priority"]; recurrence: TaskRecurrence | null };
export type MemberChanges = { relationshipLabel?: string | null; availability?: Availability; availabilityNote?: string | null; role?: "ADMIN" | "MEMBER" };

type ApiCalendarStatus = { connected: boolean; synced_at: string | null; event_count: number | null; error: string | null };

function toCalendarStatus(status: ApiCalendarStatus): CalendarStatus {
  return { connected: status.connected, syncedAt: status.synced_at, eventCount: status.event_count, error: status.error };
}

/** The browser's time zone name, e.g. "Asia/Singapore", so the AI is given times as the person sees them. */
function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export type AskTurn = { role: "user" | "assistant"; text: string };
export type AskAnswer = { text: string; taskIds: string[]; noteTitles: string[] };

export const careApi = {
  getFamily: () => api<ApiFamily>("/families/me"),
  createFamily: (name: string) => api("/families", { method: "POST", body: { name } }),
  joinFamily: (inviteCode: string) => api("/families/join", { method: "POST", body: { invite_code: inviteCode } }),
  /** Deletes the family and everything stored for it. The name must be typed to confirm. */
  deleteFamily: (confirmName: string) => api("/families/me", { method: "DELETE", body: { confirm_name: confirmName } }),
  renameFamily: (name: string) => api<ApiFamily>("/families/me", { method: "PATCH", body: { name } }),
  listMembers: () => api<ApiMember[]>("/families/me/members"),
  updateMember: (userId: string, changes: MemberChanges) => api<ApiMember>(`/families/me/members/${userId}`, {
    method: "PATCH",
    body: {
      ...(changes.relationshipLabel !== undefined && { relationship_label: changes.relationshipLabel }),
      ...(changes.availability !== undefined && { availability: changes.availability }),
      ...(changes.availabilityNote !== undefined && { availability_note: changes.availabilityNote }),
      ...(changes.role !== undefined && { role: changes.role }),
    },
  }),
  removeMember: (userId: string) => api(`/families/me/members/${userId}`, { method: "DELETE" }),

  listTasks: () => api<ApiTask[]>("/families/me/tasks"),
  createTask: (task: NewTask) => api<ApiTask>("/families/me/tasks", {
    method: "POST",
    body: { title: task.title, detail: task.detail, location: task.location || null, due_at: task.dueAt, priority: task.priority, recurrence: task.recurrence ?? null },
  }),
  assignTask: (taskId: string, assigneeId: string | null) => api<ApiTask>(`/families/me/tasks/${taskId}/assign`, {
    method: "POST",
    body: { assignee_id: assigneeId },
  }),
  taskAction: (taskId: string, action: "complete" | "reopen") =>
    api<ApiTask>(`/families/me/tasks/${taskId}/${action}`, { method: "POST" }),
  updateTask: (taskId: string, changes: TaskChanges) => api<ApiTask>(`/families/me/tasks/${taskId}`, {
    method: "PATCH",
    body: { title: changes.title, detail: changes.detail, location: changes.location, due_at: changes.dueAt, priority: changes.priority, recurrence: changes.recurrence },
  }),
  deleteTask: (taskId: string) => api(`/families/me/tasks/${taskId}`, { method: "DELETE" }),
  /** Ids of open tasks whose assignee is busy when the task is due. No AI call is made. */
  listTaskConflicts: async (): Promise<string[]> =>
    (await api<{ task_ids: string[] }>(`/families/me/tasks/conflicts?timezone=${encodeURIComponent(localTimeZone())}`)).task_ids,
  /** Who should take the task by plain rules: free then, best placed by role, fewest open tasks. No AI call is made. */
  quickSuggestion: async (taskId: string): Promise<QuickSuggestion> => {
    const suggestion = await api<{ member_id: string | null; reason: string; busy_member_ids: string[] }>(`/families/me/tasks/${taskId}/quick-suggestion?timezone=${encodeURIComponent(localTimeZone())}`);
    return { memberId: suggestion.member_id, reason: suggestion.reason, busyMemberIds: suggestion.busy_member_ids };
  },
  stopRepeating: (taskId: string) => api<ApiTask>(`/families/me/tasks/${taskId}/stop-repeating`, { method: "POST" }),
  listActivity: () => api<ApiFamilyActivity[]>("/families/me/activity?limit=20"),
  /** Reads an uploaded file or pasted text and drafts tasks from it. Nothing is created. */
  draftTasksFromDocument: async (source: { filename: string; contentType: string; dataBase64: string } | { text: string }): Promise<DocumentDrafts> => {
    const drafts = await api<{ summary: string; tasks: { title: string; detail: string; location: string | null; due_date: string | null; due_time: string | null; priority: "High" | "Normal" | "Low"; recurrence: TaskRecurrence | null }[] }>("/families/me/tasks/from-document", {
      method: "POST",
      body: "text" in source
        ? { text: source.text, timezone: localTimeZone() }
        : { filename: source.filename, content_type: source.contentType, data_base64: source.dataBase64, timezone: localTimeZone() },
    });
    return {
      summary: drafts.summary,
      tasks: drafts.tasks.map((task) => ({ title: task.title, detail: task.detail, location: task.location, dueDate: task.due_date, dueTime: task.due_time?.slice(0, 5) ?? null, priority: task.priority, recurrence: task.recurrence })),
    };
  },
  /** Ids of members with a calendar event within an hour of the task's due time. No AI call is made. */
  busyMembersForTask: async (taskId: string): Promise<string[]> =>
    (await api<{ busy_member_ids: string[] }>(`/families/me/tasks/${taskId}/availability?timezone=${encodeURIComponent(localTimeZone())}`)).busy_member_ids,
  /** Asks the language model who should take the task. Rejects when AI is not set up or the call fails. */
  suggestAssignee: async (taskId: string): Promise<AssignmentSuggestion> => {
    const suggestion = await api<{ member_id: string; reason: string; note_titles: string[] }>(`/families/me/tasks/${taskId}/suggestion?timezone=${encodeURIComponent(localTimeZone())}`, { method: "POST" });
    return { memberId: suggestion.member_id, reason: suggestion.reason, noteTitles: suggestion.note_titles };
  },
  /** Summarises my open tasks and suggests an order. The server reuses its last answer until my tasks change. */
  /** Ask the family assistant a question. `history` is the conversation so far, oldest first. */
  ask: async (question: string, history: AskTurn[]): Promise<AskAnswer> => {
    const answer = await api<{ answer: string; task_ids: string[]; note_titles: string[] }>("/families/me/ask", {
      method: "POST",
      body: { question, history, timezone: localTimeZone() },
    });
    return { text: answer.answer, taskIds: answer.task_ids, noteTitles: answer.note_titles };
  },
  planMyDay: async (refresh = false): Promise<DayPlan> => {
    const plan = await api<{ summary: string | null; steps: { task_id: string; note: string }[]; generated_at: string | null }>("/families/me/day-plan", {
      method: "POST",
      body: { timezone: localTimeZone(), refresh },
    });
    return { summary: plan.summary, steps: plan.steps.map((step) => ({ taskId: step.task_id, note: step.note })), generatedAt: plan.generated_at };
  },

  calendarStatus: async () => toCalendarStatus(await api<ApiCalendarStatus>("/calendar")),
  /** Rejects with a readable message when the link cannot be read as a calendar. */
  linkCalendar: async (url: string) => toCalendarStatus(await api<ApiCalendarStatus>("/calendar", { method: "PUT", body: { url } })),
  syncCalendar: async () => toCalendarStatus(await api<ApiCalendarStatus>("/calendar/sync", { method: "POST" })),
  unlinkCalendar: async (): Promise<CalendarStatus> => {
    await api("/calendar", { method: "DELETE" });
    return { connected: false, syncedAt: null, eventCount: null, error: null };
  },

  telegramStatus: async (): Promise<TelegramStatus> => {
    const status = await api<{ configured: boolean; linked: boolean; telegram_username: string | null }>("/telegram");
    return { configured: status.configured, linked: status.linked, telegramUsername: status.telegram_username };
  },
  /** Returns a one-time address that opens the bot in Telegram; pressing Start there completes the link. */
  startTelegramLink: async () => (await api<{ url: string }>("/telegram/link", { method: "POST", body: { timezone: localTimeZone() } })).url,
  unlinkTelegram: () => api("/telegram", { method: "DELETE" }),

  listKnowledge: async () => (await api<ApiKnowledgeDocument[]>("/families/me/knowledge")).map(toKnowledgeDocument),
  addKnowledge: async (document: NewKnowledgeDocument) =>
    toKnowledgeDocument(await api<ApiKnowledgeDocument>("/families/me/knowledge", { method: "POST", body: document })),
  deleteKnowledge: (documentId: string) => api(`/families/me/knowledge/${documentId}`, { method: "DELETE" }),
  searchKnowledge: async (query: string): Promise<KnowledgeSearchResult[]> =>
    (await api<ApiKnowledgeSearchResult[]>(`/families/me/knowledge/search?limit=5&query=${encodeURIComponent(query)}`))
      .map((result) => ({ id: result.id, documentId: result.document_id, title: result.title, content: result.content })),

  getSchedule: async (start: string, days: number): Promise<FamilySchedule> => {
    type ApiItem = { kind: "busy" | "task"; start: string; end: string | null; all_day: boolean; title: string | null; id: string | null };
    const schedule = await api<{ start: string; days: number; members: { member_id: string; linked_calendar: boolean; calendar_ok: boolean; items: ApiItem[] }[] }>(
      `/families/me/schedule?start=${start}&days=${days}&timezone=${encodeURIComponent(localTimeZone())}`,
    );
    return {
      start: schedule.start,
      days: schedule.days,
      members: schedule.members.map((member) => ({
        memberId: member.member_id,
        linkedCalendar: member.linked_calendar,
        calendarOk: member.calendar_ok,
        items: member.items.map((item) => ({ kind: item.kind, start: item.start, end: item.end, allDay: item.all_day, title: item.title, id: item.id })),
      })),
    };
  },
};

// Neighbouring members get colours that are easy to tell apart.
const tones: FamilyMember["tone"][] = ["sage", "coral", "gold", "sky", "violet", "teal", "rose", "indigo"];

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
    at: activity.created_at,
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
    completedAt: task.completed_at ?? undefined,
    recurrence: task.recurrence ?? undefined,
    assigneeId: task.assignee_id,
    owner: assignee?.firstName ?? "Unassigned",
    initials: assignee?.initials.slice(0, 1) ?? "?",
    complete,
    attention: complete ? undefined : task.assignee_id === null ? "Unassigned" : overdue ? "Overdue" : undefined,
    priority: task.priority === "Urgent" ? "High" : task.priority,
    status: task.status,
    activity: task.activity.map(toActivity),
  };
}

const activityVerbs: Record<TaskActivityAction, string> = {
  Created: "added",
  Assigned: "updated who is handling",
  Reassigned: "reassigned",
  Updated: "edited",
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
    at: activity.created_at,
  };
}
