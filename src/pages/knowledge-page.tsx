import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import { careApi } from "@/api/care";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BannerButton, PageHeader } from "@/components/page-parts";
import type { KnowledgeDocument, KnowledgeSearchResult } from "@/types/care";

const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm font-normal focus:outline-none";

const categories = [
  { value: "care_note", label: "Care note" },
  { value: "medication", label: "Medication" },
  { value: "routine", label: "Routine" },
  { value: "contacts", label: "Contacts" },
  { value: "other", label: "Other" },
];

// Each kind of note is pinned up in its own colour, and the notes lean a little this way and that.
const categoryColours: Record<string, string> = {
  care_note: "var(--sage)",
  medication: "var(--primary)",
  routine: "var(--mustard)",
  contacts: "var(--sky)",
  other: "var(--plum)",
};
const tilts = [-1.2, 0.9, -0.5, 1.4];

function categoryLabel(value: string) {
  return categories.find((category) => category.value === value)?.label ?? value;
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/** The family's shared notes. The assistant reads the relevant ones when it suggests who should take a task. */
export function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[] | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0].value);
  const [content, setContent] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    careApi.listKnowledge()
      .then((loaded) => { if (isCurrent) setDocuments(loaded); })
      .catch((error) => { if (isCurrent) { setDocuments([]); setErrorMessage(messageFor(error)); } });
    return () => { isCurrent = false; };
  }, []);

  const addDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSaving(true);
    try {
      const created = await careApi.addKnowledge({ title: title.trim(), category, content: content.trim() });
      setDocuments((current) => [created, ...(current ?? [])]);
      setTitle("");
      setContent("");
      setIsAdding(false);
    } catch (error) {
      setErrorMessage(messageFor(error));
    } finally {
      setIsSaving(false);
    }
  };

  const removeDocument = async (document: KnowledgeDocument) => {
    if (!window.confirm(`Remove “${document.title}”? The assistant will no longer use it.`)) return;
    setErrorMessage("");
    try {
      await careApi.deleteKnowledge(document.id);
      setDocuments((current) => (current ?? []).filter((item) => item.id !== document.id));
      setResults((current) => current?.filter((result) => result.documentId !== document.id) ?? null);
    } catch (error) {
      setErrorMessage(messageFor(error));
    }
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    setErrorMessage("");
    setIsSearching(true);
    try {
      setResults(await careApi.searchKnowledge(trimmed));
      setSearchedQuery(trimmed);
    } catch (error) {
      setErrorMessage(messageFor(error));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="What the family knows"
        title={<>Family <em>notes</em></>}
        lead="Care plans, medicines and who does what. The assistant reads these when it suggests who should help."
        actions={<BannerButton icon={Plus} aria-expanded={isAdding} onClick={() => setIsAdding((current) => !current)}>Add a note</BannerButton>}
      />

      {errorMessage && <p role="alert" className="mb-5 rounded-2xl bg-alert/10 px-4 py-3 text-sm text-alert">{errorMessage}</p>}

      {isAdding && (
        <Card className="mb-6">
          <CardHeader className="items-baseline"><h2 className="font-display text-[23px] font-bold">New note</h2><span className="text-sm text-muted-foreground">Split into searchable pieces when saved</span></CardHeader>
          <CardContent>
            <form onSubmit={addDocument} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="text-sm font-bold">Title
                <input required maxLength={200} placeholder="e.g. Mum’s medication list" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClassName} />
              </label>
              <label className="text-sm font-bold">Category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClassName}>
                  {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold sm:col-span-2">Note
                <textarea required rows={8} maxLength={100000} placeholder="Type or paste the details. Long notes are fine." value={content} onChange={(event) => setContent(event.target.value)} className={`${fieldClassName} resize-y leading-relaxed`} />
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving || !title.trim() || !content.trim()}>{isSaving ? "Saving…" : "Save note"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardHeader className="items-baseline"><h2 className="font-display text-[23px] font-bold">Search the notes</h2><span className="text-sm text-muted-foreground">Finds notes by meaning, not just matching words</span></CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={search} role="search" className="flex gap-2.5">
            <label className="sr-only" htmlFor="knowledge-search">Search your notes</label>
            <span className="relative min-w-0 flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input id="knowledge-search" type="search" maxLength={2000} placeholder="Ask a question, e.g. who sorts out the medicine?" value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background pl-11 pr-3 text-[15px] focus:outline-none" />
            </span>
            <Button type="submit" disabled={isSearching || !query.trim()}>{isSearching ? "Searching…" : "Search"}</Button>
          </form>
          {results && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold">Matches for “{searchedQuery}”</h3>
                <Button size="sm" variant="ghost" onClick={() => { setResults(null); setQuery(""); }}>Clear</Button>
              </div>
              {results.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing in your notes matches that.</p>}
              <ul className="stagger mt-2 space-y-2.5">
                {results.map((result) => (
                  <li key={result.id} className="enter-rise rounded-[18px] border-l-4 border-primary bg-muted px-4 py-3">
                    <p className="font-extrabold">{result.title}</p>
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{result.content}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <section aria-label="Family notes">
        {documents === null && <p className="py-10 text-center text-sm text-muted-foreground">Loading notes…</p>}
        {documents?.length === 0 && (
          <div className="py-12 text-center">
            <BookOpen size={28} aria-hidden="true" className="mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm font-extrabold">No notes yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a care plan or a medication list to get started.</p>
          </div>
        )}
        <ul className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {documents?.map((document, index) => {
            const isExpanded = expandedId === document.id;
            const colour = categoryColours[document.category] ?? "var(--sage)";
            return (
              <li
                key={document.id}
                className="pinned-note relative rounded-[6px_6px_22px_6px] px-5 pt-6 pb-4"
                style={{ "--note": colour, "--tilt": `${tilts[index % tilts.length]}deg`, animationDelay: `${0.1 + Math.min(index, 8) * 0.07}s` } as React.CSSProperties}
              >
                <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={{ color: colour, background: `color-mix(in srgb, ${colour} 14%, transparent)` }}>{categoryLabel(document.category)}</span>
                <h3 className="mt-2.5 font-display text-xl font-bold">{document.title}</h3>
                <p className={`mt-2 whitespace-pre-line font-display text-[15.5px] italic leading-relaxed ${isExpanded ? "" : "line-clamp-5"}`}>{document.content}</p>
                {document.content.length > 200 && (
                  <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : document.id)} className="mt-1.5 rounded text-xs font-extrabold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {isExpanded ? "Show less" : "Show all"}
                  </button>
                )}
                <footer className="mt-3 flex items-center justify-between gap-3 text-[12.5px] font-bold text-muted-foreground">
                  <span className="min-w-0 truncate">{document.addedBy ? `${document.addedBy} · ` : ""}{document.addedAt}</span>
                  <button type="button" aria-label={`Remove ${document.title}`} title="Remove" onClick={() => void removeDocument(document)} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-alert/10 hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </footer>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
