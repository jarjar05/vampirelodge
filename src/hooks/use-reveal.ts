import { useEffect, useRef } from "react";

/**
 * Fades an element in the first time it scrolls into view. Pair with the `.reveal` class in index.css,
 * which also switches the effect off for people who prefer reduced motion.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Without the observer, show the content straight away rather than leave it hidden.
    if (typeof IntersectionObserver === "undefined") {
      element.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        element.classList.add("is-visible");
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -6% 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return ref;
}
