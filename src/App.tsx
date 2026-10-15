import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  BookOpen,
  CalendarRange,
  ClipboardList,
  Home,
  Moon,
  Sun,
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
import { TopNav } from "@/components/top-nav";
import { AskBar } from "@/components/ask-bar";
import { SceneBanner } from "@/components/scene-banner";
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
  const location = useLocation();
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
  // Each page has its own place in the header picture, in the menu's order; anything unknown shows the overview.
  const sceneIndex = Math.max(0, navigation.findIndex(({ to, end }) => (end ? location.pathname === to : location.pathname.startsWith(to))));
  const overview = <OverviewPage care={care} currentUser={currentUser} onUserUpdated={onUserUpdated} />;

  const userInitials = currentUser.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  // The signed-in user's picture, for the account menu in the top bar.
  const renderMyAvatar = (className?: string) => (
    <FamilyAvatar initials={me?.initials ?? userInitials} tone={me?.tone} imageUrl={currentUser.avatar_url} className={className} />
  );

  return (
    <div className="app-backdrop min-h-screen text-foreground">
      <header className="app-enter-top sticky top-0 z-20 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] max-w-[1200px] items-center gap-4 px-5 md:px-8 lg:gap-6">
          <Link to="/" aria-label={`${familyName} home`} className="flex min-w-[2.75rem] shrink items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden="true" className="brand-mark grid size-9 shrink-0 place-items-center rounded-xl text-base xl:hidden">☀</span>
            <FamilyName name={familyName ?? ""} />
          </Link>
          <TopNav items={navigation} />
          <span className="flex-1" />
          <div className="flex shrink-0 items-center gap-2.5">
            <AskBar tasks={care.tasks} />
            <ThemeButton />
            <NotificationsMenu notifications={notifications.visible} onDismiss={notifications.dismiss} onDismissAll={notifications.dismissAll} />
            <ProfileMenu
              name={currentUser.name}
              email={currentUser.email}
              avatar={renderMyAvatar("size-[42px] text-[13px]")}
              onOpenSettings={() => setIsProfileOpen(true)}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </header>
      <main className="app-enter-main mx-auto max-w-[1200px] px-5 pt-2 pb-32 md:px-8 lg:pb-24">
        {care.actionError && (
          <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-2xl bg-alert/10 px-4 py-3 text-sm text-alert">
            <span>{care.actionError}</span>
            <button type="button" onClick={care.clearActionError} className="shrink-0 font-semibold link-underline">Dismiss</button>
          </div>
        )}
        <SceneBanner sceneIndex={sceneIndex}>
        <Routes>
          <Route path="/" element={overview} />
          <Route path="/tasks" element={<CarePlanPage care={care} currentUser={currentUser} />} />
          <Route path="/calendar" element={<CalendarPage care={care} />} />
          <Route path="/circle" element={<CareCirclePage care={care} family={family} currentUser={currentUser} />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/activity" element={<ActivityPage care={care} />} />
          <Route path="*" element={overview} />
        </Routes>
        </SceneBanner>
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
      <BottomNav />
    </div>
  );
}

/** The family's name in the journal's serif, with its main word in clay, e.g. "the *Suanni* family". */
function FamilyName({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  // The first word that is not a small one like "the" is the family's own name.
  const accent = words.findIndex((word) => !/^(the|a|an|of|and|&)$/i.test(word));
  return (
    <span className="truncate font-display text-[19px] font-bold leading-tight lg:text-xl">
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className={index === accent ? "text-primary" : undefined}>{index > 0 ? " " : ""}{word}</span>
      ))}
    </span>
  );
}

/** Switches between the daytime and evening looks. Remembered in this browser; until then it follows the device. */
function ThemeButton() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const next = theme === "dark" ? "light" : "dark";
  // Every colour fades to the new look on its own (see the @property rules in index.css), with everything still moving.
  const choose = () => {
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("lodge-theme", next); } catch { /* not remembered */ }
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={choose}
      aria-label={next === "dark" ? "Switch to dark mode" : "Switch to light mode"}
      title={next === "dark" ? "Dark mode" : "Light mode"}
      className="round-button grid size-[42px] shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === "dark" ? <Sun size={18} aria-hidden="true" className="theme-icon" /> : <Moon size={18} aria-hidden="true" className="theme-icon" />}
    </button>
  );
}

/** The menu along the bottom on small screens. A bar along its top edge glides to the current page. */
function BottomNav() {
  const location = useLocation();
  const activeIndex = navigation.findIndex(({ to, end }) => (end ? location.pathname === to : location.pathname.startsWith(to)));
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
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
