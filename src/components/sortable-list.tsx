import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Drag = {
  id: string;
  /** Pointer position when the drag began, and how far it has moved since. */
  startY: number;
  dy: number;
  /** Where every row sat when the drag began, so the others can make room as the dragged one passes. */
  tops: number[];
  heights: number[];
  from: number;
  to: number;
};

const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A list whose rows can be dragged into a new order by their handle, with a mouse, a finger or a pen.
 * The dragged row lifts and follows the pointer, the others slide aside to make room, and on release it
 * settles into its new place. The handle also takes the up and down arrow keys, for people not using a pointer.
 */
export function SortableList({ ids, label, onReorder, renderRow, className }: {
  ids: readonly string[];
  /** Read out with each handle, e.g. "Your plan". */
  label: (id: string) => string;
  onReorder: (ids: string[]) => void;
  renderRow: (id: string) => ReactNode;
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // After a drop, the row starts where the pointer left it and glides into its slot.
  const [settling, setSettling] = useState<{ id: string; offset: number; done: boolean } | null>(null);

  const move = (from: number, to: number) => {
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || !listRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rows = [...listRef.current.children] as HTMLElement[];
    const from = ids.indexOf(id);
    setSettling(null);
    setDrag({ id, startY: event.clientY, dy: 0, tops: rows.map((row) => row.offsetTop), heights: rows.map((row) => row.offsetHeight), from, to: from });
  };

  const followPointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    // Kept within the list: the row can reach the first and last slots, but not wander off past them.
    const last = drag.tops.length - 1;
    const lowest = -drag.tops[drag.from];
    const highest = drag.tops[last] + drag.heights[last] - drag.heights[drag.from] - drag.tops[drag.from];
    const dy = Math.min(highest, Math.max(lowest, event.clientY - drag.startY));
    // The row's centre, where it is now, decides which slot it would drop into.
    const centre = drag.tops[drag.from] + drag.heights[drag.from] / 2 + dy;
    let to = 0;
    drag.tops.forEach((top, index) => {
      if (index !== drag.from && centre > top + drag.heights[index] / 2) to += 1;
    });
    setDrag({ ...drag, dy, to });
  };

  const drop = () => {
    if (!drag) return;
    const { id, from, to, dy, tops } = drag;
    setDrag(null);
    if (from === to) {
      if (dy !== 0 && !reduceMotion()) glide(id, dy);
      return;
    }
    // Where the row will sit once reordered, measured from where it started.
    const shift = to > from ? tops[to] + drag.heights[to] - drag.heights[from] - tops[from] : tops[to] - tops[from];
    move(from, to);
    if (!reduceMotion()) glide(id, dy - shift);
  };

  const glide = (id: string, offset: number) => {
    setSettling({ id, offset, done: false });
    // Two frames: one to paint the starting point, the next to let it transition home.
    requestAnimationFrame(() => requestAnimationFrame(() => setSettling({ id, offset: 0, done: true })));
  };

  const moveWithKeys = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const index = ids.indexOf(id);
    if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); move(index, index - 1); }
    if (event.key === "ArrowDown" && index < ids.length - 1) { event.preventDefault(); move(index, index + 1); }
  };

  return (
    <ul ref={listRef} className={cn("relative", className)}>
      {ids.map((id, index) => {
        const isDragged = drag?.id === id;
        let style: React.CSSProperties | undefined;
        if (drag && isDragged) {
          style = { transform: `translateY(${drag.dy}px) scale(1.03)`, transition: "box-shadow 0.2s, scale 0.2s", zIndex: 2 };
        } else if (drag) {
          // Rows between where the dragged one started and where it is now slide aside by its height.
          const size = drag.heights[drag.from];
          const shift = drag.from < drag.to && index > drag.from && index <= drag.to ? -size
            : drag.from > drag.to && index >= drag.to && index < drag.from ? size : 0;
          style = { transform: `translateY(${shift}px)`, transition: "transform 0.22s var(--ease-out)" };
        } else if (settling?.id === id) {
          style = {
            transform: `translateY(${settling.offset}px) scale(${settling.done ? 1 : 1.03})`,
            transition: settling.done ? "transform 0.3s var(--ease-spring), box-shadow 0.3s" : "none",
            zIndex: 2,
          };
        }
        const isLifted = isDragged || (settling?.id === id && !settling.done);
        return (
          <li
            key={id}
            style={style}
            onTransitionEnd={(event) => { if (event.propertyName === "transform" && settling?.id === id && settling.done) setSettling(null); }}
            className={cn("relative flex items-center gap-2 bg-card", isLifted && "rounded-lg shadow-xl shadow-foreground/15 ring-1 ring-primary/30")}
          >
            <button
              type="button"
              aria-label={`Reorder ${label(id)}. Drag, or use the up and down arrow keys.`}
              onPointerDown={(event) => startDrag(event, id)}
              onPointerMove={followPointer}
              onPointerUp={drop}
              onPointerCancel={drop}
              onKeyDown={(event) => moveWithKeys(event, id)}
              className={cn("ml-1.5 grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragged ? "cursor-grabbing" : "cursor-grab")}
            >
              <GripVertical size={16} aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">{renderRow(id)}</div>
          </li>
        );
      })}
    </ul>
  );
}
