import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/client";
import {
  careApi,
  toAppointment,
  toFamily,
  toFamilyActivity,
  toMember,
  toTask,
  type ApiAppointment,
  type ApiFamily,
  type ApiFamilyActivity,
  type ApiMember,
  type ApiTask,
  type MemberChanges,
  type NewAppointment,
  type NewTask,
} from "@/api/care";
import type { CareTask } from "@/types/care";

type Status = "loading" | "ready" | "no-family" | "error";

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** Loads the signed-in user's family, members, tasks, appointments, and activity, and exposes the actions that change them. */
export function useCareData() {
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [family, setFamily] = useState<ApiFamily | null>(null);
  const [rawMembers, setRawMembers] = useState<ApiMember[]>([]);
  const [rawTasks, setRawTasks] = useState<ApiTask[]>([]);
  const [rawAppointments, setRawAppointments] = useState<ApiAppointment[]>([]);
  const [rawActivity, setRawActivity] = useState<ApiFamilyActivity[]>([]);

  const reload = useCallback(async () => {
    try {
      const loadedFamily = await careApi.getFamily();
      const [members, tasks, appointments, activity] = await Promise.all([
        careApi.listMembers(),
        careApi.listTasks(),
        careApi.listAppointments(),
        careApi.listActivity(),
      ]);
      setFamily(loadedFamily);
      setRawMembers(members);
      setRawTasks(tasks);
      setRawAppointments(appointments);
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

  const members = useMemo(() => rawMembers.map(toMember), [rawMembers]);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const tasks = useMemo(() => rawTasks.map((task) => toTask(task, membersById)), [rawTasks, membersById]);
  const appointments = useMemo(() => {
    const taskTitlesById = new Map(rawTasks.map((task) => [task.id, task.title]));
    return rawAppointments.map((appointment) => toAppointment(appointment, membersById, taskTitlesById));
  }, [rawAppointments, rawTasks, membersById]);
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
    appointments,
    activity,

    createFamily: (name: string) => run(async () => { await careApi.createFamily(name); await reload(); }),
    joinFamily: (inviteCode: string) => run(async () => { await careApi.joinFamily(inviteCode); await reload(); }),
    /** Resolves to true once the family is gone; the app then shows the create-or-join screen. */
    deleteFamily: (confirmName: string) => run(async () => {
      await careApi.deleteFamily(confirmName);
      setFamily(null);
      setRawMembers([]);
      setRawTasks([]);
      setRawAppointments([]);
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
    assignTask: (taskId: string, assigneeId: string | null) => run(async () => applyTask(await careApi.assignTask(taskId, assigneeId))),
    stopRepeating: (taskId: string) => run(async () => { await careApi.stopRepeating(taskId); setRawTasks(await careApi.listTasks()); }),
    completeTask: taskAction("complete"),
    reopenTask: taskAction("reopen"),

    createAppointment: (appointment: NewAppointment) => run(async () => {
      const created = await careApi.createAppointment(appointment);
      setRawAppointments((current) => [...current, created].sort((first, second) => new Date(first.starts_at).getTime() - new Date(second.starts_at).getTime()));
      return true;
    }),
    deleteAppointment: (appointmentId: string) => run(async () => {
      await careApi.deleteAppointment(appointmentId);
      setRawAppointments((current) => current.filter((appointment) => appointment.id !== appointmentId));
    }),
  };
}

export type CareData = ReturnType<typeof useCareData>;
