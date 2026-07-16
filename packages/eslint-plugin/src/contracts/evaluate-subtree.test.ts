import { describe, expect, it } from "vitest";

import type {
  PreparedSubtree,
  SubtreeElement,
  SubtreeNode,
  SubtreeRef,
} from "./evaluate-subtree.js";
import { evaluateSubtree, prepareSubtree } from "./evaluate-subtree.js";
import { createImportMatcher } from "./import-matcher.js";
import type { PropFact } from "./model.js";

// A fresh `ref` per node so violations can be matched back by identity.
function node(
  name: string,
  overrides: Partial<SubtreeElement> = {},
): SubtreeElement {
  return {
    kind: "element",
    name,
    ref: {},
    importSource: null,
    props: [],
    propChildren: [],
    children: [],
    ...overrides,
  };
}

// A lazy reference node keyed by `initId`, resolving to `produced` each call.
function ref(initId: number, resolve: () => SubtreeNode[]): SubtreeRef {
  return { kind: "ref", initId, resolve };
}

function prop(name: string, extra: Partial<PropFact> = {}): PropFact {
  return { name, present: true, ...extra };
}

// A presence-activated ban forbidding <button>; the root activates on `to`.
function forbidButton(
  overrides: Partial<PreparedSubtree> = {},
): PreparedSubtree {
  return {
    component: "Widget",
    matcher: createImportMatcher("*"),
    when: { prop: "to" },
    forbid: [{ name: "button" }],
    forbidProps: new Set<string>(),
    ...overrides,
  };
}

function active(children: SubtreeNode[]): SubtreeElement {
  return node("Widget", { props: [prop("to")], children });
}

describe("evaluateSubtree activation", () => {
  it("does nothing when the when prop is absent", () => {
    const root = node("Widget", { children: [node("button")] });

    expect(evaluateSubtree(forbidButton(), root)).toHaveLength(0);
  });

  it("does nothing when a presence prop is literally false", () => {
    const root = node("Widget", {
      props: [prop("to", { present: false })],
      children: [node("button")],
    });

    expect(evaluateSubtree(forbidButton(), root)).toHaveLength(0);
  });

  it("activates on the values form by resolved literal", () => {
    const prepared = forbidButton({
      when: { prop: "variant", values: ["primary"] },
    });

    const root = node("Widget", {
      props: [prop("variant", { value: "primary" })],
      children: [node("button")],
    });

    expect(evaluateSubtree(prepared, root).map((v) => v.messageId)).toEqual([
      "forbiddenDescendant",
    ]);
  });

  it("activates on the values form by member-expression source text", () => {
    const prepared = forbidButton({
      when: { prop: "size", values: ["Size.large"] },
    });

    const root = node("Widget", {
      props: [prop("size", { source: "Size.large" })],
      children: [node("button")],
    });

    expect(evaluateSubtree(prepared, root)).toHaveLength(1);
  });

  it("does not activate when the resolved value is not listed", () => {
    const prepared = forbidButton({
      when: { prop: "variant", values: ["primary"] },
    });

    const root = node("Widget", {
      props: [prop("variant", { value: "ghost" })],
      children: [node("button")],
    });

    expect(evaluateSubtree(prepared, root)).toHaveLength(0);
  });
});

describe("evaluateSubtree forbid matching", () => {
  it("does not check the activated element itself, only its descendants", () => {
    const prepared = forbidButton({ forbid: [{ name: "Widget" }] });

    expect(evaluateSubtree(prepared, active([]))).toHaveLength(0);
    expect(evaluateSubtree(prepared, active([node("Widget")]))).toHaveLength(1);
  });

  it("reports a forbidden element anywhere below", () => {
    const root = active([node("div", { children: [node("button")] })]);
    const [violation, ...rest] = evaluateSubtree(forbidButton(), root);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("forbiddenDescendant");
    expect(violation?.data["name"]).toBe("button");
  });

  it("honours a forbid entry's own import gate", () => {
    const prepared = forbidButton({
      forbid: [{ name: "Chip", matcher: createImportMatcher("*/chip") }],
    });

    const fromChip = node("Chip", { importSource: "~/chip" });
    const fromElsewhere = node("Chip", { importSource: "~/other" });

    expect(evaluateSubtree(prepared, active([fromChip]))).toHaveLength(1);
    expect(evaluateSubtree(prepared, active([fromElsewhere]))).toHaveLength(0);
  });

  it("reports the first forbidden match per path and stops descending", () => {
    const root = active([node("button", { children: [node("button")] })]);

    expect(evaluateSubtree(forbidButton(), root)).toHaveLength(1);
  });

  it("skips a namespaced (empty-name) element but walks through it", () => {
    const prepared = forbidButton({ forbid: [{ name: "button" }] });
    const root = active([node("", { children: [node("button")] })]);

    expect(evaluateSubtree(prepared, root)).toHaveLength(1);
  });

  it("reports a descendant carrying a forbidden prop", () => {
    const prepared = forbidButton({
      forbid: [],
      forbidProps: new Set(["onClick"]),
    });

    const root = active([node("div", { props: [prop("onClick")] })]);
    const [violation] = evaluateSubtree(prepared, root);

    expect(violation?.messageId).toBe("forbiddenPropDescendant");
    expect(violation?.data["prop"]).toBe("onClick");
  });

  it("ignores a forbidden prop that is not present", () => {
    const prepared = forbidButton({
      forbid: [],
      forbidProps: new Set(["onClick"]),
    });

    const root = active([
      node("div", { props: [prop("onClick", { present: false })] }),
    ]);

    expect(evaluateSubtree(prepared, root)).toHaveLength(0);
  });

  it("descends prop children before body children", () => {
    const inProp = node("button");
    const inBody = node("button");
    const root = active([]);

    root.propChildren = [inProp];
    root.children = [inBody];

    const violations = evaluateSubtree(forbidButton(), root);

    expect(violations.map((v) => v.ref)).toEqual([inProp.ref, inBody.ref]);
  });
});

describe("evaluateSubtree constant dedup", () => {
  it("reports one occurrence when the same init is reached twice", () => {
    const root = active([
      ref(0, () => [node("button")]),
      ref(0, () => [node("button")]),
    ]);

    expect(evaluateSubtree(forbidButton(), root)).toHaveLength(1);
  });

  it("walks every node one reference resolves to", () => {
    const prepared = forbidButton({
      forbid: [{ name: "button" }, { name: "span" }],
    });

    const root = active([ref(0, () => [node("button"), node("span")])]);

    expect(evaluateSubtree(prepared, root)).toHaveLength(2);
  });

  it("lets a later reference report when the first is blocked behind a forbidden element", () => {
    // The first reference (initId 0) sits under a forbidden <Panel>; the walk
    // stops at Panel and never reaches it, so it does not claim init 0. The
    // second reference then resolves and is reported.
    const prepared = forbidButton({
      forbid: [{ name: "Panel" }, { name: "button" }],
    });

    const root = active([
      node("Panel", { children: [ref(0, () => [node("button")])] }),
      ref(0, () => [node("button")]),
    ]);

    const violations = evaluateSubtree(prepared, root);

    expect(violations.map((v) => v.data["name"])).toEqual(["Panel", "button"]);
  });

  it("terminates a self-referential constant", () => {
    // A constant whose init references itself: resolving it reaches a ref to the
    // same init, already claimed, so the walk stops.
    const selfResolve = (): SubtreeNode[] => [
      node("A", { children: [ref(0, selfResolve)] }),
    ];

    const root = active([ref(0, selfResolve)]);

    expect(evaluateSubtree(forbidButton(), root)).toHaveLength(0);
  });
});

describe("prepareSubtree", () => {
  it("normalizes a bare when string to presence activation", () => {
    const prepared = prepareSubtree({
      importPath: "*/widget",
      component: "Widget",
      when: "to",
      forbid: ["button"],
    });

    expect(prepared.when).toEqual({ prop: "to" });
  });

  it("passes a values-form when through", () => {
    const prepared = prepareSubtree({
      importPath: "*/widget",
      component: "Widget",
      when: { prop: "variant", values: ["primary"] },
      forbid: ["button"],
    });

    expect(prepared.when).toEqual({ prop: "variant", values: ["primary"] });
  });

  it("gates the component by its import path", () => {
    const prepared = prepareSubtree({
      importPath: "*/widget",
      component: "Widget",
      when: "to",
      forbid: ["button"],
    });

    expect(prepared.matcher("~/widget")).toBe(true);
    expect(prepared.matcher("~/other")).toBe(false);
  });

  it("gives a forbid entry a matcher only when it declares a gate", () => {
    const prepared = prepareSubtree({
      importPath: "*/widget",
      component: "Widget",
      when: "to",
      forbid: ["button", { name: "Chip", importPath: "*/chip" }],
    });

    const [plain, gated] = prepared.forbid;

    expect(plain?.matcher).toBeUndefined();
    expect(gated?.matcher?.("~/chip")).toBe(true);
    expect(gated?.matcher?.("~/other")).toBe(false);
  });

  it("collects forbidProps into a set", () => {
    const prepared = prepareSubtree({
      importPath: "*/widget",
      component: "Widget",
      when: "to",
      forbidProps: ["onClick", "onKeyDown"],
    });

    expect(prepared.forbidProps).toEqual(new Set(["onClick", "onKeyDown"]));
  });
});
