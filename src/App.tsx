import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  BookOpen,
  CalendarRange,
  ClipboardList,
  HeartPulse,
  Home,
  Settings,
  UsersRound,
} from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LoginPage, type AuthUser } from "@/components/auth/login-page";
import { FamilySetup } from "@/components/family/family-setup";
import { FamilyAvatar } from "@/components/family-avatar";
import { CalendarPage } from "@/pages/calendar-page";
import { NotificationsMenu, ProfileMenu } from "@/components/header-menus";
import { ProfileSettingsDialog } from "@/components/profile-settings-dialog";
import { SidebarNav } from "@/components/sidebar-nav";
import { useCareData } from "@/hooks/use-care-data";
import { buildNotifications, useDismissibleNotifications } from "@/lib/notifications";
import { KnowledgePage } from "@/pages/knowledge-page";
import { OverviewPage } from "@/pages/overview-page";
import { CarePlanPage } from "@/pages/tasks-page";
import { CareCirclePage } from "@/pages/family-page";
import { ActivityPage } from "@/pages/activity-page";

const navigation = [
  { to: "/", label: "Overview", mobileLabel: "Home", icon: Home, end: true },
  { to: "/tasks", label: "Tasks", mobileLabel: "Tasks", icon: ClipboardList, end: false },
  { to: "/calendar", label: "Calendar", mobileLabel: "Calendar", icon: CalendarRange, end: false },
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
  const notifications = useDismissibleNotifications(buildNotifications(care.tasks, currentUser.id), currentUser.id);
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
  const overview = <OverviewPage care={care} currentUser={currentUser} onUserUpdated={onUserUpdated} />;

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
        <main className="app-enter-main custom-scrollbar mx-auto h-[calc(100vh-72px)] max-w-7xl overflow-y-auto overflow-x-hidden px-5 py-6 pb-24 md:px-8 md:py-8">
          {care.actionError && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-lg bg-alert/10 px-4 py-3 text-sm text-alert">
              <span>{care.actionError}</span>
              <button type="button" onClick={care.clearActionError} className="shrink-0 font-semibold link-underline">Dismiss</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={overview} />
            <Route path="/tasks" element={<CarePlanPage care={care} currentUser={currentUser} />} />
            <Route path="/calendar" element={<CalendarPage members={care.members} tasks={care.tasks} />} />
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
      <BottomNav />
    </div>
  );
}

/** The menu along the bottom on small screens. A bar along its top edge glides to the current page. */
function BottomNav() {
  const location = useLocation();
  const activeIndex = navigation.findIndex(({ to, end }) => (end ? location.pathname === to : location.pathname.startsWith(to)));
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <span
        aria-hidden="true"
        className="bottom-nav-bar absolute left-1 top-0 h-0.5 rounded-full bg-primary"
        style={{ width: `calc((100% - 0.5rem) / ${navigation.length})`, translate: `${Math.max(activeIndex, 0) * 100}% 0`, opacity: activeIndex < 0 ? 0 : 1 }}
      />
      <div className="flex">
        {navigation.map(({ to, mobileLabel, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `bottom-nav-item flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-0.5 text-[10px] font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`
            }
          >
            <span className="bottom-nav-icon grid h-7 w-11 place-items-center rounded-full"><Icon size={19} aria-hidden="true" /></span>
            <span className="truncate">{mobileLabel}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  return <AppShell />;
}
