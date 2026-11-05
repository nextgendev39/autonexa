"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg items-center px-4">
      <ErrorState onRetry={reset} />
    </div>
  );
}
