import { useCallback, useState } from "react";
import type { CareAppointment, CareTask } from "@/types/care";

export type CareNotification = {
  id: string;
  title: string;
  detail: string;
  /** Where clicking the notification goes. */
  to: string;
  tone: "alert" | "warning" | "info";
};

const soonMs = 36 * 60 * 60_000;

/** What needs the signed-in user's attention right now, most urgent first. Derived from live data, so items clear themselves once handled. */
export function buildNotifications(
  tasks: readonly CareTask[],
  appointments: readonly CareAppointment[],
  currentUserId: string,
  now = new Date(),
): CareNotification[] {
  const notifications: CareNotification[] = [];
  const myTasks = tasks.filter((task) => !task.complete && task.assigneeId === currentUserId);

  for (const task of myTasks.filter((item) => item.attention === "Overdue")) {
    notifications.push({ id: `overdue-${task.id}`, title: task.title, detail: `Overdue · was due ${task.time}`, to: "/tasks?filter=My%20Tasks", tone: "alert" });
  }
  for (const task of myTasks.filter((item) => item.status === "Open" && item.attention !== "Overdue")) {
    notifications.push({ id: `accept-${task.id}`, title: task.title, detail: `Waiting for you to accept · due ${task.time}`, to: "/tasks?filter=My%20Tasks", tone: "warning" });
  }

  const unassigned = tasks.filter((task) => !task.complete && task.assigneeId === null);
  if (unassigned.length > 0) {
    notifications.push({
      // Includes the task ids so a dismissed group comes back when a new task joins the queue.
      id: `unassigned-${unassigned.map((task) => task.id).sort().join("+")}`,
      title: unassigned.length === 1 ? unassigned[0].title : `${unassigned.length} tasks need an owner`,
      detail: unassigned.length === 1 ? "No one is assigned yet" : unassigned.slice(0, 2).map((task) => task.title).join(", ") + (unassigned.length > 2 ? "…" : ""),
      to: "/tasks?filter=Unassigned",
      tone: "warning",
    });
  }

  for (const appointment of appointments) {
    const startsIn = new Date(appointment.startsAt).getTime() - now.getTime();
    if (startsIn < 0 || startsIn > soonMs) continue;
    notifications.push({
      id: `appointment-${appointment.id}`,
      title: appointment.title,
      detail: `${appointment.date} · ${appointment.time}${appointment.place ? ` · ${appointment.place}` : ""}`,
      to: "/appointments",
      tone: "info",
    });
  }

  return notifications;
}

function readDismissed(storageKey: string): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Hides notifications the user has dismissed. Dismissals are remembered per user in this browser only;
 * a dismissed item stays hidden until its situation changes (which gives it a new id) or it resolves.
 */
export function useDismissibleNotifications(notifications: readonly CareNotification[], userId: string) {
  const storageKey = `dismissedNotifications:${userId}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));

  const save = useCallback((ids: string[]) => {
    setDismissed(ids);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch {
      // Storage can be unavailable (private mode); the dismissal then lasts until the page reloads.
    }
  }, [storageKey]);

  // Forget ids that no longer match a live notification, so the stored list cannot grow without bound.
  const liveIds = new Set(notifications.map((notification) => notification.id));
  const stillRelevant = dismissed.filter((id) => liveIds.has(id));

  return {
    visible: notifications.filter((notification) => !stillRelevant.includes(notification.id)),
    dismiss: (id: string) => save([...stillRelevant, id]),
    dismissAll: () => save([...liveIds]),
  };
}
