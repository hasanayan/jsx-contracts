import { describe, expect, it } from "vitest";

import type { CombinedSubtree } from "./evaluate-subtree.js";
import { evaluateSubtree, prepareSubtreeRow } from "./evaluate-subtree.js";
import type {
  Branch,
  PropFact,
  SubtreeElement,
  SubtreeNode,
  SubtreeRef,
} from "./facts.js";
import { createImportMatcher } from "./import-matcher.js";

// A fresh `ref` per node so violations can be matched back by identity.
function node(
  name: string,
  overrides: Partial<SubtreeElement> = {},
): SubtreeElement {
  return {
    kind: "element",
    name,
    ref: {},
    branches: [],
    importSource: null,
    props: [],
    propChildren: [],
    children: [],
    ...overrides,
  };
}

// A lazy reference node keyed by `initId`, resolving to `produced` each call.
function ref(
  initId: number,
  resolve: () => SubtreeNode[],
  branches: Branch[] = [],
): SubtreeRef {
  return { kind: "ref", initId, branches, resolve };
}

// An unresolvable content marker (a call, a param, a spread child).
const unknown: SubtreeNode = { kind: "unknown" };

function prop(name: string, extra: Partial<PropFact> = {}): PropFact {
  return { name, present: true, ...extra };
}

// A merged contract forbidding <button> anywhere below <Widget>.
function forbidButton(
  overrides: Partial<CombinedSubtree> = {},
): CombinedSubtree {
  return {
    component: "Widget",
    forbid: [{ name: "button" }],
    forbidProps: new Set<string>(),
    require: [],
    ...overrides,
  };
}

// A when-less row requiring exactly one <Tabs.List> anywhere below <Tabs.Root>.
function requireList(
  overrides: Partial<CombinedSubtree> = {},
): CombinedSubtree {
  return {
    component: "Tabs.Root",
    forbid: [],
    forbidProps: new Set<string>(),
    require: [{ name: "Tabs.List", minCount: 1, maxCount: 1 }],
    ...overrides,
  };
}

function tabsRoot(children: SubtreeNode[]): SubtreeElement {
  return node("Tabs.Root", { children });
}

function active(children: SubtreeNode[]): SubtreeElement {
  return node("Widget", { props: [prop("to")], children });
}

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

  it("reports a self-referential constant's forbidden element exactly once", () => {
    // The init renders a <button> and, alongside it, references itself. The
    // in-flight guard stops the recursion at the second reach of init 0, and
    // the forbidden <button> is reported once for the one ref chain.
    const selfResolve = (): SubtreeNode[] => [
      node("button"),
      node("A", { children: [ref(0, selfResolve)] }),
    ];

    const root = active([ref(0, selfResolve)]);

    expect(
      evaluateSubtree(forbidButton(), root).map((v) => v.data["name"]),
    ).toEqual(["button"]);
  });
});

// The branch-aware decision itself is `checkCountBounds`, covered once in
// model.test.ts. What is the facet's own is the lazy walk that gathers the
// occurrences, the per-entry gate, and the refs and wording of the reports.
describe("evaluateSubtree descendant counts", () => {
  it("runs a when-less row unconditionally, satisfied by one match", () => {
    const root = tabsRoot([node("Tabs.List")]);

    expect(evaluateSubtree(requireList(), root)).toHaveLength(0);
  });

  it("reports tooFew on the root when the required descendant is absent", () => {
    const root = tabsRoot([node("div", { children: [node("span")] })]);
    const [violation, ...rest] = evaluateSubtree(requireList(), root);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("tooFewDescendants");
    expect(violation?.ref).toBe(root.ref);
    expect(violation?.data).toEqual({
      component: "Tabs.Root",
      name: "Tabs.List",
      min: "one",
    });
  });

  it("counts a descendant nested through a wrapper element", () => {
    const root = tabsRoot([node("div", { children: [node("Tabs.List")] })]);

    expect(evaluateSubtree(requireList(), root)).toHaveLength(0);
  });

  it("reports tooMany when coexisting occurrences exceed the max", () => {
    const prepared = requireList({
      require: [{ name: "Tabs.List", minCount: 0, maxCount: 1 }],
    });

    const second = node("Tabs.List");
    const root = tabsRoot([node("Tabs.List"), second]);
    const [violation, ...rest] = evaluateSubtree(prepared, root);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("tooManyDescendants");
    expect(violation?.ref).toBe(second.ref);
    expect(violation?.data).toEqual({
      component: "Tabs.Root",
      name: "Tabs.List",
      max: "one",
    });
  });

  it("skips the min check when the subtree holds unresolvable content", () => {
    const root = tabsRoot([unknown]);

    expect(evaluateSubtree(requireList(), root)).toHaveLength(0);
  });

  it("still runs the max check past unresolvable content", () => {
    const prepared = requireList({
      require: [{ name: "Tabs.List", minCount: 0, maxCount: 1 }],
    });

    const root = tabsRoot([node("Tabs.List"), node("Tabs.List"), unknown]);
    const [violation, ...rest] = evaluateSubtree(prepared, root);

    expect(rest).toHaveLength(0);
    expect(violation?.messageId).toBe("tooManyDescendants");
  });

  it("counts only occurrences passing a per-entry import gate", () => {
    const prepared = requireList({
      require: [
        {
          name: "Tabs.List",
          minCount: 1,
          maxCount: 1,
          matcher: createImportMatcher("*/tabs"),
        },
      ],
    });

    const fromTabs = tabsRoot([node("Tabs.List", { importSource: "~/tabs" })]);
    const fromElse = tabsRoot([node("Tabs.List", { importSource: "~/other" })]);

    expect(evaluateSubtree(prepared, fromTabs)).toHaveLength(0);
    expect(evaluateSubtree(prepared, fromElse).map((v) => v.messageId)).toEqual(
      ["tooFewDescendants"],
    );
  });

  it("counts a shared JSX const referenced by two siblings toward the max", () => {
    // The same init is referenced from two sibling wrappers. Each reference site
    // must count, so the two occurrences exceed `max: 1` even though the init is
    // deduped for forbid purposes.
    const prepared = requireList({
      require: [{ name: "Tabs.List", minCount: 0, maxCount: 1 }],
    });

    const root = tabsRoot([
      node("div", { children: [ref(0, () => [node("Tabs.List")])] }),
      node("span", { children: [ref(0, () => [node("Tabs.List")])] }),
    ]);

    expect(evaluateSubtree(prepared, root).map((v) => v.messageId)).toEqual([
      "tooManyDescendants",
    ]);
  });

  it("counts a shared JSX const at every reference site toward the min", () => {
    // Two references to the same init satisfy `min: 2`; counting the init once
    // would spuriously report too few.
    const prepared = requireList({
      require: [{ name: "Tabs.List", minCount: 2, maxCount: Infinity }],
    });

    const root = tabsRoot([
      node("div", { children: [ref(0, () => [node("Tabs.List")])] }),
      node("span", { children: [ref(0, () => [node("Tabs.List")])] }),
    ]);

    expect(evaluateSubtree(prepared, root)).toHaveLength(0);
  });

  it("guarantees the min when a shared JSX const fills both ternary branches", () => {
    // `{cond ? shared : shared}` renders the shared const on either path, so the
    // guaranteed count is one and `min: 1` is satisfied.
    const prepared = requireList({
      require: [{ name: "Tabs.List", minCount: 1, maxCount: Infinity }],
    });

    const root = tabsRoot([
      ref(0, () => [node("Tabs.List")], ["1:consequent"]),
      ref(0, () => [node("Tabs.List")], ["1:alternate"]),
    ]);

    expect(evaluateSubtree(prepared, root)).toHaveLength(0);
  });
});

describe("prepareSubtreeRow", () => {
  // Activation — the row's import gate and its when-condition — belongs to the
  // engine now, and is covered at the rule-test seam. What preparation still
  // owns is the per-entry gate and the count-bound defaults.
  it("gives a forbid entry a matcher only when it declares a gate", () => {
    const prepared = prepareSubtreeRow({
      facet: "subtree",
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
    const prepared = prepareSubtreeRow({
      facet: "subtree",
      importPath: "*/widget",
      component: "Widget",
      when: "to",
      forbidProps: ["onClick", "onKeyDown"],
    });

    expect(prepared.forbidProps).toEqual(["onClick", "onKeyDown"]);
  });

  // The default rule itself is `resolveBounds`, covered once in model.test.ts.
  it("carries the resolved bounds onto the prepared entry", () => {
    const prepared = prepareSubtreeRow({
      facet: "subtree",
      importPath: "*/tabs",
      component: "Tabs.Root",
      require: [{ name: "Tabs.List" }, { name: "Tabs.Panel", min: 2 }],
    });

    expect(prepared.require[0]).toMatchObject({ minCount: 0, maxCount: 1 });
    expect(prepared.require[1]).toMatchObject({
      minCount: 2,
      maxCount: Infinity,
    });
  });

  it("gives a require entry a matcher only when it declares a gate", () => {
    const prepared = prepareSubtreeRow({
      facet: "subtree",
      importPath: "*/tabs",
      component: "Tabs.Root",
      require: [
        { name: "Tabs.List" },
        { name: "Tabs.Panel", importPath: "*/tabs" },
      ],
    });

    const [plain, gated] = prepared.require;

    expect(plain?.matcher).toBeUndefined();
    expect(gated?.matcher?.("~/tabs")).toBe(true);
    expect(gated?.matcher?.("~/other")).toBe(false);
  });
});
