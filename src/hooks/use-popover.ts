import { useEffect, useRef, useState } from "react";

/**
 * Open/close state for a dropdown that closes on Escape or a click outside it. A panel drawn elsewhere in the page
 * (in a portal) counts as inside when it is attached to `panelRef`.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Keep Escape from also closing a dialog the popover sits inside.
      event.stopPropagation();
      event.preventDefault();
      setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isOpen]);

  return { isOpen, containerRef, panelRef, toggle: () => setIsOpen((current) => !current), close: () => setIsOpen(false) };
}
