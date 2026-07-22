// Drives the prop collectors through the `analyze` harness.

import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { describe, expect, it } from "vitest";

import type { PropFact } from "../../contracts/rendered-tree/rendered-tree.js";
import { analyze, elementNamed } from "../testing/analyze.js";

import {
  collectProps,
  hasSpreadAttribute,
  isAttributePresent,
} from "./props.js";

describe("isAttributePresent", () => {
  function presenceOf(attribute: string): boolean {
    return analyze(`const x = <Widget ${attribute} />;`, ({ elements }) => {
      const [written] = elementNamed(elements, "Widget").openingElement
        .attributes;

      if (written?.type !== AST_NODE_TYPES.JSXAttribute) {
        throw new Error("expected a written attribute");
      }

      return isAttributePresent(written.value);
    });
  }

  it("counts a bare, string-valued or truthy attribute as present", () => {
    expect(presenceOf("open")).toBe(true);
    expect(presenceOf('label="hi"')).toBe(true);
    expect(presenceOf("open={true}")).toBe(true);
    expect(presenceOf("count={0}")).toBe(true);
  });

  it("counts only false, null and undefined as absent", () => {
    expect(presenceOf("open={false}")).toBe(false);
    expect(presenceOf("open={null}")).toBe(false);
    expect(presenceOf("open={undefined}")).toBe(false);
  });

  it("counts an unresolvable expression as present", () => {
    expect(presenceOf("open={maybe}")).toBe(true);
  });
});

describe("collectProps", () => {
  function factsOf(attributes: string): Map<string, PropFact> {
    return analyze(
      `const x = <Widget ${attributes} />;`,
      ({ sourceCode, elements }) =>
        new Map(
          collectProps(
            sourceCode,
            elementNamed(elements, "Widget").openingElement,
          ).map((fact) => [fact.name, fact]),
        ),
    );
  }

  it("resolves the literal arms: string, number and boolean", () => {
    const facts = factsOf('label="hi" size={2} open={true} shut={false}');

    expect(facts.get("label")?.value).toBe("hi");
    expect(facts.get("size")?.value).toBe(2);
    expect(facts.get("open")?.value).toBe(true);
    expect(facts.get("shut")?.value).toBe(false);
  });

  it("resolves a template literal with no substitutions", () => {
    const facts = factsOf("label={`hi`}");

    expect(facts.get("label")?.value).toBe("hi");
  });

  it("leaves a substituted template literal unresolved", () => {
    // The `${` is split, so this file's own lint does not read the fixture as
    // a mis-quoted template.
    const facts = factsOf("label={`hi $" + "{who}`}");

    expect(facts.get("label")?.value).toBeUndefined();
    expect(facts.get("label")?.source).toBeUndefined();
    expect(facts.get("label")?.present).toBe(true);
  });

  it("records an identifier or member expression as source text", () => {
    const facts = factsOf("size={Size.large} tone={tone}");

    expect(facts.get("size")?.source).toBe("Size.large");
    expect(facts.get("tone")?.source).toBe("tone");
  });

  it("skips spreads and namespaced attribute names", () => {
    const facts = factsOf("{...rest} xlink:href='#a' label='hi'");

    expect([...facts.keys()]).toEqual(["label"]);
  });
});

describe("hasSpreadAttribute", () => {
  function spreadOn(attributes: string): boolean {
    return analyze(`const x = <Widget ${attributes} />;`, ({ elements }) =>
      hasSpreadAttribute(elementNamed(elements, "Widget").openingElement),
    );
  }

  it("is true only when the element carries a spread", () => {
    expect(spreadOn("{...rest}")).toBe(true);
    expect(spreadOn('label="hi" {...rest}')).toBe(true);
    expect(spreadOn('label="hi"')).toBe(false);
  });
});
