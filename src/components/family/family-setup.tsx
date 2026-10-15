import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WelcomeLayout } from "@/components/welcome-layout";

const inputClassName = "mt-1.5 h-[3.25rem] w-full rounded-[14px] border border-input bg-background px-4 text-[15px] font-semibold outline-none transition-[border-color,box-shadow]";

/** Shown to a signed-in user who does not belong to a family yet. */
export function FamilySetup({
  userName,
  errorMessage,
  onCreate,
  onJoin,
  onSignOut,
}: {
  userName: string;
  errorMessage: string;
  onCreate: (name: string) => Promise<unknown>;
  onJoin: (inviteCode: string) => Promise<unknown>;
  onSignOut: () => void;
}) {
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = (action: () => Promise<unknown>) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await action();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WelcomeLayout>
      <div className="mb-7">
        <p className="enter-rise text-sm font-extrabold text-primary">Nearly there</p>
        <h1 className="enter-rise mt-1.5 font-display text-[clamp(2rem,2.6vw,2.6rem)] font-bold leading-tight" style={{ "--i": 1 } as React.CSSProperties}>Welcome, {userName.trim().split(/\s+/)[0]}</h1>
        <p className="enter-rise mt-2 text-[15px] text-muted-foreground" style={{ "--i": 2 } as React.CSSProperties}>Set up a family space, or join one you’ve been invited to.</p>
      </div>

      {errorMessage && <p role="alert" className="mb-4 rounded-xl bg-alert/10 px-3.5 py-2.5 text-sm font-semibold text-alert">{errorMessage}</p>}

      <div className="enter-card space-y-5">
        <Card className="is-visible">
          <CardContent className="p-6 sm:p-7">
            <h2 className="font-display text-[22px] font-bold">Start a family</h2>
            <form onSubmit={submit(() => onCreate(familyName))} className="mt-4 space-y-4">
              <label className="block text-sm font-bold" htmlFor="family-name">Family name
                <input id="family-name" required maxLength={120} placeholder="e.g. The Tan family" value={familyName} onChange={(event) => setFamilyName(event.target.value)} className={inputClassName} />
              </label>
              <Button type="submit" className="h-12 w-full text-[15px]" disabled={isSubmitting || !familyName.trim()}>Create family</Button>
            </form>
          </CardContent>
        </Card>

        <div aria-hidden="true" className="flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or</div>

        <Card className="is-visible">
          <CardContent className="p-6 sm:p-7">
            <h2 className="font-display text-[22px] font-bold">Join with an invite code</h2>
            <form onSubmit={submit(() => onJoin(inviteCode))} className="mt-4 space-y-4">
              <label className="block text-sm font-bold" htmlFor="invite-code">Invite code
                <input id="invite-code" required minLength={6} maxLength={16} autoComplete="off" placeholder="From someone in the family" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} className={`${inputClassName} font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal`} />
              </label>
              <Button type="submit" variant="outline" className="h-12 w-full text-[15px]" disabled={isSubmitting || inviteCode.trim().length < 6}>Join family</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        Not you? <button type="button" onClick={onSignOut} className="font-extrabold text-primary link-underline">Sign out</button>
      </p>
    </WelcomeLayout>
  );
}
