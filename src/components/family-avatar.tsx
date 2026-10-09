import { cn } from "@/lib/utils";

const toneStyles = {
  sage: "bg-primary/10 text-primary",
  coral: "bg-accent text-accent-foreground",
  gold: "bg-secondary text-secondary-foreground",
};

export function FamilyAvatar({
  initials,
  tone = "sage",
  className,
}: {
  initials: string;
  tone?: keyof typeof toneStyles;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", toneStyles[tone], className)}
    >
      {initials}
    </span>
  );
}