import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["out/", "dist/", "**/*.d.ts"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
      // shortcut: @typescript-eslint/semi was removed in v8 and core semi is deprecated until ESLint 11 and misses TS-only statements; move to @stylistic/semi then.
      semi: "warn",
      curly: "warn",
      eqeqeq: "warn",
      // successor of no-throw-literal, which recommendedTypeChecked turns off
      "@typescript-eslint/only-throw-error": "warn",
    },
  },
);
