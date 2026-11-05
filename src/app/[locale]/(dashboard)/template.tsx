// Templates remount on every navigation, so each route gets a fresh entrance.
// The wrapper grows with its content (no min-h-0): if it shrank to the scroll area's
// height, the content would overflow past it and <main>'s bottom padding would be lost.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in flex flex-1 shrink-0 flex-col">{children}</div>;
}
