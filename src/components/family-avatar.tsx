import { cn } from "@/lib/utils";

const toneStyles = {
  sage: "bg-primary/10 text-primary",
  coral: "bg-accent text-accent-foreground",
  gold: "bg-secondary text-secondary-foreground",
};

/** A person's profile picture, or their initials on a tinted circle when they have none. */
export function FamilyAvatar({
  initials,
  tone = "sage",
  imageUrl,
  className,
}: {
  initials: string;
  tone?: keyof typeof toneStyles;
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
