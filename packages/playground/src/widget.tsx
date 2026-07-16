// A fake design system to exercise the rules through a real ESLint run.
// Object.assign builds the compound component so dotted JSX members
// (Widget.Tray.Title) type-check under the playground's jsx shim.

interface WidgetProps {
  variant?: string;
  children?: unknown;
}

interface SlotProps {
  children?: unknown;
}

function WidgetRoot(props: WidgetProps): JSX.Element {
  return (
    <div className="widget" data-variant={props.variant}>
      {props.children}
    </div>
  );
}

function Tray(props: SlotProps): JSX.Element {
  return <div className="widget-tray">{props.children}</div>;
}

function Title(props: SlotProps): JSX.Element {
  return <h2 className="widget-tray-title">{props.children}</h2>;
}

function Action(props: SlotProps): JSX.Element {
  return <button className="widget-tray-action">{props.children}</button>;
}

function Overflow(props: SlotProps): JSX.Element {
  return <button className="widget-tray-overflow">{props.children}</button>;
}

function Footer(props: SlotProps): JSX.Element {
  return <footer className="widget-footer">{props.children}</footer>;
}

const TrayWithSlots = Object.assign(Tray, { Title, Action, Overflow });

export const Widget = Object.assign(WidgetRoot, {
  Tray: TrayWithSlots,
  Footer,
});
