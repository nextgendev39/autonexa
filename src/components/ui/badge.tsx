import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/**
 * AutoNexa pill: fully rounded, hairline border, soft tint. Semantic variants keep their
 * meaning in both themes — success (available), info (sold), warning (pending),
 * destructive (rejected), secondary (inactive), premium (champagne).
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border font-medium whitespace-nowrap transition-[color,background-color,border-color] focus-visible:ring-[3px] focus-visible:ring-ring/40 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary-hover",
        secondary: "border-border bg-muted text-muted-foreground [a]:hover:bg-muted/70",
        neutral: "border-border bg-muted text-muted-foreground",
        destructive: "border-destructive/25 bg-danger-soft text-danger-foreground",
        outline: "border-border bg-card text-foreground [a]:hover:bg-muted",
        ghost: "border-transparent hover:bg-muted hover:text-muted-foreground",
        success: "border-success/25 bg-success-soft text-success-foreground",
        warning: "border-warning/30 bg-warning-soft text-warning-foreground",
        info: "border-info/25 bg-info-soft text-info-foreground",
        brand: "border-brand/25 bg-brand-soft text-brand",
        premium: "border-gold/35 bg-gold-soft text-premium-foreground",
        link: "border-transparent text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-6 px-2.5 text-xs",
        sm: "h-5 px-2 text-[11px]",
        lg: "h-7 px-3 text-[0.8125rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
