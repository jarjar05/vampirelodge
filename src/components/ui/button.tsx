import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Lifts and gains a coloured shadow on hover, then presses back down on click.
        default: "bg-primary text-primary-foreground shadow-sm shadow-primary/30 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/50 active:translate-y-0 active:shadow-sm",
        // Lifts like the main buttons, with a soft neutral shadow and a green edge.
        outline: "border border-border bg-card shadow-sm shadow-foreground/[0.04] hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-lg hover:shadow-foreground/10 active:translate-y-0 active:shadow-sm",
        ghost: "hover:bg-primary/10 hover:text-primary",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, size, variant, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
}