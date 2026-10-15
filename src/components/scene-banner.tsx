import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HeroScene } from "@/components/hero-scene";
import { cn } from "@/lib/utils";

const BannerSlot = createContext<HTMLElement | null>(null);

/**
 * The illustrated header at the top of every page. It stays in place while the pages change beneath it: the picture
 * glides to the new page's scene, the header grows or shrinks to fit the new title, and the title fades in.
 * Each page puts its own title into it with <BannerContent>.
 */
export function SceneBanner({ sceneIndex, children }: { sceneIndex: number; children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const slotRef = useRef<HTMLDivElement | null>(null);
  // Stable, so React does not detach and reattach the slot on every render.
  const attachSlot = useCallback((element: HTMLDivElement | null) => {
    slotRef.current = element;
    setSlot(element);
  }, []);

  // The header's height follows its content, so a change of page animates it rather than jumping.
  useLayoutEffect(() => {
    const element = slotRef.current;
    if (!element) return;
    const measure = () => setHeight(element.offsetHeight || undefined);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [slot]);

  return (
    <>
      <section className="scene-banner mb-6" style={{ height }}>
        <HeroScene index={sceneIndex} />
        <div ref={attachSlot} className="relative z-[1]" />
      </section>
      <BannerSlot.Provider value={slot}>{children}</BannerSlot.Provider>
    </>
  );
}

/** Puts a page's title and actions into the illustrated header. */
export function BannerContent({ className, label, children }: { className?: string; label?: string; children: React.ReactNode }) {
  const slot = useContext(BannerSlot);
  if (!slot) return null;
  return createPortal(<div aria-label={label} role={label ? "region" : undefined} className={cn("banner-content relative", className)}>{children}</div>, slot);
}
