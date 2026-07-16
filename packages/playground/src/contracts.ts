// Contracts for the playground's fake Widget design system, consumed from the
// root eslint.config.ts. The `*`-glob gate matches the linted files' relative
// widget import regardless of the absolute prefix.

import { defineContract, mergeContracts } from "@jsx-contracts/eslint-plugin";

const gate = "*/playground/src/widget.js";

const tray = defineContract(
  "Widget.Tray",
  {
    ".Title": { count: { min: 1, max: 1 } },
    ".Action": { count: { min: 0, max: 2 } },
    ".Overflow": true,
  },
  {
    from: gate,
    // An <Action> only makes sense alongside a <Title>.
    requires: { ".Action": ".Title" },
    // An <Overflow> collapses the actions, so it cannot co-render with them.
    exclusive: [[[".Overflow"], [".Action"]]],
  },
);

const widget = defineContract(
  "Widget",
  {},
  {
    from: gate,
    subtree: {
      variant: {
        is: ["compact"],
        forbid: ["Widget.Footer"],
        forbidProps: ["data-analytics"],
      },
    },
  },
);

// The two single-component contracts, combined for eslint.config's rules().
export const contracts = mergeContracts(tray, widget);
