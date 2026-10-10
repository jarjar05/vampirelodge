const dayMs = 24 * 60 * 60_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDay(date: Date, now = new Date()) {
  const dayDifference = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / dayMs);
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Tomorrow";
  if (dayDifference === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

export function formatClock(date: Date) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDue(dueAt?: string | null) {
  if (!dueAt) return "No due date";
  const date = new Date(dueAt);
  return `${formatDay(date)} · ${formatClock(date)}`;
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatRelative(value: string, now = new Date()) {
  const minutes = Math.round((now.getTime() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatTimestamp(value);
}

export function partOfDay(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function formatLongDate(date = new Date()) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

export function getLocalDateInputValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Combine values from date and time inputs into an ISO timestamp in the viewer's time zone. */
export function localInputsToIso(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue}`).toISOString();
}
