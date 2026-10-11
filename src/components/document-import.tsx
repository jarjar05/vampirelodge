import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Check, Clock3, FileText, MapPin, Sparkles, Upload, X } from "lucide-react";
import { careApi } from "@/api/care";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatClock, formatDay } from "@/lib/dates";
import type { DocumentDrafts, TaskDraft } from "@/types/care";

// Keep in step with MAX_FILE_BYTES in backend/app/services/document_tasks.py.
const maxFileBytes = 5_000_000;
const maxImageSide = 2000;
const acceptedFiles = ".pdf,.docx,.eml,.txt,image/*";

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Photos are shrunk and saved as JPEG on a white background before upload. That keeps phone photos under
 * the size limit, and the AI cannot read dark text on a transparent background.
 */
async function prepareImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That picture could not be opened. Use a JPEG or PNG, or take a screenshot.");
  }
  const scale = Math.min(1, maxImageSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("That picture could not be prepared for upload.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("That picture could not be prepared for upload."))), "image/jpeg", 0.85);
  });
}

function draftDue(draft: TaskDraft) {
  if (!draft.dueDate) return "No date found";
  const day = formatDay(new Date(`${draft.dueDate}T00:00`));
  return draft.dueTime ? `${day} · ${formatClock(new Date(`${draft.dueDate}T${draft.dueTime}`))}` : day;
}

type ImportState =
  | { status: "choosing" }
  | { status: "reading"; name: string }
  | { status: "done"; name: string; drafts: DocumentDrafts };

/**
 * Upload a letter or paste an email, and the AI drafts tasks from it. A draft only becomes a task
 * after the person has checked it in the new-task form.
 */
export function DocumentImport({
  onReview,
  onClose,
  className,
}: {
  /** Open the draft in the new-task form. Call `markAdded` once the task has been created. */
  onReview: (draft: TaskDraft, markAdded: () => void) => void;
  onClose: () => void;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ status: "choosing" });
  const [pastedText, setPastedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [addedDrafts, setAddedDrafts] = useState<ReadonlySet<number>>(new Set());

  const analyse = async (name: string, request: () => Promise<DocumentDrafts>) => {
    setErrorMessage("");
    setAddedDrafts(new Set());
    setState({ status: "reading", name });
    try {
      setState({ status: "done", name, drafts: await request() });
    } catch (error) {
      setState({ status: "choosing" });
      setErrorMessage(error instanceof Error ? error.message : "The document could not be read. Please try again.");
    }
  };

  const analyseFile = (file: File) => analyse(file.name, async () => {
    const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
    const upload = isImage ? await prepareImage(file) : file;
    if (upload.size > maxFileBytes) throw new Error("That file is too large. The limit is 5 MB.");
    return careApi.draftTasksFromDocument({ filename: file.name, contentType: isImage ? "image/jpeg" : file.type, dataBase64: await toBase64(upload) });
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow picking the same file again.
    event.target.value = "";
    if (file) void analyseFile(file);
  };
  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void analyseFile(file);
  };

  return (
    <Card className={className}>
      <CardHeader className="items-center">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Sparkles size={18} className="text-primary" aria-hidden="true" />Tasks from a document</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X size={16} aria-hidden="true" />
        </button>
      </CardHeader>
      <CardContent className="pt-3">
        {state.status === "choosing" && (
          <>
            <div
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={dropFile}
              className={`rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-input"}`}
            >
              <Upload size={22} className="mx-auto text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Drop a letter here, or</p>
              <input ref={fileInputRef} type="file" accept={acceptedFiles} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={chooseFile} />
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => fileInputRef.current?.click()}>Choose a file</Button>
              <p className="mt-3 text-xs text-muted-foreground">PDF, photo, Word document or saved email (.eml), up to 5 MB</p>
            </div>
            <label className="mt-4 block text-sm font-medium" htmlFor="document-import-text">Or paste the text of an email or message</label>
            <textarea
              id="document-import-text"
              rows={4}
              maxLength={50_000}
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">The document is sent to the AI to be read. It is not saved.</p>
              <Button type="button" size="sm" disabled={!pastedText.trim()} onClick={() => void analyse("Pasted text", () => careApi.draftTasksFromDocument({ text: pastedText }))}>Find tasks</Button>
            </div>
          </>
        )}

        {state.status === "reading" && (
          <div role="status" className="space-y-2.5 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><FileText size={15} aria-hidden="true" />Reading {state.name}…</p>
            <span aria-hidden="true" className="block h-2.5 w-full animate-pulse rounded-full bg-primary/10" />
            <span aria-hidden="true" className="block h-2.5 w-2/3 animate-pulse rounded-full bg-primary/10" />
          </div>
        )}

        {state.status === "done" && (
          <>
            <p className="flex items-start gap-2 text-sm"><FileText size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span><span className="font-semibold">{state.name}.</span> {state.drafts.summary}</span></p>
            {state.drafts.tasks.length === 0 ? (
              <p className="mt-4 rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">Nothing in this document needs doing, as far as the AI can tell. You can still add a task yourself with “New task”.</p>
            ) : (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
                  {state.drafts.tasks.length === 1 ? "1 suggested task" : `${state.drafts.tasks.length} suggested tasks`} · check each before adding
                </h3>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {state.drafts.tasks.map((draft, index) => {
                    const isAdded = addedDrafts.has(index);
                    return (
                      <li key={`${index}-${draft.title}`} className={`flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4 ${isAdded ? "bg-muted/40" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{draft.title}</p>
                          {draft.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{draft.detail}</p>}
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Clock3 size={12} aria-hidden="true" />{draftDue(draft)}</span>
                            {draft.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={12} className="shrink-0" aria-hidden="true" />{draft.location}</span>}
                            {draft.priority !== "Normal" && <span>{draft.priority} priority</span>}
                          </p>
                        </div>
                        {isAdded
                          ? <Badge variant="success" className="shrink-0 self-start sm:self-center"><Check size={12} aria-hidden="true" />Added</Badge>
                          : <Button type="button" size="sm" className="shrink-0 self-start sm:self-center" onClick={() => onReview(draft, () => setAddedDrafts((current) => new Set(current).add(index)))}>Review and add</Button>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { setState({ status: "choosing" }); setPastedText(""); }}>Read another document</Button>
              <Button type="button" size="sm" variant="ghost" onClick={onClose}>Done</Button>
            </div>
          </>
        )}
        {errorMessage && <p role="alert" className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
      </CardContent>
    </Card>
  );
}
