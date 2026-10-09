import { useState, type FormEvent } from "react";
import { HeartPulse, LockKeyhole, Mail } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface LoginPageProps {
  familyName: string;
  onAuthenticated: (user: AuthUser) => void;
}

interface LoginLocationState {
  from?: string;
}

export function LoginPage({ familyName, onAuthenticated }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.status === 401) {
        throw new Error("Email or password is incorrect.");
      }
      if (!response.ok) {
        throw new Error("Sign-in is unavailable. Check that the API and database are running.");
      }

      const user = await response.json() as AuthUser;
      onAuthenticated(user);
      const redirectPath = (location.state as LoginLocationState | null)?.from ?? "/";
      navigate(redirectPath.startsWith("/") && redirectPath !== "/login" ? redirectPath : "/", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
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
          <h1 className="mt-1 font-display text-3xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to coordinate your family’s care.</p>
        </div>

        <Card className="bg-white/90 shadow-md backdrop-blur-xl">
          <CardHeader>
            <div>
              <h2 className="font-display text-xl font-semibold">Sign in</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use the email and password provided by your household owner.</p>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium" htmlFor="login-email">Email address
                <span className="relative mt-1.5 block">
                  <Mail size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </span>
              </label>
              <label className="block text-sm font-medium" htmlFor="login-password">Password
                <span className="relative mt-1.5 block">
                  <LockKeyhole size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none transition focus:ring-2 focus:ring-ring"
                  />
                </span>
              </label>
              {errorMessage && <p role="alert" className="rounded-lg bg-alert/10 px-3 py-2 text-sm text-alert">{errorMessage}</p>}
              <Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-xs text-muted-foreground">Need access? Contact your household owner.</p>
      </div>
    </main>
  );
}