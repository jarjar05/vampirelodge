import { useEffect, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  HeartPulse,
  Home,
  MapPin,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Stethoscope,
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
import { FamilyAssignmentSuggestion } from "@/components/family-assignment-suggestion";
import { NotificationsMenu, ProfileMenu } from "@/components/header-menus";
import { ProfileSettingsDialog } from "@/components/profile-settings-dialog";
import { useCareData, type CareData } from "@/hooks/use-care-data";
import { formatLongDate, getLocalDateInputValue, localInputsToIso, partOfDay } from "@/lib/dates";
import { buildNotifications, useDismissibleNotifications } from "@/lib/notifications";
import { mockTaskRiskAssessment, taskRiskTagStyles, type TaskRiskAssessment } from "@/lib/task-risk";
import {
  availabilityOptions,
  type Availability,
  type CareAppointment,
  type CareTask,
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
    return <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Checking your session…</main>;
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
    return <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading your family…</main>;
  }

  if (care.status === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 text-center text-foreground">
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
    <div className="min-h-screen bg-background text-foreground">
      <aside className="sidebar fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-border/70 px-5 py-7 md:flex">
        <Link to="/" aria-label={`${familyName} home`} className="flex min-w-0 items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <HeartPulse size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate font-sans text-[17px] font-bold leading-[1.15]">{familyName}</span>
        </Link>

        <div className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Care space
        </div>
        <nav aria-label="Main navigation" className="mt-3 space-y-1.5">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 font-semibold text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`
              }
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-border px-2 pt-5">
          {renderMyAvatar()}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentUser.name}</p>
            <p className="text-xs text-muted-foreground">{me?.role ?? "Family member"}</p>
          </div>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="relative z-20 flex h-[72px] items-center justify-between border-b border-border/60 bg-white/55 px-5 shadow-sm shadow-foreground/[0.02] backdrop-blur-md md:justify-end md:px-8">
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
        <main className="custom-scrollbar mx-auto h-[calc(100vh-72px)] max-w-7xl overflow-y-auto px-5 py-6 pb-24 md:px-8 md:py-8">
          {care.actionError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-lg bg-alert/10 px-4 py-3 text-sm text-alert">
              <span>{care.actionError}</span>
              <button type="button" onClick={care.clearActionError} className="shrink-0 font-semibold hover:underline">Dismiss</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={overview} />
            <Route path="/tasks" element={<CarePlanPage care={care} currentUser={currentUser} />} />
            <Route path="/appointments" element={<AppointmentsPage care={care} />} />
            <Route path="/circle" element={<CareCirclePage care={care} family={family} currentUser={currentUser} />} />
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
        <SummaryTile to="/tasks" icon={ClipboardList} label="Active tasks" value={activeTasks.length} tone="bg-primary/10 text-primary" />
        <SummaryTile to="/appointments" icon={CalendarDays} label="Appointments" value={upcomingAppointments.length} tone="bg-secondary text-secondary-foreground" />
        <SummaryTile to="/tasks?filter=Unassigned" icon={UserRound} label="Unassigned" value={unassignedTasks.length} tone="bg-sky-100 text-sky-700" />
        <SummaryTile to="/tasks?filter=Needs%20attention" icon={AlertTriangle} label="Needs attention" value={attentionTasks.length} tone="bg-accent text-accent-foreground" />
      </section>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)]">
        <div className="space-y-6">
          <OverviewCard title="My tasks" to="/tasks" linkLabel="All tasks">
            <div className="divide-y divide-border">
              {myTasks.slice(0, overviewListLimit).map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
            {myTasks.length === 0 && <EmptyNote>Nothing is assigned to you.</EmptyNote>}
            {myTasks.length > overviewListLimit && <p className="pt-3 text-xs text-muted-foreground">+{myTasks.length - overviewListLimit} more</p>}
          </OverviewCard>

          <OverviewCard title="Upcoming" to="/appointments" linkLabel="All appointments">
            <div className="divide-y divide-border">
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
            <div className="space-y-4 pt-1">
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

const overviewListLimit = 5;

/** A plain titled card for the overview: one heading, one optional link, no eyebrow text. */
function OverviewCard({ title, to, linkLabel, iconOnlyLink = false, children }: { title: string; to: string; linkLabel: string; iconOnlyLink?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <Link to={to} aria-label={iconOnlyLink ? linkLabel : undefined} className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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

function SummaryTile({ to, icon: Icon, label, value, tone }: { to: string; icon: typeof CalendarDays; label: string; value: number; tone: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-2xl border border-border/60 bg-white/85 p-4 shadow-sm backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </Link>
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
        <div className="h-full rounded-full bg-primary" style={{ width: `${(activeTasks / maxTasks) * 100}%` }} />
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
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetail, setNewTaskDetail] = useState("");
  const [newTaskLocation, setNewTaskLocation] = useState("");
  const [newTaskDate, setNewTaskDate] = useState(() => getLocalDateInputValue());
  const [newTaskTime, setNewTaskTime] = useState("18:00");
  const [newTaskPriority, setNewTaskPriority] = useState<CareTask["priority"]>("Normal");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const recommendationTask = tasks.find((task) => task.id === recommendationTaskId);

  const toggleTask = (task: CareTask) => task.complete ? care.reopenTask(task.id) : care.completeTask(task.id);

  const createTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await care.createTask({
      title: newTaskTitle.trim(),
      detail: newTaskDetail.trim(),
      location: newTaskLocation.trim() || undefined,
      dueAt: localInputsToIso(newTaskDate, newTaskTime),
      priority: newTaskPriority,
    });
    if (!created) return;
    setRecommendationTaskId(created.id);
    setNewTaskPriority("Normal");
    setNewTaskTitle("");
    setNewTaskDetail("");
    setNewTaskLocation("");
    setNewTaskDate(getLocalDateInputValue());
    setNewTaskTime("18:00");
    setIsCreatingTask(false);
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
          <Button size="sm" onClick={() => setIsCreatingTask((current) => !current)}><Plus size={15} aria-hidden="true" />New task</Button>
        </div>
      </div>
      {isCreatingTask && (
        <Card className="relative z-10 mb-5">
          <CardHeader><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Household delegation</p><h2 className="mt-1 font-display text-xl font-semibold">Create a task</h2></div></CardHeader>
          <CardContent>
            <form onSubmit={createTask} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Task title
                <input required maxLength={100} value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Details <span className="font-normal text-muted-foreground">(optional)</span>
                <input maxLength={180} value={newTaskDetail} onChange={(event) => setNewTaskDetail(event.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 font-normal focus:outline-none focus:ring-2 focus:ring-ring" />
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
              <div className="flex items-end justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setIsCreatingTask(false)}>Cancel</Button>
                <Button type="submit">Create task</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {recommendationTask && !recommendationTask.complete && (
        <FamilyAssignmentSuggestion
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
        <div id="tasks-panel" role="tabpanel" className="divide-y divide-border">
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
          canRespond={selectedTask.assigneeId === currentUser.id}
          onClose={() => setSelectedTaskId(null)}
          onAccept={() => void care.acceptTask(selectedTask.id)}
          onDecline={() => void care.declineTask(selectedTask.id)}
          onReassign={(assigneeId) => void care.assignTask(selectedTask.id, assigneeId)}
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
    <article className={`grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_minmax(225px,1.35fr)_minmax(145px,1fr)_minmax(100px,0.8fr)] xl:items-center xl:px-5 ${isAtRisk ? "border-l-4 border-l-warning bg-warning/20 pl-3" : task.complete ? "bg-muted/30" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${task.complete ? "Reopen" : "Mark complete"}: ${task.title}`}
          aria-pressed={task.complete}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${task.complete ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary"}`}
        >
          {task.complete && <Check size={12} aria-hidden="true" />}
        </button>
        <div className="min-w-0">
          <button type="button" onClick={onOpen} className="text-left text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {task.title}
          </button>
          <button type="button" onClick={onOpen} className="mt-1 block text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View details</button>
        </div>
      </div>
      <div className="min-w-0 text-xs text-muted-foreground">
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
        <span className="inline-flex items-center gap-1.5 text-foreground/80"><Clock3 size={14} aria-hidden="true" />{task.time}</span>
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

function TaskDetailDialog({
  task,
  members,
  activity,
  canRespond,
  onClose,
  onAccept,
  onDecline,
  onReassign,
  onComplete,
}: {
  task: CareTask;
  members: readonly FamilyMember[];
  activity: TaskActivity[];
  /** Only the assignee can accept or decline. */
  canRespond: boolean;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onReassign: (assigneeId: string) => void;
  onComplete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState(task.assigneeId ?? "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const assignedMember = members.find((member) => member.id === task.assigneeId);
  const isUnassigned = task.assigneeId === null;
  const isAccepted = task.status === "In progress" || task.complete;
  const stages = [
    { label: "Created", complete: true, time: activity.find((item) => item.action === "Created")?.time, state: "In care plan" },
    { label: "Assigned", complete: !isUnassigned, time: [...activity].reverse().find((item) => item.action === "Assigned" || item.action === "Reassigned")?.time, state: isUnassigned ? "Needs an owner" : `With ${assignedMember?.firstName ?? task.owner}` },
    { label: "Accepted", complete: isAccepted, time: [...activity].reverse().find((item) => item.action === "Accepted")?.time, state: isAccepted ? "Responsibility accepted" : "Awaiting acceptance" },
    { label: "Completed", complete: task.complete, time: [...activity].reverse().find((item) => item.action === "Completed")?.time, state: task.complete ? "Finished" : "Not completed" },
  ];
  const activeResponse = !isUnassigned && !task.complete;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="task-detail-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">Household delegation · Task view</p>
            <h2 id="task-detail-title" className="mt-2 font-display text-2xl font-semibold">{task.title}</h2>
            {task.detail && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{task.detail}</p>}
          </div>
          <button autoFocus type="button" aria-label="Close task details" onClick={() => dialogRef.current?.close()} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <section aria-label="Task responsibility" className="mt-5 flex flex-col gap-3 rounded-lg bg-primary/5 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {assignedMember ? <FamilyAvatar initials={assignedMember.initials} tone={assignedMember.tone} imageUrl={assignedMember.avatarUrl} className="size-11" /> : <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning/30 text-sm font-semibold text-warning-foreground">?</span>}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Assigned family member</p>
              <p className="mt-0.5 truncate text-base font-semibold">{assignedMember?.name ?? "Unassigned"}</p>
              {assignedMember && <p className="text-xs text-muted-foreground">{assignedMember.role}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <PriorityBadge priority={task.priority} />
          </div>
        </section>

        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-b border-border pb-5 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Delegation focus</dt><dd className="mt-1 font-medium">{task.recipient}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Due date &amp; time</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-medium"><Clock3 size={14} aria-hidden="true" />{task.time}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-medium"><MapPin size={14} aria-hidden="true" />{task.location || "Not specified"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="mt-1 font-medium">{task.category}</dd></div>
        </dl>

        <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section aria-labelledby="task-timeline-heading">
            <h3 id="task-timeline-heading" className="font-display text-lg font-semibold">Task timeline</h3>
            <ol className="mt-4 space-y-0">
              {stages.map((stage, index) => (
                <li key={stage.label} className="relative flex min-h-14 gap-3 pb-3 last:min-h-0 last:pb-0">
                  {index < stages.length - 1 && <span aria-hidden="true" className={`absolute left-[11px] top-6 h-8 border-l ${stage.complete ? "border-primary/50" : "border-border"}`} />}
                  <span className={`relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${stage.complete ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>
                    {stage.complete ? <Check size={13} aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div><p className={`text-sm font-semibold ${stage.complete ? "text-foreground" : "text-muted-foreground"}`}>{stage.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{stage.state}</p></div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{stage.complete ? stage.time ?? "Timestamp unavailable" : "—"}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="task-history-heading">
            <h3 id="task-history-heading" className="font-display text-lg font-semibold">Activity history</h3>
            <ol className="mt-3 divide-y divide-border border-y border-border">
              {[...activity].reverse().map((item) => (
                <li key={item.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3">
                  <p className="text-sm font-semibold">{item.actor}</p>
                  <time className="text-right text-[11px] text-muted-foreground">{item.time}</time>
                  <p className="col-span-2 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground/80">{item.action}.</span> {item.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section aria-label="Task actions" className="mt-6 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!activeResponse || !canRespond || isAccepted} onClick={onAccept}>Accept task</Button>
            <Button size="sm" variant="outline" disabled={!activeResponse || !canRespond} onClick={onDecline}>Decline task</Button>
            <Button size="sm" variant="outline" disabled={task.complete} onClick={() => { setSelectedOwner(task.assigneeId ?? ""); setIsReassigning((current) => !current); }}>Reassign</Button>
            <Button size="sm" variant={task.complete ? "outline" : "default"} onClick={onComplete}>{task.complete ? "Reopen task" : "Mark complete"}</Button>
          </div>
          {activeResponse && !canRespond && <p className="mt-2 text-xs text-muted-foreground">Only {assignedMember?.firstName ?? "the assignee"} can accept or decline this task.</p>}
          {isReassigning && (
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
              <Button size="sm" disabled={!selectedOwner || selectedOwner === task.assigneeId} onClick={() => { onReassign(selectedOwner); setIsReassigning(false); }}>Save assignment</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsReassigning(false)}>Cancel</Button>
            </div>
          )}
        </section>
      </div>
    </dialog>
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
        <div className="divide-y divide-border">
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

          <div className="divide-y divide-border">
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
                  <p className="text-xs text-muted-foreground">{member.role} · {member.availabilityNote ?? member.availability}</p>
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
              <button type="button" onClick={() => void copyInviteCode()} className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {inviteCopied ? "Copied" : "Copy"}
              </button>
              <span className="basis-full sm:basis-auto">· Share it so someone with an account can join.</span>
            </p>
          )}
        </CardContent>
      </Card>
    </>
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

function TaskRow({ task }: { task: CareTask }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <p className="min-w-0 truncate text-sm font-semibold">{task.title}</p>
      <span className={`shrink-0 whitespace-nowrap text-sm font-medium ${task.attention === "Overdue" ? "text-alert" : "text-muted-foreground"}`}>{task.time}</span>
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
