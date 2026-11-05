/** One person's access, as stored: their home branch and the branch of each role. */
export type BranchAccessRow = {
  id: string;
  branchId: string | null;
  roles: { branchId: string | null; key: string | null }[];
};

/**
 * Mirrors public.can_access_branch(): Super Admins and all-branch roles reach every branch, other
 * roles reach their own branch, and someone with no role reaches only their home branch.
 */
export function canReachBranch(person: BranchAccessRow, branchId: string) {
  if (person.roles.length === 0) return person.branchId === branchId;
  return person.roles.some(
    (role) => role.key === "super_admin" || role.branchId === null || role.branchId === branchId,
  );
}
