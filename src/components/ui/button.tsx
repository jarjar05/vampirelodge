import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Lifts and gains a coloured shadow on hover, then presses back down on click.
        default: "bg-primary text-primary-foreground shadow-[0_8px_18px_-10px_var(--primary)] hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-12px_var(--primary)] active:translate-y-0",
        // Lifts like the main buttons, with a soft neutral shadow and a green edge.
        outline: "shadow-soft border border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-[var(--shadow-lift)] active:translate-y-0",
        ghost: "hover:bg-primary/10 hover:text-primary",
      },
      size: {
        default: "h-11 px-[18px] py-2",
        sm: "h-9 rounded-xl px-3.5",
        icon: "size-10 rounded-full",
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