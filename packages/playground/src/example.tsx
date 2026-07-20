// Smoke check: this tree satisfies every contract in contracts.ts and must stay
// lint-clean under --max-warnings=0.

import { Widget } from "./widget.js";

export function Example(): JSX.Element {
  return (
    <section>
      {/* Compact: the subtree ban is active — no Footer, no data-analytics. */}
      <Widget variant="compact">
        <Widget.Tray>
          <Widget.Tray.Title>Inbox</Widget.Tray.Title>
          <Widget.Tray.Action>Refresh</Widget.Tray.Action>
        </Widget.Tray>
      </Widget>

      {/* Not compact: the Footer is allowed. */}
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
