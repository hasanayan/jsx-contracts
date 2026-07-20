import { contractsFor, mergeContracts } from "@jsx-contracts/helpers";

import type * as widgets from "./widget.js";

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

// A compact widget narrows what may appear below it.
const widget = contract("Widget").when(
  prop("variant").is("compact"),
  contract()
    .forbidDescendants("Widget.Footer")
    .forbidDescendantProps("data-analytics"),
);

export const contracts = mergeContracts(tray, widget);
