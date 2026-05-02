import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The React Compiler skips optimizing hooks with manually-specified deps
      // that differ from its inferred deps. This is expected — the compiler
      // still optimizes everything else. Not a bug.
      "react-hooks/preserve-manual-memoization": "off",
      // All images in this app are dynamically generated (ComfyUI, profiles)
      // with unknown dimensions — next/image adds unnecessary complexity.
      "@next/next/no-img-element": "off",
      // Allow underscore-prefixed variables to signal intentionally unused params.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".worktrees/**",
    ".worktrees/**/.next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
