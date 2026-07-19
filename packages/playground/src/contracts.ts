// Contracts for the playground's fake Widget design system, consumed from the
// root eslint.config.ts. The `*`-glob gate matches the linted files' relative
// widget import regardless of the absolute prefix; the module type binds the
// component names, so a typo'd or renamed component fails to compile. The
// widget import is type-only — the module is never loaded at runtime.

import { contractsFor, mergeContracts } from "@jsx-contracts/helpers";

import type * as widgets from "./widget.js";

// The gate is stated once, on the binding; destructuring `contract` off it is
// how a builder is reached, so no component repeats the gate.
const { contract } = contractsFor<typeof widgets>("*/playground/src/widget.js");

const tray = contract("Widget.Tray")
  .hasSlots({
    ".Title": { count: { min: 1, max: 1 } },
    ".Action": { count: { min: 0, max: 2 } },
    ".Overflow": true,
  })
  // An <Action> only makes sense alongside a <Title>.
  .requires(".Action", ".Title")
  // An <Overflow> collapses the actions, so it cannot co-render with them.
  .exclusive([".Overflow"], [".Action"]);

const widget = contract("Widget")
  .when("variant", ["compact"])
  .forbid("Widget.Footer")
  .forbidProps("data-analytics");

export const contracts = mergeContracts(tray, widget);
