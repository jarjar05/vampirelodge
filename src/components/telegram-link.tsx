import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { careApi } from "@/api/care";
import { Button } from "@/components/ui/button";
import type { TelegramStatus } from "@/types/care";

// While the person is over in Telegram pressing Start, ask the server this often whether the link went through.
const pollMs = 3000;

/** Lets the signed-in person connect their Telegram account, for overdue reminders and adding tasks by message. */
export function TelegramLink() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    careApi.telegramStatus()
      .then((result) => { if (isCurrent) setStatus(result); })
      .catch((error) => { if (isCurrent) setErrorMessage(error instanceof Error ? error.message : "Your Telegram settings could not be loaded."); });
    return () => { isCurrent = false; };
  }, []);

  // Linking finishes in Telegram, so watch for it here.
  useEffect(() => {
    if (!linkUrl) return;
    let isCurrent = true;
    const timer = window.setInterval(() => {
      careApi.telegramStatus()
        .then((result) => {
          if (!isCurrent || !result.linked) return;
          setStatus(result);
          setLinkUrl(null);
        })
        .catch(() => {});
    }, pollMs);
    return () => { isCurrent = false; window.clearInterval(timer); };
  }, [linkUrl]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setErrorMessage("");
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="mt-6 border-t border-border pt-5">
      <legend className="float-left mb-1 flex w-full items-center gap-2 text-sm font-semibold"><Send size={15} aria-hidden="true" />Telegram</legend>
      <p className="clear-both text-xs leading-relaxed text-muted-foreground">
        Get a message when one of your tasks is overdue, and add tasks by forwarding a message to the family’s bot.
      </p>

      {status && !status.configured && (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">Telegram is not set up on this server yet, so there is nothing to link.</p>
      )}

      {status?.configured && status.linked && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-3">
          <p className="text-sm font-medium">Telegram linked{status.telegramUsername ? ` as @${status.telegramUsername}` : ""}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Overdue reminders will be sent to you there.</p>
          <Button type="button" size="sm" variant="ghost" className="mt-2" disabled={busy} onClick={() => void run(async () => { await careApi.unlinkTelegram(); setStatus({ configured: true, linked: false, telegramUsername: null }); })}>Unlink</Button>
        </div>
      )}

      {status?.configured && !status.linked && !linkUrl && (
        <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void run(async () => setLinkUrl(await careApi.startTelegramLink()))}>{busy ? "Preparing…" : "Link Telegram"}</Button>
      )}

      {status?.configured && !status.linked && linkUrl && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-foreground/80">
            <li>Open Telegram with the button below.</li>
            <li>Press <span className="font-semibold">Start</span> in the chat with the bot.</li>
            <li>Come back here. This box updates by itself.</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={linkUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Send size={14} aria-hidden="true" />Open Telegram
            </a>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkUrl(null)}>Cancel</Button>
          </div>
          <p role="status" className="mt-2 text-xs text-muted-foreground">Waiting for you to press Start… The link works for 15 minutes.</p>
        </div>
      )}
      {errorMessage && <p role="alert" className="mt-2 text-xs text-alert">{errorMessage}</p>}
    </fieldset>
  );
}
