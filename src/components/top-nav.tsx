import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

type NavItem = { to: string; label: string; end: boolean };

/** The menu across the top. One underline glides to whichever page is hovered or focused, and rests under the current one. */
export function TopNav({ items }: { items: readonly NavItem[] }) {
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  const activeItem = items.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
  // An unknown address shows the overview, so that is what the menu marks.
  const activeTo = activeItem?.to ?? items[0]?.to ?? null;
  const target = hovered ?? activeTo;

  useLayoutEffect(() => {
    const measure = () => {
      const link = target ? navRef.current?.querySelector<HTMLElement>(`[data-nav="${target}"]`) : null;
      setBar(link ? { left: link.offsetLeft, width: link.offsetWidth } : null);
    };
    measure();
    // The links change width once the web font arrives, and with the window.
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [target, items]);

  return (
    <nav ref={navRef} aria-label="Main navigation" className="relative hidden shrink-0 items-center gap-0.5 lg:flex xl:gap-1" onPointerLeave={() => setHovered(null)}>
      <span
        aria-hidden="true"
        className="top-nav-bar pointer-events-none absolute bottom-0.5 left-0 h-[2.5px] rounded-full bg-primary"
        style={bar ? { translate: `${bar.left}px 0`, width: bar.width } : { opacity: 0 }}
      />
      {items.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          data-nav={to}
          onPointerEnter={() => setHovered(to)}
          onFocus={() => setHovered(to)}
          onBlur={() => setHovered(null)}
          className={({ isActive }) =>
            `top-nav-link rounded-md px-2 py-2 text-[15px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-2.5 ${
              isActive || target === to ? "text-foreground" : "text-muted-foreground"
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
