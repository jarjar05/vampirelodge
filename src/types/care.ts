export type Availability = "Available" | "With family" | "Away today" | "On duty";

export const availabilityOptions: Availability[] = ["Available", "With family", "Away today", "On duty"];

export type Family = {
  id: string;
  name: string;
  myRole: "ADMIN" | "MEMBER";
  /** Only present for family admins. */
  inviteCode: string | null;
};

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
  tone: "sage" | "coral" | "gold";
};

export type TaskActivityAction = "Created" | "Assigned" | "Accepted" | "Declined" | "Reassigned" | "Completed" | "Reopened";

export type TaskActivity = {
  id: string;
  action: TaskActivityAction;
  actorId: string | null;
  actor: string;
  detail: string;
  time: string;
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
  assigneeId: string | null;
  /** Assignee's first name, or "Unassigned". */
  owner: string;
  initials: string;
  category: "Appointment" | "Medication" | "Check-in";
  complete: boolean;
  attention?: "Unassigned" | "Overdue";
  recipient: string;
  priority: "High" | "Normal" | "Low";
  status: "Open" | "In progress" | "Completed";
  activity: TaskActivity[];
};

export type CareAppointment = {
  id: string;
  title: string;
  place?: string;
  startsAt: string;
  date: string;
  time: string;
  attendeeId: string | null;
  /** Attendee's first name, when someone is going. */
  person?: string;
  relatedTask?: string;
};

export type FamilyActivityItem = {
  id: string;
  actorId: string | null;
  person: string;
  /** Verb phrase that reads between the person and the subject, e.g. "completed". */
  action: string;
  subject: string;
  time: string;
};
