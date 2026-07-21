import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import checkFile from "eslint-plugin-check-file";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

import jsxContracts from "@jsx-contracts/eslint-plugin";

import { contracts } from "./packages/playground/src/contracts.js";

// https://github.com/micromatch/micromatch#readme
const kebabCase = "+([a-z0-9])*(-+([a-z0-9]))";

export default defineConfig(
  {
    // scripts/ is release tooling — typechecked by tsc, not style-linted here.
    ignores: ["packages/*/build/", "**/*.d.ts", "scripts/"],
  },

  eslint.configs.recommended,
  {
    rules: {
      curly: "warn",
      eqeqeq: "warn",
      "no-console": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-fallthrough": ["warn", { allowEmptyCase: true }],
      "no-template-curly-in-string": "warn",
      "sort-imports": ["warn", { ignoreDeclarationSort: true }],
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        require: true,
      },
    },
  },

  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/explicit-member-accessibility": "warn",
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: {
            regex: "^I[A-Z]",
            match: false,
          },
        },
      ],
      "@typescript-eslint/no-confusing-void-expression": "warn",
      "@typescript-eslint/no-unnecessary-condition": [
        "warn",
        { allowConstantLoopConditions: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true },
      ],
      "@typescript-eslint/prefer-enum-initializers": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": [
        "warn",
        {
          ignoreConditionalTests: true,
          ignoreMixedLogicalExpressions: true,
        },
      ],
      "@typescript-eslint/promise-function-async": "warn",
      "@typescript-eslint/restrict-template-expressions": [
        "warn",
        { allowNumber: true },
      ],
      "@typescript-eslint/return-await": ["warn", "always"],
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    // .sandcastle/ is a dev-only agent runner: it logs to the terminal by design.
    files: [".sandcastle/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  stylistic.configs["disable-legacy"],
  {
    plugins: { stylistic },
    rules: {
      "stylistic/jsx-curly-brace-presence": [
        "warn",
        {
          props: "never",
          children: "never",
          propElementValues: "always",
        },
      ],
      "stylistic/lines-between-class-members": [
        "warn",
        "always",
        { exceptAfterSingleLine: true },
      ],
      "stylistic/padding-line-between-statements": [
        "warn",
        {
          blankLine: "always",
          prev: [
            "block-like",
            { selector: "SwitchCase[consequent.length > 0]" },
            "default",
            "interface",
            "multiline-const",
            "multiline-expression",
            "multiline-let",
          ],
          next: "*",
        },
        {
          blankLine: "never",
          prev: [{ selector: "SwitchCase[consequent.length = 0]" }],
          next: "*",
        },
      ],
      "stylistic/quotes": ["warn", "double", { avoidEscape: true }],
    },
  },

  importPlugin.flatConfigs.typescript,
  {
    settings: {
      "import/internal-regex": "^@jsx-contracts/",
    },
    rules: {
      "import/consistent-type-specifier-style": ["warn", "prefer-top-level"],
      "import/export": "warn",
      "import/newline-after-import": "warn",
      "import/no-duplicates": "warn",
      "import/no-extraneous-dependencies": [
        "warn",
        {
          devDependencies: [
            ".sandcastle/**/*.ts",
            "**/*.config.ts",
            "**/*.test.ts",
            "**/*.test.tsx",
            "**/*.d.ts",
          ],
        },
      ],
      "import/no-named-as-default": "warn",
      "import/order": [
        "warn",
        {
          alphabetize: {
            order: "asc",
            orderImportKind: "asc",
            caseInsensitive: true,
          },
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          pathGroupsExcludedImportTypes: ["builtin"],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    ignores: ["**/*.config.ts", "packages/eslint-plugin/src/index.ts"],
    rules: {
      "import/no-default-export": "warn",
    },
  },

  { plugins: { "check-file": checkFile } },
  {
    files: ["packages/*/src/**"],
    rules: {
      "check-file/folder-naming-convention": [
        "warn",
        { "**": `(${kebabCase}|__mocks__)` },
      ],
      "check-file/filename-naming-convention": [
        "warn",
        {
          "**/*.ts": `${kebabCase}?(.{d,client,server,test})`,
          "**/*.tsx": `${kebabCase}?(.{client,server,stories,test})`,
        },
      ],
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    extends: [vitest.configs.recommended],
    settings: {
      vitest: {
        typecheck: true,
      },
    },
    rules: {
      "vitest/expect-expect": ["warn", { assertFunctionNames: ["expect*"] }],
    },
  },

  {
    files: ["packages/playground/src/**/*.tsx"],
    plugins: { "@jsx-contracts": jsxContracts },
    rules: contracts.rules(),
  },
);
