import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { usePopover } from "@/hooks/use-popover";
import { cn } from "@/lib/utils";

const triggerClassName = "mt-1.5 flex w-full items-center gap-2.5 rounded-md border border-input bg-background px-3 py-2.5 text-left text-sm font-normal text-foreground transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring";
const panelClassName = "absolute left-0 top-full z-30 mt-2 rounded-xl border border-border bg-card text-foreground shadow-lg";
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function toDateValue(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The six weeks (Monday first) that cover the given month. */
function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leadingDays = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1 - leadingDays));
}

const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(2000, month, 1)));
const navButtonClassName = "flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * A calendar dropdown. `value`, `min`, and `onChange` use the same YYYY-MM-DD strings as a native date input.
 * Clicking the month title switches to a month grid, for jumping to dates far ahead.
 */
export function DatePicker({
  value,
  onChange,
  min,
  labelledBy,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  /** Id of the element that labels this field. */
  labelledBy: string;
}) {
  const { isOpen, containerRef, toggle, close } = usePopover();
  const selected = fromDateValue(value);
  const [viewMonth, setViewMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [view, setView] = useState<"days" | "months">("days");
  const now = new Date();
  const today = toDateValue(now);
  // "YYYY-MM" strings compare correctly as text, like the full date values do.
  const minMonth = min?.slice(0, 7);
  const viewYear = viewMonth.getFullYear();

  const open = () => {
    // Always open on the days of the chosen date's month.
    if (!isOpen) {
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
      setView("days");
    }
    toggle();
  };
  const moveMonth = (offset: number) => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const moveYear = (offset: number) => setViewMonth((current) => new Date(current.getFullYear() + offset, current.getMonth(), 1));
  const choose = (next: string) => {
    onChange(next);
    close();
  };
  const monthValue = (year: number, month: number) => `${year}-${`${month + 1}`.padStart(2, "0")}`;

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={open} aria-haspopup="dialog" aria-expanded={isOpen} aria-labelledby={labelledBy} className={triggerClassName}>
        <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="truncate">{new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(selected)}</span>
      </button>
      {isOpen && (
        <div role="dialog" aria-label={view === "days" ? "Choose a date" : "Choose a month"} className={cn(panelClassName, "w-72 max-w-[calc(100vw-3rem)] p-3")}>
          {view === "days" ? (
            <>
              <div className="flex items-center justify-between">
                <button type="button" aria-label="Previous month" disabled={minMonth !== undefined && monthValue(viewYear, viewMonth.getMonth()) <= minMonth} onClick={() => moveMonth(-1)} className={navButtonClassName}><ChevronLeft size={16} aria-hidden="true" /></button>
                <button
                  type="button"
                  onClick={() => setView("months")}
                  aria-label={`${new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(viewMonth)}. Choose a different month`}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-display text-base font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(viewMonth)}
                  <ChevronDown size={14} aria-hidden="true" className="text-muted-foreground" />
                </button>
                <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className={navButtonClassName}><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
              <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {weekdays.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {calendarDays(viewMonth).map((day) => {
                  const dayValue = toDateValue(day);
                  const isSelected = dayValue === value;
                  const isDisabled = min !== undefined && dayValue < min;
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  return (
                    <button
                      key={dayValue}
                      type="button"
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      aria-label={new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(day)}
                      onClick={() => choose(dayValue)}
                      className={cn(
                        "mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-primary/10",
                        !isSelected && !inMonth && "text-muted-foreground/60",
                        !isSelected && dayValue === today && "font-semibold text-primary ring-1 ring-inset ring-primary/40",
                        isDisabled && "cursor-not-allowed text-muted-foreground/35 hover:bg-transparent",
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-end border-t border-border pt-2">
                <button type="button" onClick={() => choose(today)} className="rounded px-2 py-1 text-xs font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Today</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button type="button" aria-label="Previous year" disabled={minMonth !== undefined && `${viewYear}` <= minMonth.slice(0, 4)} onClick={() => moveYear(-1)} className={navButtonClassName}><ChevronLeft size={16} aria-hidden="true" /></button>
                <p aria-live="polite" className="font-display text-base font-semibold tabular-nums">{viewYear}</p>
                <button type="button" aria-label="Next year" onClick={() => moveYear(1)} className={navButtonClassName}><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {monthNames.map((name, month) => {
                  const thisMonth = monthValue(viewYear, month);
                  const isSelected = thisMonth === value.slice(0, 7);
                  const isDisabled = minMonth !== undefined && thisMonth < minMonth;
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      aria-label={new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(viewYear, month, 1))}
                      onClick={() => { setViewMonth(new Date(viewYear, month, 1)); setView("days"); }}
                      className={cn(
                        "rounded-lg py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-primary/10",
                        !isSelected && thisMonth === today.slice(0, 7) && "font-semibold text-primary ring-1 ring-inset ring-primary/40",
                        isDisabled && "cursor-not-allowed text-muted-foreground/35 hover:bg-transparent",
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end border-t border-border pt-2">
                <button type="button" onClick={() => setView("days")} className="rounded px-2 py-1 text-xs font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Back to days</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const hourOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const minuteOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const periods = ["AM", "PM"] as const;
type Period = (typeof periods)[number];
type TimeParts = { hour: number; minute: number; period: Period };

const twoDigits = (value: number) => `${value}`.padStart(2, "0");

function formatTimeValue(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}

function toTimeParts(value: string): TimeParts {
  const [hour24, minute] = value.split(":").map(Number);
  return { hour: hour24 % 12 || 12, minute, period: hour24 < 12 ? "AM" : "PM" };
}

function toTimeValue({ hour, minute, period }: TimeParts) {
  return `${twoDigits((hour % 12) + (period === "PM" ? 12 : 0))}:${twoDigits(minute)}`;
}

/** An analog clock face showing the given time, drawn in the site's palette. */
function ClockFace({ hour, minute }: { hour: number; minute: number }) {
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const minuteAngle = minute * 6;
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`Clock showing ${hour}:${twoDigits(minute)}`} className="mx-auto size-36">
      <circle cx="50" cy="50" r="48" className="fill-primary/15" />
      <circle cx="50" cy="50" r="42" className="fill-card stroke-border" strokeWidth="0.75" />
      {Array.from({ length: 60 }, (_, tick) => {
        const isHourMark = tick % 5 === 0;
        return (
          <line
            key={tick}
            x1="50" x2="50" y1="11.5" y2={isHourMark ? 16.5 : 13.5}
            strokeWidth={isHourMark ? 1.1 : 0.5}
            strokeLinecap="round"
            transform={`rotate(${tick * 6} 50 50)`}
            className={isHourMark ? "stroke-foreground/55" : "stroke-foreground/25"}
          />
        );
      })}
      <line x1="50" y1="54" x2="50" y2="29" strokeWidth="3" strokeLinecap="round" transform={`rotate(${hourAngle} 50 50)`} className="stroke-foreground" />
      <line x1="50" y1="56" x2="50" y2="18" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${minuteAngle} 50 50)`} className="stroke-primary" />
      <circle cx="50" cy="50" r="2.6" className="fill-alert" />
      <circle cx="50" cy="50" r="0.9" className="fill-card" />
    </svg>
  );
}

const timeFieldClassName = "flex h-12 w-full items-center rounded-xl border border-transparent bg-muted/80 text-lg font-semibold tabular-nums text-foreground transition-colors hover:bg-muted focus-within:border-primary/50 focus-within:bg-background";
const timeMenuClassName = "absolute left-0 top-full z-40 mt-1.5 rounded-xl border border-border bg-card p-1.5 shadow-lg";
const timeOptionClassName = (isSelected: boolean) => cn(
  "rounded-lg py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  isSelected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-primary/10",
);

/** A two-digit field: type a number, or pick one from the dropdown that opens under it. */
function TimeNumberField({
  label,
  value,
  min,
  max,
  options,
  isOpen,
  onOpenChange,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  options: number[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (value: number) => void;
}) {
  // What is in the box while typing; null means "show the committed value".
  const [typed, setTyped] = useState<string | null>(null);

  return (
    <div className="relative" onMouseDown={(event) => event.stopPropagation()}>
      <div className={timeFieldClassName}>
        <input
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          value={typed ?? twoDigits(value)}
          onFocus={(event) => { event.target.select(); onOpenChange(true); }}
          onClick={() => onOpenChange(true)}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
            setTyped(digits);
            const number = Number(digits);
            // Apply as soon as it is a usable value, so the clock follows the typing.
            if (digits && number >= min && number <= max) onChange(number);
          }}
          onBlur={() => { setTyped(null); onOpenChange(false); }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter confirms the field; it must not submit the form the picker sits in.
            event.preventDefault();
            event.currentTarget.blur();
          }}
          className="h-full w-full min-w-0 rounded-xl bg-transparent pl-3 pr-0 text-center outline-none"
        />
        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none mr-2.5 shrink-0 text-muted-foreground" />
      </div>
      {isOpen && (
        <div role="listbox" aria-label={label} className={cn(timeMenuClassName, "grid w-36 grid-cols-3 gap-1")}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              // Keep focus in the input so choosing an option does not blur and close the list first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { setTyped(null); onChange(option); onOpenChange(false); }}
              className={timeOptionClassName(option === value)}
            >
              {twoDigits(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A "Set time" panel: an analog clock that follows the chosen time, with hour, minute, and AM/PM fields.
 * Hours and minutes can be typed or picked from a dropdown. Nothing changes until "Set time" is pressed.
 * `value` and `onChange` use the same HH:MM strings as a native time input.
 */
export function TimePicker({ value, onChange, labelledBy }: { value: string; onChange: (value: string) => void; labelledBy: string }) {
  const { isOpen, containerRef, toggle, close } = usePopover();
  const [draft, setDraft] = useState<TimeParts>(() => toTimeParts(value));
  const [openField, setOpenField] = useState<"hour" | "minute" | "period" | null>(null);
  const setFieldOpen = (field: "hour" | "minute" | "period") => (open: boolean) =>
    setOpenField((current) => open ? field : current === field ? null : current);

  const open = () => {
    // Start each time from the saved value; an abandoned draft is discarded.
    if (!isOpen) {
      setDraft(toTimeParts(value));
      setOpenField(null);
    }
    toggle();
  };

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={open} aria-haspopup="dialog" aria-expanded={isOpen} aria-labelledby={labelledBy} className={triggerClassName}>
        <Clock3 size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="truncate">{formatTimeValue(value)}</span>
      </button>
      {isOpen && (
        <div role="dialog" aria-label="Set time" onMouseDown={() => setOpenField(null)} className={cn(panelClassName, "left-auto right-0 w-72 max-w-[calc(100vw-3rem)] p-5")}>
          <p className="text-center font-display text-lg font-semibold">Set time</p>
          <div className="mt-4"><ClockFace hour={draft.hour} minute={draft.minute} /></div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <TimeNumberField label="Hour" value={draft.hour} min={1} max={12} options={hourOptions} isOpen={openField === "hour"} onOpenChange={setFieldOpen("hour")} onChange={(hour) => setDraft((current) => ({ ...current, hour }))} />
            <TimeNumberField label="Minutes" value={draft.minute} min={0} max={59} options={minuteOptions} isOpen={openField === "minute"} onOpenChange={setFieldOpen("minute")} onChange={(minute) => setDraft((current) => ({ ...current, minute }))} />
            <div className="relative" onMouseDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                aria-label={`AM or PM, currently ${draft.period}`}
                aria-haspopup="listbox"
                aria-expanded={openField === "period"}
                onClick={() => setFieldOpen("period")(openField !== "period")}
                className={cn(timeFieldClassName, "justify-center gap-1.5 focus:border-primary/50 focus:bg-background focus:outline-none")}
              >
                {draft.period}<ChevronDown size={14} aria-hidden="true" className="text-muted-foreground" />
              </button>
              {openField === "period" && (
                <div role="listbox" aria-label="AM or PM" className={cn(timeMenuClassName, "left-auto right-0 grid w-full gap-1")}>
                  {periods.map((option) => (
                    <button key={option} type="button" role="option" aria-selected={option === draft.period} onClick={() => { setDraft((current) => ({ ...current, period: option })); setOpenField(null); }} className={timeOptionClassName(option === draft.period)}>
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => { onChange(toTimeValue(draft)); close(); }}
            className="mt-5 h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Set time
          </button>
          <button type="button" onClick={close} className="mt-2 w-full rounded py-1 text-center text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
