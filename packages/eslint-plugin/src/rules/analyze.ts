// Test-only fixture: a live `SourceCode` without RuleTester.
//
// The adapter's seam is "a rule body, running where scope analysis is live".
// RuleTester is one adapter of it and drives whole rules end to end; this is
// the other, and hands the body back to the caller so a collector or a rule's
// listener can be driven directly. Not part of the package's surface — nothing
// in `src/index.ts` reaches it.

import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import { tagName } from "./collect.js";

type SourceCode = Readonly<TSESLint.SourceCode>;

/** One file, parsed: its `SourceCode`, its name, and every JSX element in it. */
export interface Analysis {
  sourceCode: SourceCode;
  filename: string;
  elements: TSESTree.JSXElement[];
}

// Runs `compute` inside a rule, where scope analysis is live.
export function analyze<T>(
  code: string,
  compute: (analysis: Analysis) => T,
  filename = "src/app.tsx",
): T {
  const linter = new Linter();
  const elements: TSESTree.JSXElement[] = [];
  // An array, not a scalar: TS doesn't track assignments inside the closure.
  const captured: T[] = [];

  linter.verify(
    code,
    {
      // Without a `files` pattern, `.ts`/`.tsx` match no flat config.
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: {
        probe: {
          rules: {
            capture: {
              create(context) {
                const sourceCode = context.sourceCode as unknown as SourceCode;

                return {
                  JSXElement(node: TSESTree.JSXElement): void {
                    elements.push(node);
                  },
                  "Program:exit"(): void {
                    captured.push(
                      compute({
                        sourceCode,
                        filename: context.filename,
                        elements,
                      }),
                    );
                  },
                };
              },
            },
          },
        },
      },
      rules: { "probe/capture": "error" },
    },
    filename,
  );

  const [result] = captured;

  if (result === undefined) {
    throw new Error("capture rule did not run");
  }

  return result;
}

/** The first element with the given dotted tag; throws so tests read straight. */
export function elementNamed(
  elements: TSESTree.JSXElement[],
  name: string,
): TSESTree.JSXElement {
  const found = elements.find(
    (element) => tagName(element.openingElement.name) === name,
  );

  if (found === undefined) {
    throw new Error(`no <${name}> in fixture`);
  }

  return found;
}
