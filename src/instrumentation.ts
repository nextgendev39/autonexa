// Runs once when a Next.js server instance starts.
export async function register() {
  // The booking deadline loop needs Node (web-push, timers); skip the Edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBookingDeadlineLoop } = await import("@/lib/notifications/service");
  startBookingDeadlineLoop();
}
