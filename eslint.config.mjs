import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // The raw service-role client bypasses RLS and sees every dealership. Dealership code uses
  // tenantClient()/currentTenantClient(); see src/lib/server/privileged.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/server/privileged/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/server/privileged/client", "@/lib/server/privileged/scoped-client"],
              message: "Use tenantClient() or currentTenantClient() from @/lib/server/privileged.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
