export type Availability = "Available" | "With family" | "Away today" | "On duty";

export const availabilityOptions: Availability[] = ["Available", "With family", "Away today", "On duty"];

export type Family = {
  id: string;
  name: string;
  myRole: "ADMIN" | "MEMBER";
  /** Only present for family admins. */
  inviteCode: string | null;
};

/** The colours a member's initials can be shown in. Each member in a family gets the next one along. */
export type AvatarTone = "sage" | "coral" | "gold" | "sky" | "violet" | "teal" | "rose" | "indigo";

export type FamilyMember = {
  id: string;
  name: string;
  firstName: string;
  email: string;
  accessRole: "ADMIN" | "MEMBER";
  /** How this person relates to the household, e.g. "Son" or "Caregiver". */
  role: string;
  relationshipLabel: string | null;
  initials: string;
  /** Profile picture as a data URL, when the person has set one. */
  avatarUrl?: string;
  availability: Availability;
  availabilityNote?: string;
  tone: AvatarTone;
};

/** "Accepted" and "Declined" are no longer recorded, but still appear in older history. */
export type TaskActivityAction = "Created" | "Assigned" | "Accepted" | "Declined" | "Reassigned" | "Updated" | "Completed" | "Reopened";

export type TaskActivity = {
  id: string;
  action: TaskActivityAction;
  actorId: string | null;
  actor: string;
  detail: string;
  time: string;
  /** When it happened, as an ISO timestamp. */
  at: string;
};

export type TaskRecurrence = "daily" | "weekly" | "biweekly" | "monthly";

/** Short labels for the Repeat choice, in the order they are offered. */
export const recurrenceOptions: { value: TaskRecurrence | null; label: string }[] = [
  { value: null, label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "2 weeks" },
  { value: "monthly", label: "Monthly" },
];

export const recurrencePhrases: Record<TaskRecurrence, string> = {
  daily: "Repeats every day",
  weekly: "Repeats every week",
  biweekly: "Repeats every 2 weeks",
  monthly: "Repeats every month",
};

export type CareTask = {
  id: string;
  title: string;
  detail: string;
  location?: string;
  /** Display label for the due time, e.g. "Today · 4:00 PM". */
  time: string;
  dueAt?: string;
  createdAt: string;
  /** Set on a repeating task: completing it, or its due time passing, creates the next one. */
  recurrence?: TaskRecurrence;
  /** When it was marked complete; absent while the task is open. */
  completedAt?: string;
  assigneeId: string | null;
  /** Assignee's first name, or "Unassigned". */
  owner: string;
  initials: string;
  complete: boolean;
  attention?: "Unassigned" | "Overdue";
  priority: "High" | "Normal" | "Low";
  status: "Open" | "Completed";
  activity: TaskActivity[];
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  category: string;
  content: string;
  /** How many searchable pieces the document was split into. */
  chunkCount: number;
  addedBy?: string;
  addedAt: string;
};

/** One excerpt of a document that matched a search. */
export type KnowledgeSearchResult = {
  id: string;
  documentId: string;
  title: string;
  content: string;
};

export type AssignmentSuggestion = {
  memberId: string;
  reason: string;
  /** Titles of the family notes the assistant was given. */
  noteTitles: string[];
};

/** A task the AI drafted from a document. It becomes a task only after the person has checked it. */
export type TaskDraft = {
  title: string;
  detail: string;
  location: string | null;
  /** Local date as written in the document, YYYY-MM-DD. */
  dueDate: string | null;
  /** Local clock time, HH:MM. */
  dueTime: string | null;
  priority: "High" | "Normal" | "Low";
  /** Set when the document says the task repeats. */
  recurrence: TaskRecurrence | null;
};

export type DocumentDrafts = {
  /** One sentence saying what the document is. */
  summary: string;
  tasks: TaskDraft[];
};

/** Whether the signed-in person has linked a calendar. The link itself never leaves the server. */
export type CalendarStatus = {
  connected: boolean;
  syncedAt: string | null;
  /** Busy times in the next 30 days; null when the calendar could not be read. */
  eventCount: number | null;
  error: string | null;
};

/** Whether the server has a Telegram bot, and whether the signed-in person has linked their Telegram account to it. */
export type TelegramStatus = {
  configured: boolean;
  linked: boolean;
  telegramUsername: string | null;
};

/** One entry in a member's schedule: a task due, or a busy time from a linked calendar (which never has a title). */
export type ScheduleItem = {
  kind: "busy" | "task";
  start: string;
  end: string | null;
  allDay: boolean;
  title: string | null;
  id: string | null;
};

export type MemberSchedule = {
  memberId: string;
  linkedCalendar: boolean;
  /** False when a linked calendar could not be read, so busy times may be missing. */
  calendarOk: boolean;
  items: ScheduleItem[];
};

export type FamilySchedule = {
  /** First day shown, YYYY-MM-DD. */
  start: string;
  days: number;
  members: MemberSchedule[];
};

/** A suggestion from plain rules (schedule, role, workload), with no AI call. */
export type QuickSuggestion = {
  memberId: string | null;
  reason: string;
  /** Members with something on within an hour of the task's due time. */
  busyMemberIds: string[];
};

/** An AI summary of one person's open tasks, with a suggested order to do them in. */
export type DayPlan = {
  /** Null when the person has no open tasks. */
  summary: string | null;
  steps: { taskId: string; note: string }[];
  generatedAt: string | null;
};

export type FamilyActivityItem = {
  id: string;
  actorId: string | null;
  person: string;
  /** Verb phrase that reads between the person and the subject, e.g. "completed". */
  action: string;
  subject: string;
  time: string;
  /** When it happened, as an ISO timestamp. */
  at: string;
};
