// The four business roles have translated labels; anything else shows the name stored in the roles table.
const translatedRoleKeys = ["super_admin", "accountant", "sales_executive", "logistics"];

export function roleLabel(
  role: { key: string; name: string },
  t: (key: string) => string,
) {
  return translatedRoleKeys.includes(role.key) ? t(`roleNames.${role.key}`) : role.name;
}
