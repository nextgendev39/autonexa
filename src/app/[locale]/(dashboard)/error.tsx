"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState onRetry={reset} />;
}
