import { useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { KeyRound, LockKeyhole, Mail, UserRound, type LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { PhoneInput } from "@/components/phone-input";
import { Card, CardContent } from "@/components/ui/card";
import { WelcomeLayout } from "@/components/welcome-layout";

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
const phoneFieldClassName = "h-[3.6rem] rounded-[14px] border border-input bg-background px-4 text-[15px] font-normal outline-none transition-[border-color,box-shadow]";

/** A text field whose label sits inside the box and lifts to the top when the field is focused or filled. */
function FloatingField({ id, label, icon: Icon, ...input }: { id: string; label: string; icon: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="float-field relative">
      <Icon size={17} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
      {/* The single-space placeholder is what lets the styles tell an empty field from a filled one. */}
      <input id={id} placeholder=" " className="h-[3.6rem] w-full rounded-[14px] border border-input bg-background pb-1.5 pl-11 pr-4 pt-5 text-[15px] font-semibold outline-none" {...input} />
      <label htmlFor={id} className="pointer-events-none absolute left-11 top-[1.15rem] text-[15px] font-bold text-muted-foreground">{label}</label>
    </div>
  );
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
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

  const title = isCreating ? "Create your account" : isRecovering ? "Reset your password" : "Welcome";
  const lead = isCreating ? "Then set up a family space, or join one with an invite code."
    : mode === "forgot" ? "Enter the email you sign in with, and we’ll send a code to your linked Telegram."
      : mode === "reset" ? "Enter the code, then choose a new password."
        : "Sign in with your email or phone number.";

  return (
    <WelcomeLayout isLeaving={isLeaving}>
        <div className="mb-7">
          <h1 className="enter-rise font-display text-[clamp(2rem,2.6vw,2.6rem)] font-bold leading-tight" style={{ "--i": 2 } as React.CSSProperties}>{title}</h1>
          <p className="enter-rise mt-2 text-[15px] text-muted-foreground" style={{ "--i": 3 } as React.CSSProperties}>{lead}</p>
        </div>

        <div className="enter-card">
        <div ref={cardRef}>
        <Card className="is-visible">
          <CardContent className="p-6 sm:p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              {notice && <p role="status" className="rounded-xl bg-primary/10 px-3.5 py-2.5 text-sm font-semibold text-primary">{notice}</p>}
              {isCreating && (
                <FloatingField id="login-name" label="Full name" icon={UserRound} name="name" type="text" autoComplete="name" required autoFocus maxLength={150} value={name} onChange={(event) => setName(event.target.value)} />
              )}
              {mode === "sign-in" && (
                <div role="radiogroup" aria-label="Sign in with" className="relative grid grid-cols-2 gap-1 rounded-2xl border border-border bg-muted p-1">
                  {/* The highlight slides to the chosen option. */}
                  <span aria-hidden="true" className="segment-thumb shadow-soft pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-xl bg-card" style={{ translate: signInWith === "phone" ? "calc(100% + 0.25rem) 0" : "0 0" }} />
                  {(["email", "phone"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={signInWith === option}
                      onClick={() => { setSignInWith(option); setErrorMessage(""); }}
                      className={`relative rounded-xl px-3 py-2.5 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${signInWith === option ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
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
                <label className="block text-sm font-bold" htmlFor="login-phone">Phone number {isCreating && <span className="font-semibold text-muted-foreground">(optional)</span>}
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
                  {isCreating && <span className="mt-1.5 block text-[13px] font-normal text-muted-foreground">Add one to sign in with your phone as well.</span>}
                </label>
              )}
              {mode === "reset" && (
                <FloatingField id="login-reset-code" label="6-digit code" icon={KeyRound} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={12} value={resetCode} onChange={(event) => setResetCode(event.target.value)} />
              )}
              {mode !== "forgot" && (
                <FloatingField id="login-password" label={mode === "reset" ? "New password" : "Password"} icon={LockKeyhole} name="password" type="password" autoComplete={setsNewPassword ? "new-password" : "current-password"} required minLength={setsNewPassword ? minPasswordLength : undefined} value={password} onChange={(event) => setPassword(event.target.value)} />
              )}
              {setsNewPassword && <p className="-mt-2 px-1 text-[13px] text-muted-foreground">At least {minPasswordLength} characters.</p>}
              {setsNewPassword && (
                <FloatingField id="login-password-confirmation" label={mode === "reset" ? "Confirm new password" : "Confirm password"} icon={LockKeyhole} name="password-confirmation" type="password" autoComplete="new-password" required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} />
              )}
              {mode === "sign-in" && (
                <p className="-mt-1 text-right text-sm">
                  <button type="button" onClick={() => goTo("forgot")} className="link-underline font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Forgot password?</button>
                </p>
              )}
              {errorMessage && <p role="alert" className="rounded-xl bg-alert/10 px-3.5 py-2.5 text-sm font-semibold text-alert">{errorMessage}</p>}
              {/* The button shrinks to a circle with a spinner while waiting, then draws a tick on success. */}
              <div className="grid justify-items-center pt-1">
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
        <p className="enter-rise mt-6 text-center text-[15px] text-muted-foreground" style={{ "--i": 6 } as React.CSSProperties}>
          {mode === "sign-in" ? "New here?" : isRecovering ? "Remembered it?" : "Already have an account?"}{" "}
          <button type="button" onClick={switchMode} className="font-extrabold text-primary link-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </button>
        </p>
    </WelcomeLayout>
  );
}