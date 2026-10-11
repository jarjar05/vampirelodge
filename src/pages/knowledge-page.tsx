import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { careApi } from "@/api/care";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { KnowledgeDocument, KnowledgeSearchResult } from "@/types/care";

const fieldClassName = "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-ring";

const categories = [
  { value: "care_note", label: "Care note" },
  { value: "medication", label: "Medication" },
  { value: "routine", label: "Routine" },
  { value: "contacts", label: "Contacts" },
  { value: "other", label: "Other" },
];

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
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Knowledge</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Notes your family shares, like care plans, medication lists and who usually does what. The assistant reads the relevant ones when it suggests who should take a task.</p>
      </div>

      {errorMessage && <p role="alert" className="mb-5 rounded-lg bg-alert/10 px-4 py-3 text-sm text-alert">{errorMessage}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={search} role="search" className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
          <label className="sr-only" htmlFor="knowledge-search">Search your notes</label>
          <span className="relative min-w-0 flex-1">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input id="knowledge-search" type="search" maxLength={2000} placeholder="Search your notes" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </span>
          <Button type="submit" size="sm" variant="outline" disabled={isSearching || !query.trim()}>{isSearching ? "Searching…" : "Search"}</Button>
        </form>
        <Button size="sm" onClick={() => setIsAdding((current) => !current)}><Plus size={15} aria-hidden="true" />Add note</Button>
      </div>

      {isAdding && (
        <Card className="mb-5">
          <CardHeader><h2 className="font-display text-xl font-semibold">Add a note</h2></CardHeader>
          <CardContent>
            <form onSubmit={addDocument} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="text-sm font-medium">Title
                <input required maxLength={200} placeholder="e.g. Mum’s medication list" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClassName} />
              </label>
              <label className="text-sm font-medium">Category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClassName}>
                  {categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">Note
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

      {results && (
        <Card className="mb-5 border-primary/25">
          <CardHeader className="items-center">
            <h2 className="font-display text-xl font-semibold">Matches for “{searchedQuery}”</h2>
            <Button size="sm" variant="ghost" onClick={() => { setResults(null); setQuery(""); }}>Clear</Button>
          </CardHeader>
          <CardContent className="pt-3">
            {results.length === 0 && <p className="text-sm text-muted-foreground">Nothing in your notes matches that.</p>}
            <ul className="divide-y divide-border">
              {results.map((result) => (
                <li key={result.id} className="py-3">
                  <p className="text-xs font-semibold text-primary">{result.title}</p>
                  <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{result.content}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card aria-label="Family notes">
        <CardContent className="py-2">
          {documents === null && <p className="py-10 text-center text-sm text-muted-foreground">Loading notes…</p>}
          {documents?.length === 0 && (
            <div className="py-12 text-center">
              <BookOpen size={28} aria-hidden="true" className="mx-auto text-muted-foreground/60" />
              <p className="mt-3 text-sm font-semibold">No notes yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add a care plan or a medication list to get started.</p>
            </div>
          )}
          <ul className="divide-y divide-border">
            {documents?.map((document) => {
              const isExpanded = expandedId === document.id;
              return (
                <li key={document.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{document.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{document.addedBy ? `Added by ${document.addedBy} · ` : ""}{document.addedAt}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{categoryLabel(document.category)}</Badge>
                      <Button size="sm" variant="ghost" aria-label={`Remove ${document.title}`} onClick={() => void removeDocument(document)}>Remove</Button>
                    </div>
                  </div>
                  <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/85 ${isExpanded ? "" : "line-clamp-3"}`}>{document.content}</p>
                  {document.content.length > 240 && (
                    <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : document.id)} className="mt-1.5 rounded text-xs font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {isExpanded ? "Show less" : "Show all"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
