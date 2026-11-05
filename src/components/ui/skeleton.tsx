import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // A faint gold sweep over the muted base, in the brand's colours.
        "animate-shimmer rounded-md bg-muted bg-[linear-gradient(90deg,transparent_25%,color-mix(in_oklch,var(--brand)_12%,transparent)_50%,transparent_75%)] bg-size-[200%_100%] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
