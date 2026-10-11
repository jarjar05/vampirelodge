import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";

type NavItem = { to: string; label: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>; end: boolean };

/** The side menu. One highlight glides to whichever item is hovered or focused, and rests on the current page. */
export function SidebarNav({ items }: { items: readonly NavItem[] }) {
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  const activeItem = items.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
  // An unknown address shows the overview, so that is what the menu marks.
  const activeTo = activeItem?.to ?? items[0]?.to ?? null;
  const target = hovered ?? activeTo;

  useLayoutEffect(() => {
    const link = target ? navRef.current?.querySelector<HTMLElement>(`[data-nav="${target}"]`) : null;
    setPill(link ? { top: link.offsetTop, height: link.offsetHeight } : null);
  }, [target, items]);

  return (
    <nav ref={navRef} aria-label="Main navigation" className="relative mt-3 space-y-1.5" onPointerLeave={() => setHovered(null)}>
      <span
        aria-hidden="true"
        className="nav-pill pointer-events-none absolute inset-x-0 top-0 rounded-xl bg-primary shadow-md shadow-primary/25"
        style={pill ? { translate: `0 ${pill.top}px`, height: pill.height } : { opacity: 0 }}
      />
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          data-nav={to}
          onPointerEnter={() => setHovered(to)}
          onFocus={() => setHovered(to)}
          onBlur={() => setHovered(null)}
          className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            target === to ? "font-semibold text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
