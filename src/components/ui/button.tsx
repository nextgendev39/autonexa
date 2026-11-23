import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,filter] duration-200 ease-(--ease-standard) outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Primary: obsidian in light mode, champagne gold in dark mode. */
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover hover:shadow-sm active:bg-primary",
        /** Key action: champagne gradient with obsidian text (auth submit, key create actions). */
        brand:
          "relative overflow-hidden gradient-champagne text-gold-foreground shadow-sm hover:shadow-md hover:brightness-[1.04]",
        /** Secondary: neutral surface with a border. */
        outline:
          "border-border bg-card text-foreground shadow-xs hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_12%)] hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground",
        /** Transparent with a champagne border. */
        "brand-outline":
          "border-brand/45 bg-transparent text-brand hover:border-brand hover:bg-brand-soft aria-expanded:bg-brand-soft",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        /** Danger (soft): row actions and menus. */
        destructive:
          "bg-danger-soft text-danger-foreground hover:bg-[color-mix(in_srgb,var(--destructive)_18%,transparent)] focus-visible:border-destructive/40 focus-visible:ring-destructive/25",
        /** Danger (solid): final confirmation of irreversible actions. */
        danger:
          "bg-destructive text-white shadow-xs hover:brightness-95 focus-visible:border-destructive/40 focus-visible:ring-destructive/25 dark:text-[#2a0d0d]",
        /** Premium: solid champagne. Use sparingly, never as the default primary action. */
        premium: "bg-gold text-gold-foreground shadow-xs hover:shadow-sm hover:brightness-105",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pe-2.5 has-data-[icon=inline-start]:ps-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-md px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
