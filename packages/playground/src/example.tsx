// Smoke check: this tree satisfies every contract in contracts.ts and must stay
// lint-clean under --max-warnings=0.

import { Widget } from "./widget.js";

export function Example(): JSX.Element {
  return (
    <section>
      {/* Compact widget: the subtree ban is active (no Footer, no
          data-analytics), and the Tray holds a Title plus one Action. */}
      <Widget variant="compact">
        <Widget.Tray>
          <Widget.Tray.Title>Inbox</Widget.Tray.Title>
          <Widget.Tray.Action>Refresh</Widget.Tray.Action>
        </Widget.Tray>
      </Widget>

      {/* Full widget: variant is not "compact", so the Footer is allowed. The
          Tray holds a single Title (satisfying the min-1 count) and no Action,
          so neither the requires nor the exclusive constraint is engaged. */}
      <Widget variant="full">
        <Widget.Tray>
          <Widget.Tray.Title>Archive</Widget.Tray.Title>
          <Widget.Tray.Overflow>More</Widget.Tray.Overflow>
        </Widget.Tray>
        <Widget.Footer>12 items archived</Widget.Footer>
      </Widget>
    </section>
  );
}
