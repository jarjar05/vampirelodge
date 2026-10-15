import { cn } from "@/lib/utils";
import type { AvatarTone } from "@/types/care";

// A solid fill in the person's own colour, with white initials, as in the family journal.
const toneStyles: Record<AvatarTone, string> = {
  sage: "bg-sage",
  coral: "bg-clay",
  gold: "bg-mustard",
  sky: "bg-sky",
  violet: "bg-plum",
  teal: "bg-teal",
  rose: "bg-rose",
  indigo: "bg-indigo",
};

/** The colour each tone stands for, for drawings and tints in that person's colour. */
export const toneColours: Record<AvatarTone, string> = {
  sage: "var(--sage)",
  coral: "var(--primary)",
  gold: "var(--mustard)",
  sky: "var(--sky)",
  violet: "var(--plum)",
  teal: "var(--teal)",
  rose: "var(--rose)",
  indigo: "var(--indigo)",
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
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-primary-foreground", toneStyles[tone], className)}
    >
      {initials}
    </span>
  );
}
