import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, BookOpen, RotateCcw, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { careApi, type AskAnswer, type AskTurn } from "@/api/care";
import type { CareTask } from "@/types/care";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: AskAnswer }
  | { id: number; role: "error"; text: string; question: string };

const suggestions = ["What do I need to do next?", "What’s due today for the family?", "Who’s free this evening?"];
let nextId = 1;

/**
 * Ask the family assistant anything, as you would a chat assistant. The question goes in the bar at the top of
 * every page; the conversation opens underneath it and keeps going with follow-up questions until cleared.
 */
export function AskBar({ tasks }: { tasks: readonly CareTask[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const followUpRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // Cmd+K or Ctrl+K from anywhere puts the cursor in the bar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
        // On a phone the bar is only an icon, so the box inside the panel takes the cursor.
        requestAnimationFrame(() => (inputRef.current?.offsetWidth ? inputRef : followUpRef).current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A click outside or Escape tucks the conversation away; it is still there when the bar is opened again.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setIsOpen(false); inputRef.current?.blur(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [isOpen]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  /** `earlier` is the conversation the question follows on from. */
  const send = async (question: string, earlier: Message[] = messages) => {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;
    // Earlier turns go with the question, so "and tomorrow?" makes sense.
    const history = earlier.flatMap((message): AskTurn[] =>
      message.role === "user" ? [{ role: "user", text: message.text }]
        : message.role === "assistant" ? [{ role: "assistant", text: message.answer.text }] : []);
    setMessages([...earlier.filter((message) => message.role !== "error"), { id: nextId++, role: "user", text: trimmed }]);
    setDraft("");
    setIsOpen(true);
    setIsThinking(true);
    try {
      const answer = await careApi.ask(trimmed, history);
      setMessages((current) => [...current, { id: nextId++, role: "assistant", answer }]);
    } catch (error) {
      setMessages((current) => [...current, { id: nextId++, role: "error", text: error instanceof Error ? error.message : "The assistant could not answer just now.", question: trimmed }]);
    } finally {
      setIsThinking(false);
      // Back to the prompt for a follow-up: the bar, or on a phone the box in the panel.
      requestAnimationFrame(() => (inputRef.current?.offsetWidth ? inputRef : followUpRef).current?.focus());
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(draft);
  };
  const clear = () => {
    setMessages([]);
    setDraft("");
    inputRef.current?.focus();
  };
  const hasConversation = messages.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={submit}
        onClick={() => { setIsOpen(true); if (!inputRef.current?.offsetWidth) requestAnimationFrame(() => followUpRef.current?.focus()); }}
        className={`ask-pill flex h-[42px] cursor-text items-center gap-2 rounded-full border border-border bg-card pl-[12px] pr-1.5 ${isOpen ? "ask-pill-open" : ""}`}
      >
        <Sparkles size={16} aria-hidden="true" className="shrink-0 text-primary" />
        <label htmlFor="ask-input" className="sr-only">Ask about your family’s care</label>
        <input
          ref={inputRef}
          id="ask-input"
          type="text"
          autoComplete="off"
          maxLength={1000}
          placeholder={hasConversation ? "Ask a follow-up…" : "Ask anything…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setIsOpen(true)}
          className="ask-input hidden h-full w-0 min-w-0 flex-1 sm:block border-0 bg-transparent text-sm font-semibold text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:shadow-none"
        />
        {!isOpen && <kbd className="hidden shrink-0 rounded-md border border-border bg-muted px-1.5 font-sans text-[11px] font-bold text-muted-foreground xl:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>}
        {isOpen && (
          <button type="submit" aria-label="Ask" disabled={!draft.trim() || isThinking} className="hidden size-[30px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40 sm:grid">
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </form>

      {isOpen && (
        <section aria-label="Family assistant" className="menu-pop fixed inset-x-3 top-[74px] z-40 flex max-h-[calc(100dvh-170px)] flex-col sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2.5 sm:max-h-[min(560px,calc(100vh-110px))] sm:w-[min(460px,calc(100vw-2.5rem))] overflow-hidden rounded-[22px] border border-border bg-card shadow-[var(--shadow-lift)]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-extrabold"><Sparkles size={15} aria-hidden="true" className="text-primary" />Family assistant</p>
            <div className="flex items-center gap-1">
              {hasConversation && (
                <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <RotateCcw size={12} aria-hidden="true" />New chat
                </button>
              )}
              <button type="button" aria-label="Close the assistant" onClick={() => setIsOpen(false)} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {!hasConversation && (
              <div>
                <p className="text-sm text-muted-foreground">Ask about tasks, who’s free, what’s due, or anything in your family notes.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="rounded-full border border-border bg-muted px-3 py-1.5 text-left text-[13px] font-bold transition-[translate,border-color] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => {
              if (message.role === "user") {
                return <p key={message.id} className="ask-bubble ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">{message.text}</p>;
              }
              if (message.role === "error") {
                return (
                  <div key={message.id} role="alert" className="ask-bubble rounded-[18px] bg-alert/10 px-3.5 py-2.5 text-sm text-alert">
                    {message.text}{" "}
                    <button type="button" onClick={() => void send(message.question, messages.slice(0, -2))} className="font-extrabold link-underline">Try again</button>
                  </div>
                );
              }
              const related = message.answer.taskIds.map((id) => tasks.find((task) => task.id === id)).filter((task): task is CareTask => Boolean(task));
              return (
                <div key={message.id} className="ask-bubble max-w-[95%] rounded-[18px] rounded-bl-md bg-muted px-3.5 py-3 text-sm leading-relaxed">
                  <AnswerText text={message.answer.text} />
                  {related.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {related.map((task) => (
                        <Link key={task.id} to={`/tasks?task=${task.id}`} onClick={() => setIsOpen(false)} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-extrabold text-primary hover:border-primary/40">
                          {task.title} →
                        </Link>
                      ))}
                    </div>
                  )}
                  {message.answer.noteTitles.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><BookOpen size={12} aria-hidden="true" className="mt-0.5 shrink-0" />Checked notes: {message.answer.noteTitles.join(", ")}</p>
                  )}
                </div>
              );
            })}
            {isThinking && (
              <div role="status" className="ask-bubble flex w-fit items-center gap-1.5 rounded-[18px] rounded-bl-md bg-muted px-4 py-3">
                <span className="sr-only">Thinking…</span>
                <span aria-hidden="true" className="thinking-dot" /><span aria-hidden="true" className="thinking-dot" /><span aria-hidden="true" className="thinking-dot" />
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-border px-3 py-2.5 sm:hidden">
            <label htmlFor="ask-follow-up" className="sr-only">{hasConversation ? "Ask a follow-up question" : "Ask about your family’s care"}</label>
            <input
              ref={followUpRef}
              id="ask-follow-up"
              type="text"
              autoComplete="off"
              maxLength={1000}
              placeholder={hasConversation ? "Ask a follow-up…" : "Ask anything…"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm focus:outline-none"
            />
            <button type="submit" aria-label="Send" disabled={!draft.trim() || isThinking} className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-[opacity,translate] hover:-translate-y-0.5 disabled:opacity-40">
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

/** The answer as paragraphs, with "- " lines shown as a list. */
function AnswerText({ text }: { text: string }) {
  const blocks: { kind: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•*]\s+/.test(line);
    const content = line.replace(/^[-•*]\s+/, "");
    const last = blocks.at(-1);
    if (bullet && last?.kind === "ul") last.lines.push(content);
    else blocks.push({ kind: bullet ? "ul" : "p", lines: [content] });
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => block.kind === "ul"
        ? <ul key={index} className="list-disc space-y-1 pl-5 marker:text-primary">{block.lines.map((line, item) => <li key={item}>{line}</li>)}</ul>
        : <p key={index}>{block.lines[0]}</p>)}
    </div>
  );
}
