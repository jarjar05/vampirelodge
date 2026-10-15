import { useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { KeyRound, LockKeyhole, Mail, UserRound, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { PhoneInput } from "@/components/phone-input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
  /** Overview cards to show, in order; null means the default set. */
  overview_layout?: string[] | null;
}

interface LoginPageProps {
  familyName: string;
  onAuthenticated: (user: AuthUser) => void;
}

interface LoginLocationState {
  from?: string;
}

// Keep in step with MIN_PASSWORD_LENGTH in backend/app/schemas/auth.py.
const minPasswordLength = 12;
// How long the tick shows, and how long the page takes to lift away, before the app appears.
const tickMs = 650;
const leaveMs = 300;
const phoneFieldClassName = "h-11 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none transition focus:ring-2 focus:ring-ring";

/** A text field whose label sits inside the box and lifts to the top when the field is focused or filled. */
function FloatingField({ id, label, icon: Icon, ...input }: { id: string; label: string; icon: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="float-field relative">
      <Icon size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      {/* The single-space placeholder is what lets the styles tell an empty field from a filled one. */}
      <input id={id} placeholder=" " className="h-14 w-full rounded-xl border border-input bg-background pb-1.5 pl-10 pr-3 pt-5 text-sm font-normal outline-none" {...input} />
      <label htmlFor={id} className="pointer-events-none absolute left-10 top-[1.05rem] text-sm text-muted-foreground">{label}</label>
    </div>
  );
}

export function LoginPage({ familyName, onAuthenticated }: LoginPageProps) {
  // "forgot" asks for the email to send a code to; "reset" takes the code and a new password.
  const [mode, setMode] = useState<"sign-in" | "create" | "forgot" | "reset">("sign-in");
  const [resetCode, setResetCode] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [signInWith, setSignInWith] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done">("idle");
  const [isLeaving, setIsLeaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isCreating = mode === "create";
  const isRecovering = mode === "forgot" || mode === "reset";
  // Both creating an account and resetting a password ask for a new password, typed twice.
  const setsNewPassword = isCreating || mode === "reset";

  const goTo = (next: typeof mode, message = "") => {
    setMode(next);
    setErrorMessage("");
    setNotice(message);
    setPassword("");
    setPasswordConfirmation("");
    setResetCode("");
  };
  const switchMode = () => goTo(mode === "sign-in" ? "create" : "sign-in");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (setsNewPassword && password !== passwordConfirmation) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setSubmitState("loading");

    try {
      if (mode === "forgot") {
        await api("/auth/forgot-password", { method: "POST", body: { email } });
        setSubmitState("idle");
        // The server answers the same way whether or not the account exists, so this cannot promise a code was sent.
        goTo("reset", "If that account has Telegram linked, a 6-digit code has been sent there.");
        return;
      }
      if (mode === "reset") {
        await api("/auth/reset-password", { method: "POST", body: { email, code: resetCode, new_password: password } });
        setSubmitState("idle");
        goTo("sign-in", "Password changed. Sign in with your new password.");
        return;
      }
      const user = isCreating
        ? await api<AuthUser>("/auth/register", { method: "POST", body: { name, email, phone: phone.trim() || null, password } })
        : await api<AuthUser>("/auth/login", { method: "POST", body: signInWith === "email" ? { email, password } : { phone, password } });
      const enterApp = () => {
        onAuthenticated(user);
        const redirectPath = (location.state as LoginLocationState | null)?.from ?? "/";
        navigate(redirectPath.startsWith("/") && redirectPath !== "/login" ? redirectPath : "/", { replace: true });
      };
      // Show the tick, let the page lift away, then hand over to the app. Skipped for people who prefer less motion.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        enterApp();
        return;
      }
      setSubmitState("done");
      window.setTimeout(() => setIsLeaving(true), tickMs);
      window.setTimeout(enterApp, tickMs + leaveMs);
    } catch (error) {
      setSubmitState("idle");
      // Restart the shake each time, even when the same message is shown twice in a row.
      const card = cardRef.current;
      if (card) {
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
      }
      if (mode === "sign-in" && error instanceof ApiError && error.status === 401) {
        setErrorMessage(`${signInWith === "email" ? "Email" : "Phone number"} or password is incorrect.`);
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
      }
    }
  };

  return (
    <main className={`app-backdrop grid min-h-screen text-foreground lg:grid-cols-[1.1fr_1fr] ${isLeaving ? "login-leaving" : ""}`}>
      {/* A large version of the sky at the top of each page, as a welcome. */}
      <section aria-hidden="true" className="welcome-scene relative flex min-h-[260px] flex-col justify-center overflow-hidden px-8 py-10 lg:min-h-screen lg:px-12">
        <span className="welcome-sun" />
        <svg className="absolute inset-x-0 bottom-0 h-[42%] w-full" viewBox="0 0 800 300" preserveAspectRatio="none">
          <path d="M0,150 C140,80 260,90 400,140 C540,190 660,90 800,120 L800,300 L0,300 Z" fill="var(--hill-1)" />
          <path d="M0,220 C170,170 330,190 480,206 C630,222 720,180 800,190 L800,300 L0,300 Z" fill="var(--hill-2)" />
          <g transform="translate(560,90)">
            <rect x="0" y="40" width="96" height="66" rx="5" fill="var(--card)" />
            <path d="M-12,46 L48,2 L108,46 Z" fill="var(--primary)" />
            <rect x="38" y="66" width="20" height="40" rx="3" fill="var(--mustard)" />
            <rect x="12" y="58" width="16" height="16" rx="2" fill="var(--sky)" />
          </g>
        </svg>
        <div className="enter-rise relative max-w-[420px]">
          <p className="font-display text-[clamp(32px,4.4vw,56px)] font-bold leading-[1.04]">Looking after <em className="font-medium text-primary">family</em>, together.</p>
          <p className="mt-3.5 hidden text-lg sm:block">One shared list, with a helping hand deciding who is best placed for each job.</p>
        </div>
      </section>
      <div className="grid place-items-center px-5 py-10">
      <div className="relative w-full max-w-[420px]">
        <div className="mb-6">
          <p className="enter-rise text-sm font-extrabold text-primary" style={{ "--i": 1 } as React.CSSProperties}>{familyName}</p>
          <h1 className="enter-rise mt-1 font-display text-[32px] font-bold" style={{ "--i": 2 } as React.CSSProperties}>{isCreating ? "Create your account" : isRecovering ? "Reset your password" : "Welcome back"}</h1>
          <p className="enter-rise mt-1.5 text-sm text-muted-foreground" style={{ "--i": 3 } as React.CSSProperties}>{isCreating ? "Then set up a family space or join one with an invite code." : isRecovering ? "A code is sent to your linked Telegram." : "Sign in to coordinate your family’s care."}</p>
        </div>

        <div className="enter-card">
        <div ref={cardRef}>
        <Card className="is-visible">
          <CardHeader>
            <div>
              <h2 className="font-display text-[22px] font-bold">{isCreating ? "Create an account" : mode === "forgot" ? "Forgot password" : mode === "reset" ? "Enter your code" : "Sign in"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isCreating ? `Choose a password with at least ${minPasswordLength} characters.`
                  : mode === "forgot" ? "Enter the email you sign in with."
                    : mode === "reset" ? `Then choose a new password with at least ${minPasswordLength} characters.`
                      : "Use your email or phone number and your password."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {notice && <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</p>}
              {isCreating && (
                <FloatingField id="login-name" label="Full name" icon={UserRound} name="name" type="text" autoComplete="name" required autoFocus maxLength={150} value={name} onChange={(event) => setName(event.target.value)} />
              )}
              {mode === "sign-in" && (
                <div role="radiogroup" aria-label="Sign in with" className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted p-1">
                  {(["email", "phone"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={signInWith === option}
                      onClick={() => { setSignInWith(option); setErrorMessage(""); }}
                      className={`rounded-xl px-3 py-2 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${signInWith === option ? "shadow-soft bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {option === "email" ? "Email" : "Phone number"}
                    </button>
                  ))}
                </div>
              )}
              {(isCreating || isRecovering || signInWith === "email") && (
                <FloatingField id="login-email" label="Email address" icon={Mail} name="email" type="email" autoComplete="username" required autoFocus={mode === "sign-in" || mode === "forgot"} value={email} onChange={(event) => setEmail(event.target.value)} />
              )}
              {(isCreating || (mode === "sign-in" && signInWith === "phone")) && (
                <label className="block text-sm font-medium" htmlFor="login-phone">Phone number {isCreating && <span className="font-normal text-muted-foreground">(optional)</span>}
                  <span className="mt-1.5 block">
                    <PhoneInput
                      // Remount per mode so the field always shows the number that will be submitted.
                      key={mode}
                      id="login-phone"
                      defaultValue={phone}
                      onChange={setPhone}
                      required={!isCreating}
                      autoFocus={!isCreating}
                      className={phoneFieldClassName}
                    />
                  </span>
                  {isCreating && <span className="mt-1.5 block text-xs font-normal text-muted-foreground">Add one to sign in with your phone as well.</span>}
                </label>
              )}
              {mode === "reset" && (
                <FloatingField id="login-reset-code" label="6-digit code" icon={KeyRound} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={12} value={resetCode} onChange={(event) => setResetCode(event.target.value)} />
              )}
              {mode !== "forgot" && (
                <FloatingField id="login-password" label={mode === "reset" ? "New password" : "Password"} icon={LockKeyhole} name="password" type="password" autoComplete={setsNewPassword ? "new-password" : "current-password"} required minLength={setsNewPassword ? minPasswordLength : undefined} value={password} onChange={(event) => setPassword(event.target.value)} />
              )}
              {setsNewPassword && (
                <FloatingField id="login-password-confirmation" label={mode === "reset" ? "Confirm new password" : "Confirm password"} icon={LockKeyhole} name="password-confirmation" type="password" autoComplete="new-password" required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} />
              )}
              {mode === "sign-in" && (
                <p className="text-right text-sm">
                  <button type="button" onClick={() => goTo("forgot")} className="link-underline font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Forgot password?</button>
                </p>
              )}
              {errorMessage && <p role="alert" className="rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
              {/* The button shrinks to a circle with a spinner while waiting, then draws a tick on success. */}
              <div className="grid justify-items-center">
                <button type="submit" className="submit-morph focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-state={submitState} disabled={submitState !== "idle"}>
                  <span className="submit-text">{isCreating ? "Create account" : mode === "forgot" ? "Send code" : mode === "reset" ? "Change password" : "Sign in"}</span>
                  <span className="submit-spinner" aria-hidden="true" />
                  <span className="submit-tick" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span className="sr-only" role="status">{submitState === "loading" ? (isCreating ? "Creating account…" : isRecovering ? "Working…" : "Signing in…") : submitState === "done" ? "Signed in" : ""}</span>
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
        </div>
        </div>
        <p className="enter-rise mt-5 text-center text-sm text-muted-foreground" style={{ "--i": 6 } as React.CSSProperties}>
          {mode === "sign-in" ? "New here?" : isRecovering ? "Remembered it?" : "Already have an account?"}{" "}
          <button type="button" onClick={switchMode} className="font-semibold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
      </div>
    </main>
  );
}