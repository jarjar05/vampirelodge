import { FamilyWelcome } from "@/components/family-welcome";
import { cn } from "@/lib/utils";

/**
 * The screens before the app: signing in, creating an account, and setting up a family. The family picture fills
 * one side (the top, on a narrow screen) and the form sits on the other. Both keep their proportions at any size
 * or zoom: the picture trims a little from its edges rather than stretching, and the form keeps a readable width.
 */
export function WelcomeLayout({ isLeaving = false, children }: { isLeaving?: boolean; children: React.ReactNode }) {
  return (
    <main className={cn("app-backdrop min-h-dvh text-foreground lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(30rem,1fr)]", isLeaving && "login-leaving")}>
      <section className="welcome-panel relative flex h-[clamp(20rem,68vw,30rem)] flex-col overflow-hidden px-6 pt-7 sm:px-10 sm:pt-10 lg:sticky lg:top-0 lg:h-dvh lg:px-12 lg:pt-12">
        <FamilyWelcome />
        <div className="enter-rise relative z-[1] max-w-[34rem] pr-[4.5rem] lg:pr-0">
          <p className="flex items-center gap-2.5 text-sm font-extrabold text-foreground/75">
            <span aria-hidden="true" className="brand-mark grid size-8 place-items-center rounded-lg text-sm">☀</span>
            CareCircle
          </p>
          <p className="mt-4 font-display text-[clamp(1.9rem,3.4vw,3.6rem)] font-bold leading-[1.04] lg:mt-8">
            Looking after <em className="font-medium text-primary">family</em>, together.
          </p>
          <p className="mt-3 hidden max-w-[26rem] text-[clamp(1rem,1.15vw,1.2rem)] text-foreground/80 lg:block">One shared list, with a helping hand deciding who is best placed for each job.</p>
        </div>
      </section>
      <div className="flex justify-center px-5 py-10 sm:px-8 lg:min-h-dvh lg:items-center lg:py-14">
        <div className="welcome-form w-full max-w-[26rem]">{children}</div>
      </div>
    </main>
  );
}
