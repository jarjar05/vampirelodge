import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/api/client";
import {
  careApi,
  toFamily,
  toFamilyActivity,
  toMember,
  toTask,
  type ApiFamily,
  type ApiFamilyActivity,
  type ApiMember,
  type ApiTask,
  type MemberChanges,
  type NewTask,
  type TaskChanges,
} from "@/api/care";
import type { CareTask } from "@/types/care";

type Status = "loading" | "ready" | "no-family" | "error";

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

// How often the family's data is fetched again in the background while the tab is open.
const refreshEveryMs = 15_000;

/** Loads the signed-in user's family, members, tasks, and activity, and exposes the actions that change them. */
export function useCareData() {
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [family, setFamily] = useState<ApiFamily | null>(null);
  const [rawMembers, setRawMembers] = useState<ApiMember[]>([]);
  const [rawTasks, setRawTasks] = useState<ApiTask[]>([]);
  const [rawActivity, setRawActivity] = useState<ApiFamilyActivity[]>([]);
  // Open tasks whose assignee is busy when the task is due, from linked calendars.
  const [conflictTaskIds, setConflictTaskIds] = useState<ReadonlySet<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      const loadedFamily = await careApi.getFamily();
      const [members, tasks, activity] = await Promise.all([
        careApi.listMembers(),
        careApi.listTasks(),
        careApi.listActivity(),
      ]);
      setFamily(loadedFamily);
      setRawMembers(members);
      setRawTasks(tasks);
      setRawActivity(activity);
      setStatus("ready");
    } catch (error) {
      // A signed-in user who has not created or joined a family yet.
      if (error instanceof ApiError && error.status === 404) {
        setStatus("no-family");
        return;
      }
      setLoadError(messageFor(error));
      setStatus("error");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Other family members' changes arrive without a reload: the data is fetched again quietly every little while,
  // and straight away when someone comes back to the tab. State is only replaced when something actually changed,
  // so nothing on screen redraws, restarts an animation or loses its place for no reason.
  const lastSeen = useRef({ family: "", members: "", tasks: "", activity: "" });
  const refreshQuietly = useCallback(async () => {
    try {
      const [loadedFamily, members, tasks, activity] = await Promise.all([
        careApi.getFamily(), careApi.listMembers(), careApi.listTasks(), careApi.listActivity(),
      ]);
      const seen = lastSeen.current;
      const changed = (key: keyof typeof seen, value: unknown) => {
        const text = JSON.stringify(value);
        if (text === seen[key]) return false;
        seen[key] = text;
        return true;
      };
      if (changed("family", loadedFamily)) setFamily(loadedFamily);
      if (changed("members", members)) setRawMembers(members);
      if (changed("tasks", tasks)) setRawTasks(tasks);
      if (changed("activity", activity)) setRawActivity(activity);
    } catch (error) {
      // The family was deleted, or this person was removed from it, on someone else's screen.
      if (error instanceof ApiError && error.status === 404) setStatus("no-family");
      // Anything else (a dropped connection, the server restarting) is simply tried again next time.
    }
  }, []);
  useEffect(() => {
    if (status !== "ready") return;
    const refreshIfVisible = () => { if (document.visibilityState === "visible") void refreshQuietly(); };
    const timer = window.setInterval(refreshIfVisible, refreshEveryMs);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [status, refreshQuietly]);

  const members = useMemo(() => rawMembers.map(toMember), [rawMembers]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const tasks = useMemo(() => rawTasks.map((task) => toTask(task, membersById)), [rawTasks, membersById]);
  const activity = useMemo(() => rawActivity.map((item) => toFamilyActivity(item, membersById)), [rawActivity, membersById]);

  /** Runs an action; on failure shows the message in the page banner and resolves to undefined. */
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setActionError("");
    try {
      return await action();
    } catch (error) {
      setActionError(messageFor(error));
      return undefined;
    }
  }, []);

  const refreshActivity = useCallback(() => {
    careApi.listActivity().then(setRawActivity).catch(() => undefined);
  }, []);

  // Worked out on the server, which is the only place that can read linked calendars. A failure just means no flags.
  const refreshConflicts = useCallback(() => {
    careApi.listTaskConflicts().then((ids) => setConflictTaskIds(new Set(ids))).catch(() => undefined);
  }, []);
  useEffect(() => { if (status === "ready") refreshConflicts(); }, [status, rawTasks, refreshConflicts]);

  const applyTask = useCallback((updated: ApiTask) => {
    setRawTasks((current) => current.some((task) => task.id === updated.id)
      ? current.map((task) => task.id === updated.id ? updated : task)
      : [...current, updated]);
    refreshActivity();
  }, [refreshActivity]);

  const taskAction = (action: "complete" | "reopen") => (taskId: string) =>
    run(async () => {
      const updated = await careApi.taskAction(taskId, action);
      applyTask(updated);
      // Completing a repeating task creates its next occurrence on the server, so fetch the list again to show it.
      if (action === "complete" && updated.recurrence) setRawTasks(await careApi.listTasks());
    });

  return {
    status,
    loadError,
    actionError,
    clearActionError: () => setActionError(""),
    reload,
    family: family ? toFamily(family) : null,
    members,
    tasks,
    activity,
    conflictTaskIds,

    createFamily: (name: string) => run(async () => { await careApi.createFamily(name); await reload(); }),
    joinFamily: (inviteCode: string) => run(async () => { await careApi.joinFamily(inviteCode); await reload(); }),
    /** Resolves to true once the family is gone; the app then shows the create-or-join screen. */
    deleteFamily: (confirmName: string) => run(async () => {
      await careApi.deleteFamily(confirmName);
      setFamily(null);
      setRawMembers([]);
      setRawTasks([]);
      setRawActivity([]);
      setStatus("no-family");
      return true;
    }),
    renameFamily: (name: string) => run(async () => setFamily(await careApi.renameFamily(name))),
    updateMember: (userId: string, changes: MemberChanges) => run(async () => {
      const updated = await careApi.updateMember(userId, changes);
      setRawMembers((current) => current.map((member) => member.id === updated.id ? updated : member));
      return true;
    }),
    // Removing a member also returns their tasks to the unassigned queue, so reload everything.
    removeMember: (userId: string) => run(async () => { await careApi.removeMember(userId); await reload(); }),

    createTask: (task: NewTask): Promise<CareTask | undefined> => run(async () => {
      const created = await careApi.createTask(task);
      applyTask(created);
      return toTask(created, membersById);
    }),
    /** Give the task to these people, lead first; an empty list leaves it unassigned. */
    assignTask: (taskId: string, assigneeIds: string[]) => run(async () => applyTask(await careApi.assignTask(taskId, assigneeIds))),
    /** Resolves to true when the changes were saved. */
    updateTask: (taskId: string, changes: TaskChanges) => run(async () => { applyTask(await careApi.updateTask(taskId, changes)); return true; }),
    /** Resolves to true once the task is gone. */
    deleteTask: (taskId: string) => run(async () => {
      await careApi.deleteTask(taskId);
      // Deleting a repeating task also changes the rest of its series, so fetch the list again.
      setRawTasks(await careApi.listTasks());
      refreshActivity();
      return true;
    }),
    stopRepeating: (taskId: string) => run(async () => { await careApi.stopRepeating(taskId); setRawTasks(await careApi.listTasks()); }),
    completeTask: taskAction("complete"),
    reopenTask: taskAction("reopen"),

  };
}

export type CareData = ReturnType<typeof useCareData>;
