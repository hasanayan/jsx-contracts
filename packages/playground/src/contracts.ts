import { defineContracts, prop } from "@jsx-contracts/authoring";

// The module the fixture's components are imported from. Carried on every row
// and matched against each element's own import: a `Widget` from anywhere else
// is a different component and none of this applies to it.
const GATE = "*/playground/src/widget.js";

export const contracts = defineContracts(({ contract }) => {
  contract("Widget.Tray", GATE).slots({
    ".Title": (s) => s.exactly(1),
    // An <Action> only makes sense alongside a <Title>, and there are at most two.
    ".Action": (s) => s.max(2).requires(".Title"),
    // An <Overflow> collapses the actions, so it cannot co-render with them.
    ".Overflow": (s) => s.excludes(".Action"),
  });

  // A compact widget narrows what may appear below it.
  contract("Widget", GATE).when(
    prop("variant").is("compact"),
    (c) =>
      c
        .forbidDescendants("Widget.Footer")
        .forbidDescendantProps("data-analytics"),
    { because: "A compact widget narrows what may appear below it." },
  );
});
