/**
 * Sales executives create bookings for their own customers; new customers default to
 * them as the sales person. Super Admins are never treated as sales executives.
 */
export function isSalesExecutive(roles: readonly string[]) {
  return roles.includes("sales_executive") && !roles.includes("super_admin");
}

/**
 * Super Admins and Accountants see every booking; everyone else sees only bookings assigned
 * to them as sales executive, or that they created without one (mirrors
 * public.can_view_all_bookings() and the reservations RLS policies).
 */
export function canViewAllBookings(roles: readonly string[]) {
  return roles.includes("super_admin") || roles.includes("accountant");
}

/**
 * Sales executives see only what they negotiate with on a vehicle: the target selling
 * price and the maximum discount. The database grants them pricing.view (00034), so
 * that can't be the signal; holding cost access or pricing edit rights (e.g. also being
 * an accountant) is what unlocks the full pricing view.
 */
export function seesSalesPricingOnly(
  roles: readonly string[],
  can: (permission: "vehicle.cost.view" | "pricing.update") => boolean,
) {
  return isSalesExecutive(roles) && !can("vehicle.cost.view") && !can("pricing.update");
}
