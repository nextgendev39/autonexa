import type { ComponentProps } from "react";

import { Spinner } from "@/components/shared/spinner";
import { Button } from "@/components/ui/button";

export function LoadingButton({
  loading = false,
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </Button>
  );
}
