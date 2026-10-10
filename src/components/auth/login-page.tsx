import { useState, type FormEvent } from "react";
import { HeartPulse, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
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
const inputClassName = "h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none transition focus:ring-2 focus:ring-ring";
const phoneFieldClassName = "h-11 rounded-xl border border-input bg-background px-3 text-sm font-normal outline-none transition focus:ring-2 focus:ring-ring";
const iconClassName = "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground";

export function LoginPage({ familyName, onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [name, setName] = useState("");
  const [signInWith, setSignInWith] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isCreating = mode === "create";

  const switchMode = () => {
    setMode(isCreating ? "sign-in" : "create");
    setErrorMessage("");
    setPassword("");
    setPasswordConfirmation("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (isCreating && password !== passwordConfirmation) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);

    try {
      const user = isCreating
        ? await api<AuthUser>("/auth/register", { method: "POST", body: { name, email, phone: phone.trim() || null, password } })
        : await api<AuthUser>("/auth/login", { method: "POST", body: signInWith === "email" ? { email, password } : { phone, password } });
      onAuthenticated(user);
      const redirectPath = (location.state as LoginLocationState | null)?.from ?? "/";
      navigate(redirectPath.startsWith("/") && redirectPath !== "/login" ? redirectPath : "/", { replace: true });
    } catch (error) {
      if (!isCreating && error instanceof ApiError && error.status === 401) {
        setErrorMessage(`${signInWith === "email" ? "Email" : "Phone number"} or password is incorrect.`);
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
      }
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
          <p className="mt-4 text-sm font-semibold text-primary">{familyName}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">{isCreating ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{isCreating ? "Then set up a family space or join one with an invite code." : "Sign in to coordinate your family’s care."}</p>
        </div>

        <Card className="bg-white/90 shadow-md backdrop-blur-xl">
          <CardHeader>
            <div>
              <h2 className="font-display text-xl font-semibold">{isCreating ? "Create an account" : "Sign in"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{isCreating ? `Choose a password with at least ${minPasswordLength} characters.` : "Use your email or phone number and your password."}</p>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isCreating && (
                <label className="block text-sm font-medium" htmlFor="login-name">Full name
                  <span className="relative mt-1.5 block">
                    <UserRound size={16} aria-hidden="true" className={iconClassName} />
                    <input
                      id="login-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      autoFocus
                      maxLength={150}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClassName}
                    />
                  </span>
                </label>
              )}
              {!isCreating && (
                <div role="radiogroup" aria-label="Sign in with" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/60 p-1">
                  {(["email", "phone"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={signInWith === option}
                      onClick={() => { setSignInWith(option); setErrorMessage(""); }}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${signInWith === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {option === "email" ? "Email" : "Phone number"}
                    </button>
                  ))}
                </div>
              )}
              {(isCreating || signInWith === "email") && (
                <label className="block text-sm font-medium" htmlFor="login-email">Email address
                  <span className="relative mt-1.5 block">
                    <Mail size={16} aria-hidden="true" className={iconClassName} />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      autoFocus={!isCreating}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={inputClassName}
                    />
                  </span>
                </label>
              )}
              {(isCreating || signInWith === "phone") && (
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
              <label className="block text-sm font-medium" htmlFor="login-password">Password
                <span className="relative mt-1.5 block">
                  <LockKeyhole size={16} aria-hidden="true" className={iconClassName} />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete={isCreating ? "new-password" : "current-password"}
                    required
                    minLength={isCreating ? minPasswordLength : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClassName}
                  />
                </span>
              </label>
              {isCreating && (
                <label className="block text-sm font-medium" htmlFor="login-password-confirmation">Confirm password
                  <span className="relative mt-1.5 block">
                    <LockKeyhole size={16} aria-hidden="true" className={iconClassName} />
                    <input
                      id="login-password-confirmation"
                      name="password-confirmation"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      className={inputClassName}
                    />
                  </span>
                </label>
              )}
              {errorMessage && <p role="alert" className="rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
              <Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
                {isCreating ? (isSubmitting ? "Creating account…" : "Create account") : (isSubmitting ? "Signing in…" : "Sign in")}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {isCreating ? "Already have an account?" : "New here?"}{" "}
          <button type="button" onClick={switchMode} className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {isCreating ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </main>
  );
}