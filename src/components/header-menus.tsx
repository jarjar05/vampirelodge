import type { ReactNode } from "react";
import { Bell, LogOut, Settings, X } from "lucide-react";
import { Link } from "react-router-dom";
import { usePopover } from "@/hooks/use-popover";
import type { CareNotification } from "@/lib/notifications";

const panelClassName = "absolute right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-lg";

const toneDots: Record<CareNotification["tone"], string> = {
  alert: "bg-alert",
  warning: "bg-secondary-foreground",
  info: "bg-primary",
};

export function NotificationsMenu({
  notifications,
  onDismiss,
  onDismissAll,
}: {
  notifications: readonly CareNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}) {
  const { isOpen, containerRef, toggle, close } = usePopover();
  const count = notifications.length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={count === 0 ? "Notifications, none" : `Notifications, ${count} ${count === 1 ? "item" : "items"}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Notifications"
        className={`relative flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isOpen ? "bg-muted text-foreground" : "text-muted-foreground"}`}
      >
        <Bell size={18} aria-hidden="true" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-alert px-1 text-[10px] font-bold leading-4 text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className={`${panelClassName} w-80 max-w-[calc(100vw-2.5rem)]`}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {count > 1 && <button type="button" onClick={onDismissAll} className="rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Clear all</button>}
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
          ) : (
            <ul className="custom-scrollbar max-h-80 divide-y divide-border overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id} className="flex items-start hover:bg-muted/60">
                  <Link to={notification.to} onClick={close} className="flex min-w-0 flex-1 gap-3 py-3 pl-4 pr-1 focus-visible:bg-muted/60 focus-visible:outline-none">
                    <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${toneDots[notification.tone]}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{notification.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{notification.detail}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDismiss(notification.id)}
                    aria-label={`Dismiss notification: ${notification.title}`}
                    title="Dismiss"
                    className="mr-2 mt-2 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileMenu({
  name,
  email,
  avatar,
  onOpenSettings,
  onSignOut,
}: {
  name: string;
  email: string;
  avatar: ReactNode;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const { isOpen, containerRef, toggle, close } = usePopover();
  const itemClassName = "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Account menu for ${name}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {avatar}
      </button>
      {isOpen && (
        <div className={`${panelClassName} w-60`}>
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <div className="py-1">
            <button type="button" className={itemClassName} onClick={() => { close(); onOpenSettings(); }}>
              <Settings size={16} aria-hidden="true" className="text-muted-foreground" />Profile settings
            </button>
            <button type="button" className={itemClassName} onClick={() => { close(); onSignOut(); }}>
              <LogOut size={16} aria-hidden="true" className="text-muted-foreground" />Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
