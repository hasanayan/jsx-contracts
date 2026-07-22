// The collectors, as one import block. Grouped by what they collect: tag
// naming, scope resolution and import provenance, props, transparent descent,
// and one module per facet's view of the tree.

export { collectAncestors } from "./ancestors.js";
export { classifyOpaqueRegion } from "./opaque.js";
export { collectProps, hasSpreadAttribute } from "./props.js";
export { resolveImportSource } from "./resolution.js";
export { collectContainerChildren, collectPlacement } from "./slots.js";
export { collectSubtreeRoot } from "./subtree.js";
export { tagName } from "./tag-name.js";
