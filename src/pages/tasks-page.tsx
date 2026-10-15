import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Pencil,
  MapPin,
  Plus,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePicker, TimePicker } from "@/components/ui/date-time-picker";
import { type AuthUser } from "@/components/auth/login-page";
import { AssigneeFaces, AssigneePicker, joinFirstNames } from "@/components/assignee-picker";
import { FamilyAvatar } from "@/components/family-avatar";
import { FamilyAssignmentSuggestion } from "@/components/family-assignment-suggestion";
import { DocumentImport } from "@/components/document-import";
import { careApi, type TaskChanges } from "@/api/care";
import { type CareData } from "@/hooks/use-care-data";
import { getLocalDateInputValue, localInputsToIso } from "@/lib/dates";
import { mockTaskRiskAssessment, taskRiskTagStyles, type TaskRiskAssessment } from "@/lib/task-risk";
import {
  isAssignedTo,
  recurrenceOptions,
  recurrencePhrases,
  type CareTask,
  type TaskDraft,
  type QuickSuggestion,
  type TaskRecurrence,
  type FamilyMember,
  type TaskActivity,
} from "@/types/care";
import { BannerButton, PageHeader } from "@/components/page-parts";

export function CarePlanPage({ care, currentUser }: { care: CareData; currentUser: AuthUser }) {
  const { tasks, members } = care;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("filter");
  const linkedFilter: TaskFilter | null = requestedFilter === "My Tasks" || requestedFilter === "Unassigned" || requestedFilter === "Needs attention" ? requestedFilter : null;
  const [activeFilter, setActiveFilter] = useState<TaskFilter>(linkedFilter ?? "All");
  useEffect(() => {
    if (linkedFilter) setActiveFilter(linkedFilter);
  }, [linkedFilter]);
  const [isTaskFiltersExpanded, setIsTaskFiltersExpanded] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<CareTask["priority"] | "All priorities">("All priorities");
  const [assigneeFilter, setAssigneeFilter] = useState("All assignees");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [dueSortDirection, setDueSortDirection] = useState<"earliest" | "latest">("earliest");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [recommendationTaskId, setRecommendationTaskId] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isImportingDocument, setIsImportingDocument] = useState(false);
  // Set while the form holds a draft from a document: what to tell the person to check, and how to mark the draft as added.
  const [draftNote, setDraftNote] = useState("");
  const markDraftAdded = useRef<(() => void) | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetail, setNewTaskDetail] = useState("");
  const [newTaskLocation, setNewTaskLocation] = useState("");
  const [newTaskDate, setNewTaskDate] = useState(() => getLocalDateInputValue());
  const [newTaskTime, setNewTaskTime] = useState("18:00");
  const [newTaskPriority, setNewTaskPriority] = useState<CareTask["priority"]>("Normal");
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<TaskRecurrence | null>(null);
  // A link to one task, such as from the assistant's answer, opens its details.
  const linkedTaskId = searchParams.get("task");
  useEffect(() => {
    if (linkedTaskId) setSelectedTaskId(linkedTaskId);
  }, [linkedTaskId]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const recommendationTask = tasks.find((task) => task.id === recommendationTaskId);

  // Tasks ticked off a moment ago. They stay in the list just long enough to celebrate and slide away,
  // and remember whether they were flagged at risk so they do not jump to another position meanwhile.
  const [leaving, setLeaving] = useState<ReadonlyMap<string, { wasAtRisk: boolean; assessment?: TaskRiskAssessment }>>(new Map());
  const toggleTask = (task: CareTask) => {
    if (task.complete) return care.reopenTask(task.id);
    const assessment = riskAssessments.get(task.id);
    setLeaving((current) => new Map(current).set(task.id, { wasAtRisk: (assessment?.reasons.length ?? 0) > 0, assessment }));
    // The row says when its exit has finished. This is only a safety net, in case that never comes.
    window.setTimeout(() => finishLeaving(task.id), 5000);
    return care.completeTask(task.id);
  };
  const finishLeaving = (taskId: string) => setLeaving((current) => {
    if (!current.has(taskId)) return current;
    const next = new Map(current);
    next.delete(taskId);
    return next;
  });

  const clearDraft = () => {
    setDraftNote("");
    markDraftAdded.current = null;
  };

  /** Put a draft from a document into the new-task form for the person to check. */
  const reviewDraft = (draft: TaskDraft, markAdded: () => void) => {
    const today = getLocalDateInputValue();
    const dateHasPassed = draft.dueDate !== null && draft.dueDate < today;
    setNewTaskTitle(draft.title);
    setNewTaskDetail(draft.detail);
    setNewTaskLocation(draft.location ?? "");
    setNewTaskDate(draft.dueDate && !dateHasPassed ? draft.dueDate : today);
    setNewTaskTime(draft.dueTime ?? (draft.dueDate ? "09:00" : "18:00"));
    setNewTaskPriority(draft.priority);
    setNewTaskRecurrence(draft.dueDate && !dateHasPassed ? draft.recurrence : null);
    setDraftNote(
      !draft.dueDate ? "The document gave no date, so the due date is set to today. Change it if needed."
        : dateHasPassed ? "The date in the document has already passed, so the due date is set to today. Change it if needed."
          : !draft.dueTime ? "The document gave no time, so it is set to 9:00 AM. Change it if needed."
            : "Check the details against the document before creating the task.",
    );
    markDraftAdded.current = markAdded;
    setIsCreatingTask(true);
  };

  const createTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await care.createTask({
      title: newTaskTitle.trim(),
      detail: newTaskDetail.trim(),
      location: newTaskLocation.trim() || undefined,
      dueAt: localInputsToIso(newTaskDate, newTaskTime),
      priority: newTaskPriority,
      recurrence: newTaskRecurrence,
    });
    if (!created) return;
    markDraftAdded.current?.();
    setRecommendationTaskId(created.id);
    setNewTaskPriority("Normal");
    setNewTaskRecurrence(null);
    setNewTaskTitle("");
    setNewTaskDetail("");
    setNewTaskLocation("");
    setNewTaskDate(getLocalDateInputValue());
    setNewTaskTime("18:00");
    setIsCreatingTask(false);
    clearDraft();
    setActiveFilter("All");
    setPriorityFilter("All priorities");
    setAssigneeFilter("All assignees");
    setAtRiskOnly(false);
    setDueSortDirection("earliest");
  };

  const filterOptions: TaskFilter[] = ["All", "My Tasks", "Unassigned", "Needs attention", "Completed"];
  // Which way the list slides when switching category: in from the right when moving to a tab further along.
  const [tabDirection, setTabDirection] = useState<-1 | 0 | 1>(0);
  const chooseFilter = (filter: TaskFilter) => {
    const step = Math.sign(filterOptions.indexOf(filter) - filterOptions.indexOf(activeFilter));
    setTabDirection(step as -1 | 0 | 1);
    setActiveFilter(filter);
  };
  // Where the sliding highlight sits: measured from the chosen tab, since the tabs are different widths.
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabThumb, setTabThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabListRef.current?.querySelector<HTMLElement>(`[data-tab="${activeFilter}"]`);
      setTabThumb(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null);
    };
    measure();
    // Counts in the tabs change width, and so does the window.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeFilter, tasks]);
  const riskEvaluatedAt = new Date();
  const riskAssessments = new Map(tasks.map((task) => [
    task.id,
    mockTaskRiskAssessment(task, tasks, members, riskEvaluatedAt, care.conflictTaskIds),
  ]));
  const filterTasks = (filter: TaskFilter) => {
    switch (filter) {
      case "My Tasks": return tasks.filter((task) => isAssignedTo(task, currentUser.id) && !task.complete);
      case "Unassigned": return tasks.filter((task) => task.assigneeIds.length === 0 && !task.complete);
      case "Needs attention": return tasks.filter((task) => Boolean(task.attention) && !task.complete);
      case "Completed": return tasks.filter((task) => task.complete);
      default: return tasks.filter((task) => !task.complete);
    }
  };

  const countForFilter = (filter: TaskFilter) => filterTasks(filter).length;
  // On every tab but Completed, a task that was just ticked off is kept until its exit has played.
  const visibleTasks = activeFilter === "Completed"
    ? filterTasks(activeFilter)
    : tasks.filter((task) => filterTasks(activeFilter).includes(task) || (task.complete && leaving.has(task.id)));
  const canFilterTasks = activeFilter !== "Completed";
  const filteredTasks = canFilterTasks ? visibleTasks.filter((task) => {
    if (priorityFilter !== "All priorities" && task.priority !== priorityFilter) return false;
    if (assigneeFilter === "Unassigned" ? task.assigneeIds.length > 0 : assigneeFilter !== "All assignees" && !isAssignedTo(task, assigneeFilter)) return false;
    if (atRiskOnly && (riskAssessments.get(task.id)?.reasons.length ?? 0) === 0) return false;
    return true;
  }) : visibleTasks;
  const sortedTasks = [...filteredTasks].sort((first, second) => {
    // A task on its way out is ordered as it was before it was completed, so it leaves from where it stood.
    const firstAtRisk = leaving.get(first.id)?.wasAtRisk ?? (riskAssessments.get(first.id)?.reasons.length ?? 0) > 0;
    const secondAtRisk = leaving.get(second.id)?.wasAtRisk ?? (riskAssessments.get(second.id)?.reasons.length ?? 0) > 0;
    if (firstAtRisk !== secondAtRisk) return firstAtRisk ? -1 : 1;
    const firstDone = first.complete && !leaving.has(first.id);
    const secondDone = second.complete && !leaving.has(second.id);
    if (firstDone !== secondDone) return firstDone ? 1 : -1;
    const firstDue = first.dueAt ? new Date(first.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const secondDue = second.dueAt ? new Date(second.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (firstDue !== secondDue) {
      if (!Number.isFinite(firstDue)) return 1;
      if (!Number.isFinite(secondDue)) return -1;
      const direction = activeFilter === "Completed" || dueSortDirection === "earliest" ? 1 : -1;
      return direction * (firstDue - secondDue);
    }
    return first.createdAt.localeCompare(second.createdAt);
  });
  const hasTaskFilters = priorityFilter !== "All priorities" || assigneeFilter !== "All assignees" || atRiskOnly || dueSortDirection !== "earliest";
  const activeTaskFilterCount = Number(priorityFilter !== "All priorities") + Number(assigneeFilter !== "All assignees") + Number(atRiskOnly);

  return (
    <>
      <PageHeader
        eyebrow={`${tasks.filter((task) => !task.complete).length} active · ${tasks.filter((task) => task.complete).length} completed`}
        title="Tasks"
        lead={<span className="inline-flex items-center gap-2"><UsersRound size={16} aria-hidden="true" />Shared with {members.length} family {members.length === 1 ? "member" : "members"}</span>}
        actions={<>
          <BannerButton icon={FileText} aria-expanded={isImportingDocument} onClick={() => setIsImportingDocument((current) => !current)}>From a document</BannerButton>
          <BannerButton icon={Plus} aria-expanded={isCreatingTask} onClick={() => { clearDraft(); setIsCreatingTask((current) => !current); }}>New task</BannerButton>
        </>}
      />
      {isImportingDocument && (
        <DocumentImport className="mb-5" onReview={reviewDraft} onClose={() => { setIsImportingDocument(false); if (draftNote) { clearDraft(); setIsCreatingTask(false); } }} />
      )}
      {isCreatingTask && (
        <Card className="relative z-10 mb-5">
          <CardHeader><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{draftNote ? "Drafted from your document" : "Household delegation"}</p><h2 className="mt-1 font-display text-xl font-semibold">{draftNote ? "Check this task" : "Create a task"}</h2></div></CardHeader>
          <CardContent>
            {draftNote && <p role="status" className="mb-4 rounded-lg bg-primary/5 px-3 py-2.5 text-sm text-foreground/80">{draftNote}</p>}
            <form onSubmit={createTask} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Task title
                <input required maxLength={100} value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Details <span className="font-normal text-muted-foreground">(optional)</span>
                <textarea rows={2} maxLength={500} value={newTaskDetail} onChange={(event) => setNewTaskDetail(event.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Location <span className="font-normal text-muted-foreground">(optional)</span>
                <input maxLength={120} value={newTaskLocation} onChange={(event) => setNewTaskLocation(event.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <div className="text-sm font-medium">
                <span id="new-task-date-label">Due date</span>
                <DatePicker labelledBy="new-task-date-label" min={getLocalDateInputValue()} value={newTaskDate} onChange={setNewTaskDate} />
              </div>
              <div className="text-sm font-medium">
                <span id="new-task-time-label">Time</span>
                <TimePicker labelledBy="new-task-time-label" value={newTaskTime} onChange={setNewTaskTime} />
              </div>
              <div className="text-sm font-medium sm:col-span-2">
                <span id="new-task-priority-label">Priority</span>
                <div role="radiogroup" aria-labelledby="new-task-priority-label" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/60 p-1">
                  {taskPriorities.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      role="radio"
                      aria-checked={newTaskPriority === priority}
                      onClick={() => setNewTaskPriority(priority)}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${newTaskPriority === priority ? "bg-card text-foreground shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <span aria-hidden="true" className={`size-2 rounded-full ${priorityDots[priority]}`} />{priority}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-sm font-medium sm:col-span-2">
                <span id="new-task-repeat-label">Repeat</span>
                <div role="radiogroup" aria-labelledby="new-task-repeat-label" className="mt-1.5 grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted/60 p-1">
                  {recurrenceOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      role="radio"
                      aria-checked={newTaskRecurrence === option.value}
                      onClick={() => setNewTaskRecurrence(option.value)}
                      className={`rounded-md px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${newTaskRecurrence === option.value ? "bg-card text-foreground shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => { setIsCreatingTask(false); clearDraft(); }}>Cancel</Button>
                <Button type="submit">Create task</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {recommendationTask && !recommendationTask.complete && (
        <FamilyAssignmentSuggestion
          key={recommendationTask.id}
          className="mb-5"
          task={recommendationTask}
          tasks={tasks}
          members={members}
          onAssign={(memberIds) => {
            void care.assignTask(recommendationTask.id, memberIds);
            setRecommendationTaskId(null);
          }}
        />
      )}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div ref={tabListRef} role="tablist" aria-label="Filter care tasks" className="relative flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-border bg-muted p-1">
          {/* The white highlight slides to the chosen category instead of jumping. */}
          <span aria-hidden="true" className="tab-thumb shadow-soft pointer-events-none absolute inset-y-1 left-0 rounded-xl bg-card" style={tabThumb ? { translate: `${tabThumb.left}px 0`, width: tabThumb.width } : { opacity: 0 }} />
          {filterOptions.map((filter) => (
            <button
              key={filter}
              type="button"
              role="tab"
              data-tab={filter}
              aria-selected={activeFilter === filter}
              aria-controls="tasks-panel"
              onClick={() => chooseFilter(filter)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeFilter === filter ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {filter}<span className="text-xs opacity-70">{countForFilter(filter)}</span>
            </button>
          ))}
        </div>
        {canFilterTasks && (
          <Button
            size="sm"
            variant="outline"
            aria-expanded={isTaskFiltersExpanded}
            aria-controls="all-task-filters"
            onClick={() => setIsTaskFiltersExpanded((expanded) => !expanded)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />Filters
            {activeTaskFilterCount > 0 && <Badge variant="secondary" className="px-1.5 py-1 text-[10px]">{activeTaskFilterCount}</Badge>}
          </Button>
        )}
      </div>
      {canFilterTasks && isTaskFiltersExpanded && (
        <div id="all-task-filters" className="shadow-soft mb-4 grid gap-3 rounded-[22px] border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-[minmax(130px,1fr)_minmax(130px,1fr)_minmax(150px,1fr)_auto_auto] xl:items-end">
          <label className="text-xs font-semibold text-muted-foreground">Priority
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as CareTask["priority"] | "All priorities")} className="mt-1.5 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option>All priorities</option>
              {taskPriorities.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">Assignee
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="mt-1.5 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="All assignees">All assignees</option>
              <option value="Unassigned">Unassigned</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.firstName}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">Due order
            <select value={dueSortDirection} onChange={(event) => setDueSortDirection(event.target.value as "earliest" | "latest")} className="mt-1.5 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="earliest">Earliest first</option>
              <option value="latest">Latest first</option>
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={atRiskOnly} onChange={(event) => setAtRiskOnly(event.target.checked)} className="size-4 accent-[var(--primary)]" />
            At risk only
          </label>
          <Button size="sm" variant="outline" disabled={!hasTaskFilters} onClick={() => { setPriorityFilter("All priorities"); setAssigneeFilter("All assignees"); setAtRiskOnly(false); setDueSortDirection("earliest"); }}><RotateCcw size={14} aria-hidden="true" />Clear filters</Button>
        </div>
      )}
      <section aria-label={`${activeFilter} tasks`}>
        {canFilterTasks && <p className="mb-2.5 px-1 text-xs font-bold text-muted-foreground">{sortedTasks.length} of {visibleTasks.length} tasks</p>}
        {/* Remounted per category, so the new list slides in from the side of the tab that was chosen. */}
        <div key={activeFilter} id="tasks-panel" role="tabpanel" className={`stagger space-y-3 ${tabDirection === 1 ? "tab-enter-right" : tabDirection === -1 ? "tab-enter-left" : ""}`}>
          {sortedTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              members={members}
              riskAssessment={leaving.get(task.id)?.assessment ?? riskAssessments.get(task.id)}
              isLeaving={activeFilter !== "Completed" && leaving.has(task.id)}
              onExited={() => finishLeaving(task.id)}
              onToggle={() => void toggleTask(task)}
              onAssign={(assigneeIds) => void care.assignTask(task.id, assigneeIds)}
              onOpen={() => setSelectedTaskId(task.id)}
            />
          ))}
          {sortedTasks.length === 0 && <p className="shadow-soft rounded-[22px] border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">No tasks match these filters.</p>}
        </div>
      </section>
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          members={members}
          activity={selectedTask.activity}
          onClose={() => {
            setSelectedTaskId(null);
            // Forget the link, so following it again opens the task again.
            if (linkedTaskId) setSearchParams((current) => { current.delete("task"); return current; }, { replace: true });
          }}
          onReassign={(assigneeIds) => void care.assignTask(selectedTask.id, assigneeIds)}
          onStopRepeating={() => void care.stopRepeating(selectedTask.id)}
          onSave={(changes) => care.updateTask(selectedTask.id, changes)}
          onDelete={() => care.deleteTask(selectedTask.id)}
          onComplete={() => void toggleTask(selectedTask)}
        />
      )}
    </>
  );
}

type TaskFilter = "All" | "My Tasks" | "Unassigned" | "Needs attention" | "Completed";

// How long a completed task celebrates on its row before it slides away. The slide and the closing of the gap
// are timed in index.css ("task-leaving"), and the row reports back when they have finished.
const taskCelebrateMs = 480;

function TaskListItem({
  task,
  members,
  riskAssessment,
  isLeaving = false,
  onExited,
  onToggle,
  onAssign,
  onOpen,
}: {
  task: CareTask;
  members: readonly FamilyMember[];
  riskAssessment?: TaskRiskAssessment;
  /** True while a just-completed task is being shown out of a list it no longer belongs in. */
  isLeaving?: boolean;
  /** Called once the exit animation has finished and the row can be removed. */
  onExited?: () => void;
  onToggle: () => void;
  onAssign: (assigneeIds: string[]) => void;
  onOpen: () => void;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [useSuggestion, setUseSuggestion] = useState(false);
  const closeAssigning = () => {
    setIsAssigning(false);
    setUseSuggestion(false);
  };
  // A task that has just been ticked off celebrates first, then exits. Both are worked out while rendering,
  // so the very first frame after the tick is already the celebration and never a flash of the exit.
  const isDeparting = isLeaving && task.complete;
  const [hasCelebrated, setHasCelebrated] = useState(false);
  useEffect(() => {
    if (!isDeparting) {
      setHasCelebrated(false);
      return;
    }
    const timer = window.setTimeout(() => setHasCelebrated(true), taskCelebrateMs);
    return () => window.clearTimeout(timer);
  }, [isDeparting]);
  const justCompleted = isDeparting && !hasCelebrated;
  // The exit closes the gap by shrinking the row from its real height, which has to be measured first.
  const rowRef = useRef<HTMLElement>(null);
  const isExiting = isDeparting && hasCelebrated;
  useLayoutEffect(() => {
    if (isExiting && rowRef.current) rowRef.current.style.setProperty("--row-height", `${rowRef.current.offsetHeight}px`);
  }, [isExiting]);
  // Fetched when the control opens: who fits by schedule, role and workload. Free, with no AI call.
  const [quick, setQuick] = useState<QuickSuggestion | null>(null);
  useEffect(() => {
    if (!isAssigning) return;
    let isCurrent = true;
    setQuick(null);
    careApi.quickSuggestion(task.id).then((result) => { if (isCurrent) setQuick(result); }).catch(() => {});
    return () => { isCurrent = false; };
  }, [isAssigning, task.id]);
  const busyMemberIds = new Set(quick?.busyMemberIds ?? []);
  // Until the answer arrives, or if it cannot be fetched, fall back to the simpler rule worked out in the browser.
  const suggestedIds = quick ? quick.memberIds : riskAssessment?.suggestedMember ? [riskAssessment.suggestedMember.id] : [];
  const suggestedMembers = suggestedIds.map((id) => members.find((member) => member.id === id)).filter((member): member is FamilyMember => Boolean(member));
  const assignees = task.assigneeIds.map((id) => members.find((member) => member.id === id)).filter((member): member is FamilyMember => Boolean(member));
  const isUnassigned = task.assigneeIds.length === 0;
  const suggestionIsNew = suggestedIds.length > 0 && !(suggestedIds.length === task.assigneeIds.length && suggestedIds.every((id) => isAssignedTo(task, id)));
  // On its way out, the row keeps the look it had before it was ticked, so nothing in it changes size mid-animation.
  const looksOpen = !task.complete || isLeaving;
  const isAtRisk = looksOpen && (riskAssessment?.reasons.length ?? 0) > 0;

  return (
    // Clicking anywhere on the row opens the task. The tick and the assignee control keep their own clicks,
    // and the title is a real button so the task can also be opened from the keyboard.
    <article
      onClick={onOpen}
      ref={rowRef}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget && event.animationName === "row-collapse") onExited?.(); }}
      className={`row-lift ${justCompleted ? "just-completed" : isExiting ? "task-leaving" : ""} shadow-soft grid cursor-pointer gap-3 rounded-[20px] border border-border bg-card px-4 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(225px,1.35fr)_minmax(145px,1fr)_minmax(100px,0.8fr)] xl:items-center xl:px-5 ${isAtRisk ? "border-l-[5px] border-l-alert!" : !looksOpen ? "bg-muted/60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
          aria-label={`${task.complete ? "Reopen" : "Mark complete"}: ${task.title}`}
          aria-pressed={task.complete}
          className={`task-check relative flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${task.complete ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary"}`}
        >
          {/* Always present, so the tick can draw itself when the task is completed. */}
          <Check size={14} strokeWidth={3} aria-hidden="true" />
          {justCompleted && <span aria-hidden="true" className="task-burst" />}
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} aria-haspopup="dialog" data-done={task.complete} className="task-title min-w-0 text-left text-[15px] font-extrabold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {task.title}
        </button>
      </div>
      {/* Clicks here choose an assignee, so they do not also open the task. */}
      <div className="min-w-0 text-xs text-muted-foreground" onClick={(event) => event.stopPropagation()}>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] xl:hidden">Assigned to</span>
        {isAssigning && !task.complete ? (
          <>
            {suggestionIsNew && (
              <button type="button" onClick={() => setUseSuggestion(true)} disabled={useSuggestion} className="mb-1.5 block max-w-full truncate rounded text-left text-[11px] font-semibold text-primary enabled:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Suggested: {joinFirstNames(suggestedMembers)}{!isUnassigned && !useSuggestion ? " · use this" : ""}
              </button>
            )}
            {/* Remounted when the suggestion arrives or is taken, so it is what starts selected. */}
            <AssigneePicker
              key={`${quick ? "suggested" : "fallback"}-${useSuggestion}`}
              members={members}
              current={task.assigneeIds}
              preset={isUnassigned || useSuggestion ? suggestedIds : undefined}
              busyMemberIds={busyMemberIds}
              label={`Who does ${task.title}`}
              onSave={(ids) => { onAssign(ids); closeAssigning(); }}
              onCancel={closeAssigning}
            />
          </>
        ) : (
          <button
            type="button"
            disabled={task.complete}
            onClick={() => setIsAssigning(true)}
            aria-label={isUnassigned ? `Assign ${task.title}` : `${task.title} is assigned to ${joinFirstNames(assignees) || task.owner}. Change who does it`}
            className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {assignees.length > 0
              ? <AssigneeFaces members={assignees} />
              : <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-xs">?</span>}
            <span className={`min-w-0 flex-1 truncate text-sm ${isUnassigned ? "text-muted-foreground" : "text-foreground"}`}>{task.owner}</span>
            {!task.complete && <ChevronDown size={14} aria-hidden="true" className="shrink-0" />}
          </button>
        )}
      </div>
      <div className="text-sm">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">Due</span>
        <span className="inline-flex items-center gap-1.5 text-foreground/80">
          <Clock3 size={14} aria-hidden="true" />{task.time}
          {task.recurrence && <span title={recurrencePhrases[task.recurrence]} className="inline-flex text-primary"><Repeat size={13} aria-hidden="true" /><span className="sr-only">{recurrencePhrases[task.recurrence]}</span></span>}
        </span>
      </div>
      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground xl:hidden">Priority</span>
        <PriorityBadge priority={task.priority} />
        {riskAssessment && riskAssessment.reasons.length > 0 && (
          <ul className="mt-1.5 flex max-w-48 flex-wrap gap-1" aria-label={`Risk tags for ${task.title}`}>
            {riskAssessment.reasons.filter((reason) => reason.tag !== "Unavailable").map((reason) => (
              <li key={`${reason.tag}-${reason.label}`}>
                <Badge title={reason.label} className={`${taskRiskTagStyles[reason.tag]} whitespace-normal text-[10px]`} variant="outline">{reason.tag}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

const taskPriorities: CareTask["priority"][] = ["High", "Normal", "Low"];

const priorityDots: Record<CareTask["priority"], string> = {
  High: "bg-alert",
  Normal: "bg-secondary-foreground",
  Low: "bg-muted-foreground/50",
};

function PriorityBadge({ priority }: { priority: CareTask["priority"] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${priority === "High" ? "text-foreground" : "text-muted-foreground"}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${priorityDots[priority]}`} />{priority}
    </span>
  );
}

/** One short line for a task's history, e.g. "Annie assigned it to Jerry". */
function describeActivity(item: TaskActivity) {
  switch (item.action) {
    case "Created": return `${item.actor} created this task`;
    case "Assigned":
    case "Updated": return `${item.actor} ${item.detail.charAt(0).toLowerCase()}${item.detail.slice(1)}`;
    case "Reassigned":
      return item.detail.startsWith("Assigned to ") ? `${item.actor} assigned it to ${item.detail.slice("Assigned to ".length)}` : `${item.actor} unassigned it`;
    case "Accepted": return `${item.actor} accepted it`;
    case "Declined": return `${item.actor} declined it`;
    case "Completed": return `${item.actor} completed it`;
    case "Reopened": return `${item.actor} reopened it`;
  }
}

/** The details of one task, opened from anywhere else it appears, such as the calendars. */
export function TaskDetails({ care, taskId, onClose }: { care: CareData; taskId: string; onClose: () => void }) {
  const task = care.tasks.find((item) => item.id === taskId);
  // A task deleted from its details simply disappears.
  if (!task) return null;
  return (
    <TaskDetailDialog
      task={task}
      members={care.members}
      activity={task.activity}
      onClose={onClose}
      onReassign={(assigneeIds) => void care.assignTask(task.id, assigneeIds)}
      onStopRepeating={() => void care.stopRepeating(task.id)}
      onSave={(changes) => care.updateTask(task.id, changes)}
      onDelete={() => care.deleteTask(task.id)}
      onComplete={() => void (task.complete ? care.reopenTask(task.id) : care.completeTask(task.id))}
    />
  );
}

function TaskDetailDialog({
  task,
  members,
  activity,
  onClose,
  onReassign,
  onStopRepeating,
  onSave,
  onDelete,
  onComplete,
}: {
  task: CareTask;
  members: readonly FamilyMember[];
  activity: TaskActivity[];
  onClose: () => void;
  onReassign: (assigneeIds: string[]) => void;
  onStopRepeating: () => void;
  onSave: (changes: TaskChanges) => Promise<boolean | undefined>;
  onDelete: () => Promise<boolean | undefined>;
  onComplete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const assignees = task.assigneeIds.map((id) => members.find((member) => member.id === id)).filter((member): member is FamilyMember => Boolean(member));
  const assignedMember = assignees[0];
  const isOverdue = !task.complete && task.attention === "Overdue";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="task-detail-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className={`fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35 ${isEditing ? "overflow-y-auto sm:overflow-visible" : "overflow-y-auto"}`}
    >
      {isEditing ? (
        <TaskEditForm task={task} onCancel={() => setIsEditing(false)} onSave={async (changes) => { if (await onSave(changes)) setIsEditing(false); }} />
      ) : (
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="task-detail-title" className="font-display text-2xl font-semibold">{task.title}</h2>
            {task.detail && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{task.detail}</p>}
          </div>
          <button autoFocus type="button" aria-label="Close task details" onClick={() => dialogRef.current?.close()} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg bg-primary/5 p-3.5">
          {assignees.length > 1
            ? <AssigneeFaces members={assignees} />
            : assignedMember
              ? <FamilyAvatar initials={assignedMember.initials} tone={assignedMember.tone} imageUrl={assignedMember.avatarUrl} className="size-10" />
              : <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-sm text-muted-foreground">?</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{assignees.length > 1 ? joinFirstNames(assignees) : assignedMember?.name ?? "Unassigned"}</p>
            <p className="text-xs text-muted-foreground">{task.complete ? "Completed" : assignees.length > 1 ? "Shared task" : assignedMember ? assignedMember.role : "Needs someone to take it"}</p>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>

        <ul className="mt-4 space-y-2.5 text-sm">
          <li className={`flex items-center gap-2.5 ${isOverdue ? "font-medium text-alert" : ""}`}>
            <Clock3 size={15} aria-hidden="true" className={`shrink-0 ${isOverdue ? "" : "text-muted-foreground"}`} />
            <span><span className="sr-only">Due: </span>{task.time}{isOverdue ? " · Overdue" : ""}</span>
          </li>
          {task.location && (
            <li className="flex items-center gap-2.5">
              <MapPin size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span><span className="sr-only">Location: </span>{task.location}</span>
            </li>
          )}
          {task.recurrence && (
            <li className="flex items-center gap-2.5">
              <Repeat size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span>{recurrencePhrases[task.recurrence]}</span>
              <button type="button" onClick={onStopRepeating} className="link-underline rounded text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Stop repeating</button>
            </li>
          )}
        </ul>

        <section aria-label="Task actions" className="mt-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={task.complete ? "outline" : "default"} onClick={onComplete}>{task.complete ? "Reopen task" : "Mark complete"}</Button>
            {!task.complete && (
              <Button size="sm" variant="outline" aria-expanded={isReassigning} onClick={() => setIsReassigning((current) => !current)}>{assignedMember ? "Change who" : "Assign"}</Button>
            )}
            {!task.complete && <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Pencil size={14} aria-hidden="true" />Edit</Button>}
            <button
              type="button"
              onClick={() => {
                const warning = task.recurrence ? `Delete “${task.title}”? It will also stop repeating.` : `Delete “${task.title}”? This cannot be undone.`;
                // On success the task is gone, so this dialog closes with it.
                if (window.confirm(warning)) void onDelete();
              }}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-alert hover:bg-alert/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert"
            >
              <Trash2 size={14} aria-hidden="true" />Delete
            </button>
          </div>
          {isReassigning && !task.complete && (
            <AssigneePicker
              className="mt-3 p-3"
              members={members}
              current={task.assigneeIds}
              label={`Who does ${task.title}`}
              onSave={(ids) => { onReassign(ids); setIsReassigning(false); }}
              onCancel={() => setIsReassigning(false)}
            />
          )}
        </section>

        {activity.length > 0 && (
          <details className="group mt-6 border-t border-border pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown size={15} aria-hidden="true" className="-rotate-90 transition-transform group-open:rotate-0" />
              History ({activity.length})
            </summary>
            <ol className="mt-3 space-y-2.5">
              {[...activity].reverse().map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">{describeActivity(item)}</span>
                  <time className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{item.time}</time>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      )}
    </dialog>
  );
}

/** The task's details as a form, shown in place of the details view while editing. */
function TaskEditForm({ task, onCancel, onSave }: { task: CareTask; onCancel: () => void; onSave: (changes: TaskChanges) => Promise<void> }) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const [title, setTitle] = useState(task.title);
  const [detail, setDetail] = useState(task.detail);
  const [location, setLocation] = useState(task.location ?? "");
  const [hasDueDate, setHasDueDate] = useState(due !== null);
  const [date, setDate] = useState(() => getLocalDateInputValue(due ?? new Date()));
  const [time, setTime] = useState(() => due ? `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}` : "18:00");
  const [priority, setPriority] = useState(task.priority);
  const [recurrence, setRecurrence] = useState<TaskRecurrence | null>(task.recurrence ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const inputClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    await onSave({ title: title.trim(), detail: detail.trim(), location: location.trim() || null, dueAt: hasDueDate ? localInputsToIso(date, time) : null, priority, recurrence: hasDueDate ? recurrence : null });
    setIsSaving(false);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
      <h2 id="task-detail-title" className="font-display text-2xl font-semibold sm:col-span-2">Edit task</h2>
      <label className="text-sm font-medium sm:col-span-2">Task title
        <input required autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClassName} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">Details <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea rows={2} maxLength={500} value={detail} onChange={(event) => setDetail(event.target.value)} className={inputClassName} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">Location <span className="font-normal text-muted-foreground">(optional)</span>
        <input maxLength={120} value={location} onChange={(event) => setLocation(event.target.value)} className={inputClassName} />
      </label>
      {hasDueDate && (
        <>
          <div className="text-sm font-medium">
            <span id="edit-task-date-label">Due date</span>
            <DatePicker labelledBy="edit-task-date-label" value={date} onChange={setDate} />
          </div>
          <div className="text-sm font-medium">
            <span id="edit-task-time-label">Time</span>
            <TimePicker labelledBy="edit-task-time-label" value={time} onChange={setTime} />
          </div>
        </>
      )}
      {hasDueDate && (
        <div className="text-sm font-medium sm:col-span-2">
          <span id="edit-task-repeat-label">Repeat</span>
          <div role="radiogroup" aria-labelledby="edit-task-repeat-label" className="mt-1.5 grid grid-cols-5 gap-1 rounded-lg border border-border bg-muted/60 p-1">
            {recurrenceOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={recurrence === option.value}
                onClick={() => setRecurrence(option.value)}
                className={`rounded-md px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${recurrence === option.value ? "bg-card text-foreground shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* A repeating task counts from its due date, so it cannot be without one. */}
      {!recurrence && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
          <input type="checkbox" checked={!hasDueDate} onChange={(event) => setHasDueDate(!event.target.checked)} className="size-4 accent-primary" />
          No due date
        </label>
      )}
      <div className="text-sm font-medium sm:col-span-2">
        <span id="edit-task-priority-label">Priority</span>
        <div role="radiogroup" aria-labelledby="edit-task-priority-label" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/60 p-1">
          {taskPriorities.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={priority === option}
              onClick={() => setPriority(option)}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${priority === option ? "bg-card text-foreground shadow-sm ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span aria-hidden="true" className={`size-2 rounded-full ${priorityDots[option]}`} />{option}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSaving || !title.trim()}>{isSaving ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
