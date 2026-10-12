import { useEffect, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  Pencil,
  HeartPulse,
  Home,
  MapPin,
  Plus,
  Repeat,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Stethoscope,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePicker, TimePicker } from "@/components/ui/date-time-picker";
import { LoginPage, type AuthUser } from "@/components/auth/login-page";
import { FamilySetup } from "@/components/family/family-setup";
import { FamilyAvatar } from "@/components/family-avatar";
import { FamilyStats } from "@/components/family-stats";
import { FamilyAssignmentSuggestion } from "@/components/family-assignment-suggestion";
import { DayPlanCard } from "@/components/day-plan-card";
import { CountUp } from "@/components/count-up";
import { DocumentImport } from "@/components/document-import";
import { NotificationsMenu, ProfileMenu } from "@/components/header-menus";
import { ProfileSettingsDialog } from "@/components/profile-settings-dialog";
import { SidebarNav } from "@/components/sidebar-nav";
import type { TaskChanges } from "@/api/care";
import { useCareData, type CareData } from "@/hooks/use-care-data";
import { useReveal } from "@/hooks/use-reveal";
import { formatLongDate, getLocalDateInputValue, localInputsToIso, partOfDay } from "@/lib/dates";
import { buildNotifications, useDismissibleNotifications } from "@/lib/notifications";
import { KnowledgePage } from "@/pages/knowledge-page";
import { mockTaskRiskAssessment, taskRiskTagStyles, type TaskRiskAssessment } from "@/lib/task-risk";
import {
  availabilityOptions,
  recurrenceOptions,
  recurrencePhrases,
  type Availability,
  type CareAppointment,
  type CareTask,
  type TaskDraft,
  type TaskRecurrence,
  type Family,
  type FamilyActivityItem,
  type FamilyMember,
  type TaskActivity,
} from "@/types/care";

const navigation = [
  { to: "/", label: "Overview", mobileLabel: "Home", icon: Home, end: true },
  { to: "/tasks", label: "Tasks", mobileLabel: "Tasks", icon: ClipboardList, end: false },
  { to: "/appointments", label: "Appointments", mobileLabel: "Appts", icon: CalendarDays, end: false },
  { to: "/circle", label: "Family", mobileLabel: "Family", icon: UsersRound, end: false },
  { to: "/knowledge", label: "Knowledge", mobileLabel: "Notes", icon: BookOpen, end: false },
  { to: "/activity", label: "Activity", mobileLabel: "Activity", icon: ActivityIcon, end: false },
];

function AppShell() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let isCurrent = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (response) => response.ok ? await response.json() as AuthUser : null)
      .catch(() => null)
      .then((user) => {
        if (!isCurrent) return;
        setCurrentUser(user);
        setIsCheckingSession(false);
      });

    return () => { isCurrent = false; };
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setCurrentUser(null);
      navigate("/login", { replace: true });
    }
  };

  if (isCheckingSession) {
    return <main className="app-backdrop grid min-h-screen place-items-center text-sm text-muted-foreground">Checking your session…</main>;
  }

  if (!currentUser) {
    if (location.pathname !== "/login") return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    // The family is only known after sign-in, so greet with the last one used in this browser.
    const lastFamilyName = window.localStorage.getItem("familyName")?.trim() || "Family Care Coordinator";
    return <LoginPage familyName={lastFamilyName} onAuthenticated={setCurrentUser} />;
  }

  if (location.pathname === "/login") return <Navigate to="/" replace />;

  return <CareApp key={currentUser.id} currentUser={currentUser} onUserUpdated={setCurrentUser} onSignOut={handleSignOut} />;
}

function CareApp({ currentUser, onUserUpdated, onSignOut }: { currentUser: AuthUser; onUserUpdated: (user: AuthUser) => void; onSignOut: () => void }) {
  const care = useCareData();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const notifications = useDismissibleNotifications(buildNotifications(care.tasks, care.appointments, currentUser.id), currentUser.id);
  const family = care.family;
  const familyName = family?.name;

  useEffect(() => {
    if (familyName) window.localStorage.setItem("familyName", familyName);
  }, [familyName]);

  if (care.status === "loading") {
    return <main className="app-backdrop grid min-h-screen place-items-center text-sm text-muted-foreground">Loading your family…</main>;
  }

  if (care.status === "error") {
    return (
      <main className="app-backdrop grid min-h-screen place-items-center px-5 text-center text-foreground">
        <div>
          <p role="alert" className="text-sm text-muted-foreground">{care.loadError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" onClick={() => void care.reload()}>Try again</Button>
            <Button size="sm" variant="ghost" onClick={onSignOut}>Sign out</Button>
          </div>
        </div>
      </main>
    );
  }

  if (!family) {
    return (
      <FamilySetup
        userName={currentUser.name}
        errorMessage={care.actionError}
        onCreate={care.createFamily}
        onJoin={care.joinFamily}
        onSignOut={onSignOut}
      />
    );
  }

  const me = care.members.find((member) => member.id === currentUser.id);
  const overview = <OverviewPage care={care} currentUser={currentUser} />;

  const userInitials = currentUser.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  // One avatar for the signed-in user, used in both the sidebar and the header.
  const renderMyAvatar = (className?: string) => (
    <FamilyAvatar initials={me?.initials ?? userInitials} tone={me?.tone} imageUrl={currentUser.avatar_url} className={className} />
  );

  return (
    <div className="app-backdrop min-h-screen text-foreground">
      <aside className="sidebar app-enter-side fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-border/70 px-5 py-7 md:flex">
        <Link to="/" aria-label={`${familyName} home`} className="flex min-w-0 items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <HeartPulse size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate font-sans text-[17px] font-bold leading-[1.15]">{familyName}</span>
        </Link>

        <div className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Care space
        </div>
        <SidebarNav items={navigation} />

        <div className="mt-auto border-t border-border pt-3">
          {/* Opens profile settings, the same as the picture in the top bar. */}
          <button type="button" onClick={() => setIsProfileOpen(true)} aria-label={`Profile settings for ${currentUser.name}`} className="profile-chip flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="profile-chip-avatar flex shrink-0">{renderMyAvatar()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{currentUser.name}</span>
              <span className="block text-xs text-muted-foreground">{me?.role ?? "Family member"}</span>
            </span>
            <Settings size={16} aria-hidden="true" className="profile-chip-cog shrink-0 text-muted-foreground" />
          </button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="app-enter-top relative z-20 flex h-[72px] items-center justify-between border-b border-border/60 bg-white/55 px-5 shadow-sm shadow-foreground/[0.02] backdrop-blur-md md:justify-end md:px-8">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <HeartPulse size={20} className="text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">{familyName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsMenu notifications={notifications.visible} onDismiss={notifications.dismiss} onDismissAll={notifications.dismissAll} />
            <ProfileMenu
              name={currentUser.name}
              email={currentUser.email}
              avatar={renderMyAvatar()}
              onOpenSettings={() => setIsProfileOpen(true)}
              onSignOut={onSignOut}
            />
          </div>
        </header>
        <main className="app-enter-main custom-scrollbar mx-auto h-[calc(100vh-72px)] max-w-7xl overflow-y-auto px-5 py-6 pb-24 md:px-8 md:py-8">
          {care.actionError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-lg bg-alert/10 px-4 py-3 text-sm text-alert">
              <span>{care.actionError}</span>
              <button type="button" onClick={care.clearActionError} className="shrink-0 font-semibold link-underline">Dismiss</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={overview} />
            <Route path="/tasks" element={<CarePlanPage care={care} currentUser={currentUser} />} />
            <Route path="/appointments" element={<AppointmentsPage care={care} />} />
            <Route path="/circle" element={<CareCirclePage care={care} family={family} currentUser={currentUser} />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/activity" element={<ActivityPage care={care} />} />
            <Route path="*" element={overview} />
          </Routes>
        </main>
        {isProfileOpen && (
          <ProfileSettingsDialog
            currentUser={currentUser}
            member={me}
            onClose={() => setIsProfileOpen(false)}
            onSaved={async (user) => {
              onUserUpdated(user);
              // Refresh the member list so the new name and picture show everywhere.
              await care.reload();
            }}
          />
        )}
      </div>
      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {navigation.map(({ to, mobileLabel, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[10px] font-medium leading-tight ${isActive ? "text-primary" : "text-muted-foreground"}`
            }
          >
            <Icon size={19} aria-hidden="true" />
            {mobileLabel}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function PageHeading({ title, eyebrow, description, showDetails = false }: { title: string; eyebrow?: string; description?: string; showDetails?: boolean }) {
  return (
    <div className="mb-8">
      {showDetails && eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>}
      <h1 className={`${showDetails ? "mt-2 " : ""}font-display text-3xl font-semibold tracking-tight md:text-4xl`}>{title}</h1>
      {showDetails && description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

function countActiveTasks(tasks: readonly CareTask[], memberId: string) {
  return tasks.filter((task) => !task.complete && task.assigneeId === memberId).length;
}

function getUpcomingAppointments(appointments: readonly CareAppointment[]) {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return appointments.filter((appointment) => new Date(appointment.startsAt).getTime() >= startOfToday);
}

function OverviewPage({ care, currentUser }: { care: CareData; currentUser: AuthUser }) {
  const { tasks, members } = care;
  const activeTasks = tasks.filter((task) => !task.complete);
  const attentionTasks = activeTasks.filter((task) => task.attention);
  const unassignedTasks = activeTasks.filter((task) => task.assigneeId === null);
  const myTasks = activeTasks.filter((task) => task.assigneeId === currentUser.id);
  const upcomingAppointments = getUpcomingAppointments(care.appointments);
  const maxWorkload = Math.max(1, ...members.map((member) => countActiveTasks(tasks, member.id)));
  const firstName = currentUser.name.trim().split(/\s+/)[0];
  const now = new Date();

  return (
    <>
      <PageHeading showDetails eyebrow={formatLongDate(now)} title={`Good ${partOfDay(now)}, ${firstName}`} />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Care summary">
        <SummaryTile order={0} to="/tasks" icon={ClipboardList} label="Active tasks" value={activeTasks.length} tone="bg-primary text-primary-foreground shadow-primary/30" />
        <SummaryTile order={1} to="/appointments" icon={CalendarDays} label="Appointments" value={upcomingAppointments.length} tone="bg-amber-400 text-amber-950 shadow-amber-400/40" />
        <SummaryTile order={2} to="/tasks?filter=Unassigned" icon={UserRound} label="Unassigned" value={unassignedTasks.length} tone="bg-sky-600 text-white shadow-sky-600/30" />
        <SummaryTile order={3} to="/tasks?filter=Needs%20attention" icon={AlertTriangle} label="Needs attention" value={attentionTasks.length} tone="bg-alert text-white shadow-alert/30" />
      </section>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)]">
        <div className="space-y-6">
          {/* The plan lists my tasks in its suggested order, so a separate list is only needed when I have none. */}
          {myTasks.length > 0 ? <DayPlanCard tasks={myTasks} /> : (
            <OverviewCard title="My tasks" to="/tasks" linkLabel="All tasks">
              <EmptyNote>Nothing is assigned to you.</EmptyNote>
            </OverviewCard>
          )}

          <OverviewCard title="Upcoming" to="/appointments" linkLabel="All appointments">
            <div className="stagger divide-y divide-border">
              {upcomingAppointments.slice(0, 3).map((appointment) => {
                const where = [appointment.place, appointment.person && `with ${appointment.person}`].filter(Boolean).join(" · ");
                return (
                <article key={appointment.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{appointment.title}</h3>
                    {where && <p className="mt-0.5 truncate text-xs text-muted-foreground">{where}</p>}
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-right text-sm font-medium text-muted-foreground">{appointment.date} · {appointment.time}</p>
                </article>
                );
              })}
            </div>
            {upcomingAppointments.length === 0 && <EmptyNote>No upcoming appointments.</EmptyNote>}
          </OverviewCard>
        </div>

        <div className="space-y-6">
          <OverviewCard title="Family" to="/circle" linkLabel="View family" iconOnlyLink>
            <div className="stagger space-y-4 pt-1">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{member.firstName}</p>
                    <FamilyWorkloadBar name={member.name} activeTasks={countActiveTasks(tasks, member.id)} maxTasks={maxWorkload} />
                  </div>
                </div>
              ))}
            </div>
          </OverviewCard>
          <ActivityCard activity={care.activity.slice(0, 4)} members={members} to="/activity" />
        </div>
      </div>
    </>
  );
}

/** A plain titled card for the overview: one heading, one optional link, no eyebrow text. */
function OverviewCard({ title, to, linkLabel, iconOnlyLink = false, children }: { title: string; to: string; linkLabel: string; iconOnlyLink?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <Link to={to} aria-label={iconOnlyLink ? linkLabel : undefined} className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {!iconOnlyLink && linkLabel}<ArrowRight size={15} aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="pt-1">{children}</CardContent>
    </Card>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}

function SummaryTile({ to, icon: Icon, label, value, tone, order }: { to: string; icon: typeof CalendarDays; label: string; value: number; tone: string; order: number }) {
  // The wrapper does the scroll reveal so the link keeps its own hover and press transitions.
  const ref = useReveal<HTMLDivElement>();
  return (
    // Each tile follows the one before it as the row comes into view.
    <div ref={ref} className="reveal" style={{ "--reveal-delay": `${order * 70}ms` } as React.CSSProperties}>
      <Link
        to={to}
        className="card-lift flex h-full items-center gap-4 rounded-2xl border border-border/60 bg-white/90 p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
      >
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl shadow-md ${tone}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-3xl font-semibold leading-none"><CountUp value={value} /></p>
          <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
        </div>
      </Link>
    </div>
  );
}

function FamilyWorkloadBar({ name, activeTasks, maxTasks }: { name: string; activeTasks: number; maxTasks: number }) {
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${name} active tasks`}
        aria-valuemin={0}
        aria-valuemax={maxTasks}
        aria-valuenow={activeTasks}
        aria-valuetext={`${activeTasks} active tasks`}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="bar-fill h-full rounded-full bg-primary" style={{ width: `${(activeTasks / maxTasks) * 100}%` }} />
      </div>
      <span className="w-4 text-right text-xs font-semibold tabular-nums text-muted-foreground">{activeTasks}</span>
    </div>
  );
}

function CarePlanPage({ care, currentUser }: { care: CareData; currentUser: AuthUser }) {
  const { tasks, members } = care;
  const [searchParams] = useSearchParams();
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
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const recommendationTask = tasks.find((task) => task.id === recommendationTaskId);

  const toggleTask = (task: CareTask) => task.complete ? care.reopenTask(task.id) : care.completeTask(task.id);

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
    setNewTaskRecurrence(null);
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
  const riskEvaluatedAt = new Date();
  const riskAssessments = new Map(tasks.map((task) => [
    task.id,
    mockTaskRiskAssessment(task, tasks, members, riskEvaluatedAt),
  ]));
  const filterTasks = (filter: TaskFilter) => {
    switch (filter) {
      case "My Tasks": return tasks.filter((task) => task.assigneeId === currentUser.id && !task.complete);
      case "Unassigned": return tasks.filter((task) => task.assigneeId === null && !task.complete);
      case "Needs attention": return tasks.filter((task) => Boolean(task.attention) && !task.complete);
      case "Completed": return tasks.filter((task) => task.complete);
      default: return tasks.filter((task) => !task.complete);
    }
  };

  const countForFilter = (filter: TaskFilter) => filterTasks(filter).length;
  const visibleTasks = filterTasks(activeFilter);
  const canFilterTasks = activeFilter !== "Completed";
  const filteredTasks = canFilterTasks ? visibleTasks.filter((task) => {
    if (priorityFilter !== "All priorities" && task.priority !== priorityFilter) return false;
    if (assigneeFilter !== "All assignees" && (task.assigneeId ?? "Unassigned") !== assigneeFilter) return false;
    if (atRiskOnly && (riskAssessments.get(task.id)?.reasons.length ?? 0) === 0) return false;
    return true;
  }) : visibleTasks;
  const sortedTasks = [...filteredTasks].sort((first, second) => {
    const firstAtRisk = (riskAssessments.get(first.id)?.reasons.length ?? 0) > 0;
    const secondAtRisk = (riskAssessments.get(second.id)?.reasons.length ?? 0) > 0;
    if (firstAtRisk !== secondAtRisk) return firstAtRisk ? -1 : 1;
    if (first.complete !== second.complete) return first.complete ? 1 : -1;
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
      <PageHeading title="Tasks" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{tasks.filter((task) => !task.complete).length} active · {tasks.filter((task) => task.complete).length} completed</p>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:inline-flex"><UsersRound size={15} aria-hidden="true" />Shared with {members.length} family {members.length === 1 ? "member" : "members"}</span>
          <Button size="sm" variant="outline" aria-expanded={isImportingDocument} onClick={() => setIsImportingDocument((current) => !current)}><FileText size={15} aria-hidden="true" />From a document</Button>
          <Button size="sm" onClick={() => { clearDraft(); setIsCreatingTask((current) => !current); }}><Plus size={15} aria-hidden="true" />New task</Button>
        </div>
      </div>
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
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${newTaskPriority === priority ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
                      className={`rounded-md px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${newTaskRecurrence === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
          onAssign={(memberId) => {
            void care.assignTask(recommendationTask.id, memberId);
            setRecommendationTaskId(null);
          }}
        />
      )}
      <div role="tablist" aria-label="Filter care tasks" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1">
        {filterOptions.map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter}
            aria-controls="tasks-panel"
            onClick={() => setActiveFilter(filter)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeFilter === filter ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {filter}<span className="text-xs opacity-70">{countForFilter(filter)}</span>
          </button>
        ))}
      </div>
      <Card className="overflow-hidden" aria-label={`${activeFilter} tasks`}>
        {canFilterTasks && (
          <div className="border-b border-border">
            <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2">
              <span className="text-xs text-muted-foreground">{sortedTasks.length} of {visibleTasks.length} tasks</span>
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={isTaskFiltersExpanded}
                aria-controls="all-task-filters"
                onClick={() => setIsTaskFiltersExpanded((expanded) => !expanded)}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />Filters
                {activeTaskFilterCount > 0 && <Badge variant="secondary" className="px-1.5 py-1 text-[10px]">{activeTaskFilterCount}</Badge>}
              </Button>
            </div>
            {isTaskFiltersExpanded && (
              <div id="all-task-filters" className="grid gap-3 bg-muted/30 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(130px,1fr)_minmax(130px,1fr)_minmax(150px,1fr)_auto_auto] xl:items-end">
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
                  <input type="checkbox" checked={atRiskOnly} onChange={(event) => setAtRiskOnly(event.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                  At risk only
                </label>
                <Button size="sm" variant="outline" disabled={!hasTaskFilters} onClick={() => { setPriorityFilter("All priorities"); setAssigneeFilter("All assignees"); setAtRiskOnly(false); setDueSortDirection("earliest"); }}><RotateCcw size={14} aria-hidden="true" />Clear filters</Button>
              </div>
            )}
          </div>
        )}
        <div className="hidden grid-cols-[minmax(240px,1.6fr)_minmax(225px,1.35fr)_minmax(145px,1fr)_minmax(100px,0.8fr)] gap-3 border-b border-border bg-muted/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground xl:grid">
          <span>Task and recipient</span><span>Assignment</span><span>Due</span><span>Priority</span>
        </div>
        <div id="tasks-panel" role="tabpanel" className="stagger divide-y divide-border">
          {sortedTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              members={members}
              riskAssessment={riskAssessments.get(task.id)}
              onToggle={() => void toggleTask(task)}
              onAssign={(assigneeId) => void care.assignTask(task.id, assigneeId)}
              onOpen={() => setSelectedTaskId(task.id)}
            />
          ))}
          {sortedTasks.length === 0 && <p className="px-5 py-12 text-center text-sm text-muted-foreground">No tasks match these filters.</p>}
        </div>
      </Card>
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          members={members}
          activity={selectedTask.activity}
          onClose={() => setSelectedTaskId(null)}
          onReassign={(assigneeId) => void care.assignTask(selectedTask.id, assigneeId)}
          onStopRepeating={() => void care.stopRepeating(selectedTask.id)}
          onSave={(changes) => care.updateTask(selectedTask.id, changes)}
          onComplete={() => void toggleTask(selectedTask)}
        />
      )}
    </>
  );
}

type TaskFilter = "All" | "My Tasks" | "Unassigned" | "Needs attention" | "Completed";

/** Select value meaning "return this task to the unassigned queue". */
const unassignValue = "unassign";

function TaskListItem({
  task,
  members,
  riskAssessment,
  onToggle,
  onAssign,
  onOpen,
}: {
  task: CareTask;
  members: readonly FamilyMember[];
  riskAssessment?: TaskRiskAssessment;
  onToggle: () => void;
  onAssign: (assigneeId: string | null) => void;
  onOpen: () => void;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [chosenAssignee, setChosenAssignee] = useState("");
  const suggestedMember = riskAssessment?.suggestedMember;
  const assignee = members.find((member) => member.id === task.assigneeId);
  const otherMembers = members.filter((member) => member.id !== task.assigneeId);
  const isUnassigned = task.assigneeId === null;
  // Preselect the suggestion, so one click on Assign/Reassign accepts it.
  const selectedOwner = chosenAssignee || suggestedMember?.id || otherMembers[0]?.id || "";
  const selectedOwnerName = selectedOwner === unassignValue ? "no one" : members.find((member) => member.id === selectedOwner)?.firstName ?? "";
  const closeAssigning = () => {
    setIsAssigning(false);
    setChosenAssignee("");
  };
  const isAtRisk = !task.complete && (riskAssessment?.reasons.length ?? 0) > 0;

  return (
    // Clicking anywhere on the row opens the task. The tick and the assignee control keep their own clicks,
    // and the title is a real button so the task can also be opened from the keyboard.
    <article
      onClick={onOpen}
      className={`row-lift grid cursor-pointer gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(225px,1.35fr)_minmax(145px,1fr)_minmax(100px,0.8fr)] xl:items-center xl:px-5 ${isAtRisk ? "border-l-4 border-l-warning bg-warning/20 pl-3" : task.complete ? "bg-muted/30" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
          aria-label={`${task.complete ? "Reopen" : "Mark complete"}: ${task.title}`}
          aria-pressed={task.complete}
          className={`task-check flex size-5 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${task.complete ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary"}`}
        >
          {/* Always present, so the tick can draw itself when the task is completed. */}
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} aria-haspopup="dialog" data-done={task.complete} className="task-title min-w-0 text-left text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {task.title}
        </button>
      </div>
      {/* Clicks here choose an assignee, so they do not also open the task. */}
      <div className="min-w-0 text-xs text-muted-foreground" onClick={(event) => event.stopPropagation()}>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] xl:hidden">Assigned to</span>
        {isAssigning && !task.complete ? (
          <div className="rounded-lg bg-primary/5 p-2">
            {suggestedMember && <p className="mb-1.5 truncate text-[11px] font-semibold text-primary">Suggested: {suggestedMember.firstName}</p>}
            <div className="flex items-center gap-1.5">
              <select
                autoFocus
                aria-label={`Choose assignee for ${task.title}`}
                value={selectedOwner}
                onChange={(event) => setChosenAssignee(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {otherMembers.map((member) => <option key={member.id} value={member.id}>{member.firstName}</option>)}
                {!isUnassigned && <option value={unassignValue}>Unassigned</option>}
              </select>
              <Button
                size="sm"
                aria-label={`${isUnassigned ? "Assign" : "Reassign"} ${task.title} to ${selectedOwnerName}`}
                disabled={!selectedOwner}
                onClick={() => { onAssign(selectedOwner === unassignValue ? null : selectedOwner); closeAssigning(); }}
              >
                {isUnassigned ? "Assign" : "Reassign"}
              </Button>
              <button type="button" aria-label="Cancel" title="Cancel" onClick={closeAssigning} className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={task.complete}
            onClick={() => setIsAssigning(true)}
            aria-label={isUnassigned ? `Assign ${task.title}` : `${task.title} is assigned to ${assignee?.firstName ?? task.owner}. Change assignee`}
            className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {assignee
              ? <FamilyAvatar initials={assignee.initials.slice(0, 1)} tone={assignee.tone} imageUrl={assignee.avatarUrl} className="size-7" />
              : <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-xs">?</span>}
            <span className={`min-w-0 flex-1 truncate text-sm ${isUnassigned ? "text-muted-foreground" : "text-foreground"}`}>{assignee?.firstName ?? task.owner}</span>
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

function TaskDetailDialog({
  task,
  members,
  activity,
  onClose,
  onReassign,
  onStopRepeating,
  onSave,
  onComplete,
}: {
  task: CareTask;
  members: readonly FamilyMember[];
  activity: TaskActivity[];
  onClose: () => void;
  onReassign: (assigneeId: string) => void;
  onStopRepeating: () => void;
  onSave: (changes: TaskChanges) => Promise<boolean | undefined>;
  onComplete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState(task.assigneeId ?? "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const assignedMember = members.find((member) => member.id === task.assigneeId);
  const isOverdue = !task.complete && task.attention === "Overdue";
  // Shown only when the task is for someone in particular.
  const recipient = task.recipient && task.recipient !== "Shared household" ? task.recipient : null;

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
          {assignedMember
            ? <FamilyAvatar initials={assignedMember.initials} tone={assignedMember.tone} imageUrl={assignedMember.avatarUrl} className="size-10" />
            : <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-sm text-muted-foreground">?</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{assignedMember?.name ?? "Unassigned"}</p>
            <p className="text-xs text-muted-foreground">{task.complete ? "Completed" : assignedMember ? assignedMember.role : "Needs someone to take it"}</p>
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
          {recipient && (
            <li className="flex items-center gap-2.5">
              <UserRound size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span>For {recipient}</span>
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
              <Button size="sm" variant="outline" aria-expanded={isReassigning} onClick={() => { setSelectedOwner(task.assigneeId ?? ""); setIsReassigning((current) => !current); }}>{assignedMember ? "Reassign" : "Assign"}</Button>
            )}
            {!task.complete && <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}><Pencil size={14} aria-hidden="true" />Edit</Button>}
          </div>
          {isReassigning && !task.complete && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/50 p-3 sm:flex-row">
              <label className="sr-only" htmlFor={`reassign-task-${task.id}`}>Assign to family member</label>
              <select
                id={`reassign-task-${task.id}`}
                value={selectedOwner}
                onChange={(event) => setSelectedOwner(event.target.value)}
                className="min-h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select a family member</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <Button size="sm" disabled={!selectedOwner || selectedOwner === task.assigneeId} onClick={() => { onReassign(selectedOwner); setIsReassigning(false); }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsReassigning(false)}>Cancel</Button>
            </div>
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
  const [isSaving, setIsSaving] = useState(false);
  const inputClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    await onSave({ title: title.trim(), detail: detail.trim(), location: location.trim() || null, dueAt: hasDueDate ? localInputsToIso(date, time) : null, priority });
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
      {/* A repeating task counts from its due date, so it cannot be without one. */}
      {!task.recurrence && (
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
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${priority === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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

const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";

function AppointmentsPage({ care }: { care: CareData }) {
  const { members } = care;
  const upcomingAppointments = getUpcomingAppointments(care.appointments);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [date, setDate] = useState(() => getLocalDateInputValue());
  const [time, setTime] = useState("09:00");
  const [attendeeId, setAttendeeId] = useState("");

  const createAppointment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await care.createAppointment({
      title: title.trim(),
      place: place.trim() || undefined,
      startsAt: localInputsToIso(date, time),
      attendeeId: attendeeId || null,
    });
    if (!created) return;
    setTitle("");
    setPlace("");
    setAttendeeId("");
    setIsCreating(false);
  };

  return (
    <>
      <PageHeading title="Appointments" />
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setIsCreating((current) => !current)}><Plus size={15} aria-hidden="true" />New appointment</Button>
      </div>
      {isCreating && (
        <Card className="relative z-10 mb-5">
          <CardHeader><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Care calendar</p><h2 className="mt-1 font-display text-xl font-semibold">Add an appointment</h2></div></CardHeader>
          <CardContent>
            <form onSubmit={createAppointment} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Title
                <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClassName} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Place <span className="font-normal text-muted-foreground">(optional)</span>
                <input maxLength={160} value={place} onChange={(event) => setPlace(event.target.value)} className={fieldClassName} />
              </label>
              <div className="text-sm font-medium">
                <span id="new-appointment-date-label">Date</span>
                <DatePicker labelledBy="new-appointment-date-label" min={getLocalDateInputValue()} value={date} onChange={setDate} />
              </div>
              <div className="text-sm font-medium">
                <span id="new-appointment-time-label">Time</span>
                <TimePicker labelledBy="new-appointment-time-label" value={time} onChange={setTime} />
              </div>
              <label className="text-sm font-medium sm:col-span-2">Who is going <span className="font-normal text-muted-foreground">(optional)</span>
                <select value={attendeeId} onChange={(event) => setAttendeeId(event.target.value)} className={fieldClassName}>
                  <option value="">Not decided</option>
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
              <div className="flex items-end justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                <Button type="submit">Add appointment</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card className="px-5 md:px-7" aria-label="Upcoming appointments">
        <div className="flex items-center gap-3 border-b border-border py-5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"><CalendarDays size={19} aria-hidden="true" /></span>
          <div><h2 className="font-display text-lg font-semibold">Upcoming</h2><p className="text-xs text-muted-foreground">Today is {formatLongDate()}</p></div>
        </div>
        <div className="stagger divide-y divide-border">
          {upcomingAppointments.map((appointment) => (
            <div key={appointment.id} className="grid gap-3 py-5 sm:grid-cols-[92px_1fr_auto] sm:items-center">
              <p className="text-sm font-semibold text-primary">{appointment.date}<span className="block text-foreground">{appointment.time}</span></p>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Stethoscope size={17} aria-hidden="true" /></span>
                <div><h3 className="text-sm font-semibold">{appointment.title}</h3>{appointment.place && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={13} aria-hidden="true" />{appointment.place}</p>}</div>
              </div>
              <div className="flex items-center gap-2">
                {appointment.person && <Badge variant="secondary">{appointment.person} is going</Badge>}
                <Button size="sm" variant="ghost" aria-label={`Remove ${appointment.title}`} onClick={() => { if (window.confirm(`Remove “${appointment.title}”?`)) void care.deleteAppointment(appointment.id); }}>Remove</Button>
              </div>
            </div>
          ))}
          {upcomingAppointments.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No upcoming appointments.</p>}
        </div>
      </Card>
    </>
  );
}

function ActivityPage({ care }: { care: CareData }) {
  return (
    <>
      <PageHeading title="Activity" />
      <ActivityCard activity={care.activity} members={care.members} />
    </>
  );
}

function CareCirclePage({ care, family, currentUser }: { care: CareData; family: Family; currentUser: AuthUser }) {
  const { members, tasks } = care;
  const me = members.find((member) => member.id === currentUser.id);
  const isAdmin = family.myRole === "ADMIN";
  const [isEditing, setIsEditing] = useState(false);
  const [familyNameDraft, setFamilyNameDraft] = useState(family.name);
  const [roleDraft, setRoleDraft] = useState(me?.relationshipLabel ?? "");
  const [availabilityDraft, setAvailabilityDraft] = useState<Availability>(me?.availability ?? "Available");
  const [noteDraft, setNoteDraft] = useState(me?.availabilityNote ?? "");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isDeletingFamily, setIsDeletingFamily] = useState(false);
  const maxWorkload = Math.max(1, ...members.map((member) => countActiveTasks(tasks, member.id)));
  const detailsChanged = roleDraft.trim() !== (me?.relationshipLabel ?? "")
    || availabilityDraft !== (me?.availability ?? "Available")
    || noteDraft.trim() !== (me?.availabilityNote ?? "");

  const saveMyDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void care.updateMember(currentUser.id, {
      relationshipLabel: roleDraft.trim() || null,
      availability: availabilityDraft,
      availabilityNote: noteDraft.trim() || null,
    });
  };

  const copyInviteCode = async () => {
    if (!family.inviteCode) return;
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setInviteCopied(true);
    } catch {
      // Clipboard access can be blocked; the code stays visible to copy by hand.
    }
  };

  const removeMember = (member: FamilyMember) => {
    if (window.confirm(`Remove ${member.name} from ${family.name}? Their tasks will return to the unassigned queue.`)) {
      void care.removeMember(member.id);
    }
  };

  return (
    <>
      <PageHeading title="Family" />
      <Card>
        <CardHeader className="items-center">
          <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Family team</p><h2 className="mt-1 font-display text-xl font-semibold">Members</h2></div>
          <Button variant="outline" size="sm" onClick={() => setIsEditing((current) => !current)}>
            {isEditing ? "Done" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent className="pt-3">
          {isEditing && (
            <>
              {isAdmin && (
                <div className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="min-w-0 text-sm font-medium">Family name
                    <input maxLength={120} value={familyNameDraft} onChange={(event) => setFamilyNameDraft(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                  <Button type="button" size="sm" disabled={!familyNameDraft.trim() || familyNameDraft.trim() === family.name} onClick={() => void care.renameFamily(familyNameDraft.trim())}>Save family name</Button>
                </div>
              )}
              <form onSubmit={saveMyDetails} className="mb-5 grid gap-3 rounded-lg border border-border bg-muted/20 p-4 md:grid-cols-4">
                <p className="text-sm font-semibold md:col-span-4">Your details</p>
                <label className="text-sm font-medium">
                  Role
                  <input maxLength={80} placeholder="e.g. Daughter" value={roleDraft} onChange={(event) => setRoleDraft(event.target.value)} className={fieldClassName} />
                </label>
                <label className="text-sm font-medium">
                  Availability
                  <select value={availabilityDraft} onChange={(event) => setAvailabilityDraft(event.target.value as Availability)} className={fieldClassName}>
                    {availabilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium md:col-span-2">
                  Availability note <span className="font-normal text-muted-foreground">(optional)</span>
                  <input maxLength={200} placeholder="e.g. Available this evening" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} className={fieldClassName} />
                </label>
                <div className="flex justify-end md:col-span-4">
                  <Button type="submit" size="sm" disabled={!detailsChanged}>Save my details</Button>
                </div>
              </form>
            </>
          )}

          <div className="stagger divide-y divide-border">
          {members.map((member) => (
            <div key={member.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 sm:px-2">
              <div className="flex min-w-0 items-center gap-3">
                {isEditing && isAdmin && member.id !== currentUser.id && (
                  <button
                    type="button"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => removeMember(member)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-alert bg-alert/10 text-xs font-bold text-alert hover:bg-alert/20"
                  >
                    −
                  </button>
                )}
                <FamilyAvatar initials={member.initials} tone={member.tone} imageUrl={member.avatarUrl} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{member.name}{member.id === currentUser.id && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
                  <FamilyWorkloadBar name={member.name} activeTasks={countActiveTasks(tasks, member.id)} maxTasks={maxWorkload} />
                </div>
              </div>
            </div>
          ))}
          </div>
          {family.inviteCode && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground sm:px-2">
              <span>Invite code</span>
              <code className="font-mono tracking-widest text-foreground/80">{family.inviteCode}</code>
              <button type="button" onClick={() => void copyInviteCode()} className="font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {inviteCopied ? "Copied" : "Copy"}
              </button>
              <span className="basis-full sm:basis-auto">· Share it so someone with an account can join.</span>
            </p>
          )}
        </CardContent>
      </Card>
      <FamilyStats className="mt-6" members={members} tasks={tasks} />
      {isEditing && isAdmin && (
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => setIsDeletingFamily(true)} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-alert hover:bg-alert/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert">
            <Trash2 size={15} aria-hidden="true" />Delete family
          </button>
        </div>
      )}
      {isDeletingFamily && <DeleteFamilyDialog familyName={family.name} onDelete={care.deleteFamily} onClose={() => setIsDeletingFamily(false)} />}
    </>
  );
}

/** Asks for the family's name before deleting it, so it cannot happen by a stray click. */
function DeleteFamilyDialog({ familyName, onDelete, onClose }: { familyName: string; onDelete: (confirmName: string) => Promise<boolean | undefined>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typedName, setTypedName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const matches = typedName.trim().toLowerCase() === familyName.trim().toLowerCase();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matches) return;
    setIsDeleting(true);
    // On success the whole page is replaced by the create-or-join screen, so there is nothing left to close.
    if (!(await onDelete(typedName))) {
      setIsDeleting(false);
      dialogRef.current?.close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-family-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
    >
      <form onSubmit={submit} className="p-5 sm:p-7">
        <h2 id="delete-family-title" className="font-display text-2xl font-semibold">Delete {familyName}?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Every task, appointment and note is removed for everyone. This cannot be undone.</p>
        <label className="mt-5 block text-sm font-medium" htmlFor="delete-family-name">Type <span className="font-semibold">{familyName}</span> to confirm</label>
        <input id="delete-family-name" autoFocus autoComplete="off" value={typedName} onChange={(event) => setTypedName(event.target.value)} className={fieldClassName} />
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>Cancel</Button>
          <button type="submit" disabled={!matches || isDeleting} className="inline-flex h-10 items-center justify-center rounded-md bg-alert px-4 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg hover:shadow-alert/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
            {isDeleting ? "Deleting…" : "Delete family"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ActivityCard({ activity, members, to }: { activity: readonly FamilyActivityItem[]; members: readonly FamilyMember[]; to?: string }) {
  const rows = (
    <div className="space-y-4">
      {activity.map((item) => {
        const member = members.find((person) => person.id === item.actorId);
        return (
          <div key={item.id} className="flex gap-3">
            <FamilyAvatar initials={member?.initials.slice(0, 1) ?? item.person.slice(0, 1)} tone={member?.tone} imageUrl={member?.avatarUrl} className="size-8" />
            <div className="min-w-0 flex-1"><p className="text-xs leading-relaxed"><span className="font-semibold">{item.person}</span> {item.action} <span className="font-semibold">{item.subject}</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.time}</p></div>
          </div>
        );
      })}
      {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
    </div>
  );

  // On the overview this is a short preview that links to the full feed.
  if (to) return <OverviewCard title="Activity" to={to} linkLabel="All activity"><div className="pt-1">{rows}</div></OverviewCard>;

  return (
    <Card>
      <CardHeader><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Latest family updates</p><h2 className="mt-1 font-display text-xl font-semibold">Family activity</h2></div><ActivityIcon size={18} className="mt-1 text-primary" aria-hidden="true" /></CardHeader>
      <CardContent className="pt-4">{rows}</CardContent>
    </Card>
  );
}

export default function App() {
  return <AppShell />;
}
