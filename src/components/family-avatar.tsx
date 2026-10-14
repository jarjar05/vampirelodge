import { cn } from "@/lib/utils";
import type { AvatarTone } from "@/types/care";

// A pale fill with dark letters of the same colour, so the initials stay easy to read on every one.
const toneStyles: Record<AvatarTone, string> = {
  sage: "bg-primary/10 text-primary",
  coral: "bg-accent text-accent-foreground",
  gold: "bg-secondary text-secondary-foreground",
  sky: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  teal: "bg-teal-100 text-teal-800",
  rose: "bg-rose-100 text-rose-800",
  indigo: "bg-indigo-100 text-indigo-800",
};

/** A person's profile picture, or their initials on a tinted circle when they have none. */
export function FamilyAvatar({
  initials,
  tone = "sage",
  imageUrl,
  className,
}: {
  initials: string;
  tone?: AvatarTone;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" aria-hidden="true" className={cn("inline-block size-9 shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", toneStyles[tone], className)}
    >
      {initials}
    </span>
  );
}
