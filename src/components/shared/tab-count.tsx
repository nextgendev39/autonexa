import { ChipCount } from "@/components/ui/chip";

/**
 * Count bubble beside a filter label. Same component as the chip counts, so every counter in
 * the app looks alike: muted by default, inverted on the selected filter, red for attention.
 */
export function TabCount({
  children,
  selected,
  alert = false,
}: {
  children: React.ReactNode;
  selected: boolean;
  alert?: boolean;
}) {
  return (
    <ChipCount selected={selected} alert={alert}>
      {children}
    </ChipCount>
  );
}
