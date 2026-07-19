// Contracts for the playground's fake Widget design system, consumed from the
// root eslint.config.ts. The `*`-glob gate matches the linted files' relative
// widget import regardless of the absolute prefix; the module type binds the
// component names, so a typo'd or renamed component fails to compile. The
// widget import is type-only — the module is never loaded at runtime.

import { contractsFor, mergeContracts } from "@jsx-contracts/helpers";

import type * as widgets from "./widget.js";

// The gate is stated once, on the binding; destructuring `contract` off it is
// how a builder is reached, so no component repeats the gate.
const { contract, prop } = contractsFor<typeof widgets>(
  "*/playground/src/widget.js",
);

const tray = contract("Widget.Tray")
  .hasSlot(".Title")
  .atLeast(1)
  .atMost(1)
  .hasSlot(".Action")
  .atLeast(0)
  .atMost(2)
  .hasSlot(".Overflow")
  // An <Action> only makes sense alongside a <Title>.
  .slotRequires(".Action", ".Title")
  // An <Overflow> collapses the actions, so it cannot co-render with them.
  .exclusiveSlots([".Overflow"], [".Action"]);

// A conditional rule: a compact widget narrows what may appear below it. The
// nameless contract is a value, so this pair could be hoisted and shared.
const widget = contract("Widget").when(
  prop("variant").is("compact"),
  contract()
    .forbidDescendants("Widget.Footer")
    .forbidDescendantProps("data-analytics"),
);

export const contracts = mergeContracts(tray, widget);
