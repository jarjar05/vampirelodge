import { useState, type FormEvent } from "react";
import { HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const inputClassName = "mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none transition focus:ring-2 focus:ring-ring";

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
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <HeartPulse size={24} aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold">Welcome, {userName.trim().split(/\s+/)[0]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Set up a family space, or join one you’ve been invited to.</p>
        </div>

        {errorMessage && <p role="alert" className="mb-4 rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}

        <Card className="bg-white/90 shadow-md backdrop-blur-xl">
          <CardHeader><h2 className="font-display text-xl font-semibold">Create a family</h2></CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={submit(() => onCreate(familyName))} className="space-y-4">
              <label className="block text-sm font-medium" htmlFor="family-name">Family name
                <input id="family-name" required maxLength={120} value={familyName} onChange={(event) => setFamilyName(event.target.value)} className={inputClassName} />
              </label>
              <Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting || !familyName.trim()}>Create family</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-5 bg-white/90 shadow-md backdrop-blur-xl">
          <CardHeader><h2 className="font-display text-xl font-semibold">Join with an invite code</h2></CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={submit(() => onJoin(inviteCode))} className="space-y-4">
              <label className="block text-sm font-medium" htmlFor="invite-code">Invite code
                <input id="invite-code" required minLength={6} maxLength={16} autoComplete="off" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} className={`${inputClassName} font-mono tracking-widest`} />
              </label>
              <Button type="submit" variant="outline" className="h-11 w-full rounded-xl" disabled={isSubmitting || inviteCode.trim().length < 6}>Join family</Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Not you? <button type="button" onClick={onSignOut} className="font-semibold text-primary hover:underline">Sign out</button>
        </p>
      </div>
    </main>
  );
}
