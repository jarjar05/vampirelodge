import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from zero the first time it scrolls into view,
 * and afterwards rolls from its old value to the new one whenever it changes.
 */
export function CountUp({ value, suffix = "", durationMs = 1100 }: { value: number; suffix?: string; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAppeared = useRef(false);
  // What is on screen right now, so a change starts from there instead of from zero.
  const current = useRef(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const element = ref.current;
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!element || reduceMotion || typeof IntersectionObserver === "undefined") {
      hasAppeared.current = true;
      current.current = value;
      setShown(value);
      return;
    }

    let frame = 0;
    const roll = (duration: number) => {
      const from = current.current;
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // Ease out, so the number slows as it reaches its value.
        current.current = Math.round(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
        setShown(current.current);
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    if (hasAppeared.current) {
      roll(Math.min(durationMs, 600));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      hasAppeared.current = true;
      roll(durationMs);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  // The real value is what assistive technology reads; the moving digits are decoration.
  return <span ref={ref} aria-label={`${value}${suffix}`}><span aria-hidden="true" className="tabular-nums">{shown}{suffix}</span></span>;
}
