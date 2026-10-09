export type CareTask = {
  id: number;
  title: string;
  detail: string;
  location?: string;
  time: string;
  dueAt?: string;
  owner: string;
  initials: string;
  category: "Appointment" | "Medication" | "Check-in";
  complete: boolean;
  attention?: "Unassigned" | "Overdue" | "At risk";
  recipient: string;
  priority: "Urgent" | "High" | "Normal" | "Low";
  status: "Open" | "In progress" | "At risk" | "Completed";
};

function mockDeadline(daysFromToday: number, hour: number, minute = 0) {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + daysFromToday);
  deadline.setHours(hour, minute, 0, 0);
  return deadline.toISOString();
}

export const careTasks: CareTask[] = [
  {
    id: 1,
    title: "Pay medical bill",
    detail: "Riverside Family Practice · invoice due today",
    location: "Riverside Family Practice",
    time: "Today · 4:00 PM",
    dueAt: mockDeadline(0, 16),
    owner: "Unassigned",
    initials: "?",
    category: "Medication",
    complete: false,
    attention: "Unassigned",
    recipient: "Shared household",
    priority: "High",
    status: "At risk",
  },
  {
    id: 2,
    title: "Pick up medication",
    detail: "Oak Pharmacy · blood pressure tablets",
    location: "Oak Pharmacy",
    time: "Today · 5:30 PM",
    dueAt: mockDeadline(0, 17, 30),
    owner: "Sarah",
    initials: "S",
    category: "Medication",
    complete: false,
    recipient: "Shared household",
    priority: "High",
    status: "In progress",
  },
  {
    id: 3,
    title: "Prepare GP appointment notes",
    detail: "Bring medication list and recent blood pressure readings",
    time: "Tomorrow · 9:45 AM",
    dueAt: mockDeadline(1, 9, 45),
    owner: "Sarah",
    initials: "S",
    category: "Appointment",
    complete: false,
    recipient: "Shared household",
    priority: "Normal",
    status: "Open",
  },
  {
    id: 4,
    title: "Bring Mum to SGH",
    detail: "Leave home by 8:15 AM for the specialist appointment",
    location: "Singapore General Hospital",
    time: "Thu · 8:15 AM",
    dueAt: mockDeadline(4, 8, 15),
    owner: "David",
    initials: "D",
    category: "Appointment",
    complete: false,
    recipient: "Shared household",
    priority: "Urgent",
    status: "Open",
  },
  {
    id: 5,
    title: "Buy groceries",
    detail: "Use Mum’s list on the kitchen counter",
    location: "Mum’s home and nearby grocery store",
    time: "Today · 6:00 PM",
    dueAt: mockDeadline(0, 18),
    owner: "Jason",
    initials: "J",
    category: "Check-in",
    complete: false,
    recipient: "Shared household",
    priority: "Normal",
    status: "Open",
  },
  {
    id: 6,
    title: "Set out evening medication",
    detail: "Prepare the labelled pill organiser for tonight",
    time: "Today · 7:00 PM",
    dueAt: mockDeadline(0, 19),
    owner: "Linda",
    initials: "L",
    category: "Medication",
    complete: false,
    recipient: "Shared household",
    priority: "High",
    status: "Open",
  },
  {
    id: 7,
    title: "Call clinic to confirm appointment",
    detail: "Ask whether Mum should fast before the blood test",
    time: "Wed · 9:00 AM",
    dueAt: mockDeadline(3, 9),
    owner: "Sarah",
    initials: "S",
    category: "Appointment",
    complete: false,
    recipient: "Shared household",
    priority: "Normal",
    status: "Open",
  },
  {
    id: 8,
    title: "Call Mum after lunch",
    detail: "See how she is feeling and ask about groceries",
    time: "Completed · 1:15 PM",
    dueAt: mockDeadline(-1, 13, 15),
    owner: "Sarah",
    initials: "S",
    category: "Check-in",
    complete: true,
    recipient: "Shared household",
    priority: "Low",
    status: "Completed",
  },
];

export type FamilyMember = {
  name: string;
  role: string;
  initials: string;
  availability: "Available" | "With family" | "Away today" | "On duty";
  availabilityNote?: string;
  tone: "sage" | "coral" | "gold";
  distance?: string;
};

export const familyMembers: FamilyMember[] = [
  { name: "David Rivera", role: "Son", initials: "DR", availability: "Away today", tone: "coral" },
  { name: "Sarah Rivera", role: "Daughter", initials: "SR", availability: "Available", availabilityNote: "Available this evening", tone: "sage" },
  { name: "Jason Rivera", role: "Grandson", initials: "JR", availability: "Available", tone: "gold" },
  { name: "Linda Chen", role: "Caregiver", initials: "LC", availability: "On duty", tone: "coral" },
];

export const careAppointments = [
  { id: 1, date: "Wed, Sep 30", time: "10:30 AM", title: "GP review", place: "Riverside Family Practice", person: "Sarah", initials: "S", relatedTask: "Prepare GP appointment notes" },
  { id: 2, date: "Thu, Oct 1", time: "9:00 AM", title: "Specialist appointment", place: "Singapore General Hospital", person: "David", initials: "D", relatedTask: "Bring Mum to SGH" },
];

export const careAlerts = [
  { id: 1, title: "Prescription refill due soon", detail: "Blood pressure medication · 2 days left", type: "Medication" },
];

export const careActivity = [
  { id: 1, person: "David", initials: "D", action: "confirmed the ride for", subject: "Mum’s GP review", time: "12 min ago", tone: "coral" as const },
  { id: 2, person: "Jason", initials: "J", action: "picked up groceries for", subject: "Mum", time: "48 min ago", tone: "gold" as const },
  { id: 3, person: "Sarah", initials: "S", action: "completed", subject: "Call Mum after lunch", time: "1 hr ago", tone: "sage" as const },
];