// The authoring language: the input surface of the component-keyed map form,
// and the traps that keep a misspelled key an error rather than silence. Pure
// types — nothing here survives to runtime.

/** Module a component must be imported from for its contract to apply. */
export type Gate = string;

export type Literal = string | number | boolean;

/** A forbidden element: a bare name, or a name gated by its own import. */
export type Forbid = string | { name: string; from?: Gate };

// Omitted bounds are left for the rule to default, never stamped here.
/** `true` = default bounds (at most one); otherwise count bounds and/or an own gate. */
export type SlotSpec =
  true | { count?: { min?: number; max?: number }; from?: Gate };

// One ban's fields; `SubtreeBan` below makes it forbid at least one thing.
interface SubtreeBanFields {
  /**
   * Activate only when the prop's value is one of these literals; omitted, the
   * ban activates on prop presence.
   */
  is?: readonly [Literal, ...Literal[]];
  /** Elements barred anywhere below the activated component. */
  forbid?: readonly [Forbid, ...Forbid[]];
  /** Props barred on every element below the activated component. */
  forbidProps?: readonly [string, ...string[]];
}

// The union makes each ban forbid at least one element or prop.
type SubtreeBan =
  | (SubtreeBanFields & { forbid: readonly [Forbid, ...Forbid[]] })
  | (SubtreeBanFields & { forbidProps: readonly [string, ...string[]] });

// Slot keys taken exactly as written (a leading dot stays), so the F-bound can
// constrain requires/exclusive to this entry's own slots.
type SlotKeys<Entry> = Entry extends { slots: infer Slots }
  ? Extract<keyof Slots, string>
  : never;

/** Element-local prop contracts for one component. */
interface PropsEntry {
  /**
   * Props that must be present. A bare string names one required prop; a
   * non-empty tuple is an at-least-one-of group.
   */
  required?: (string | readonly [string, ...string[]])[];
  /** Pairs of non-empty prop groups that may not co-occur. */
  exclusive?: readonly (readonly [
    readonly [string, ...string[]],
    readonly [string, ...string[]],
  ])[];
  /** Deprecated prop → a replacement hint, or `true` for a bare deprecation. */
  deprecated?: Record<string, string | true>;
}

interface ComponentEntry<Entry> {
  /** Import gate for this component; overrides the shared default. */
  from?: Gate;
  /**
   * Slots keyed by name; a key starting with `.` is shorthand for
   * `<Component><key>` (`".Title"` under `Widget.Tray` → `Widget.Tray.Title`).
   */
  slots?: Record<string, SlotSpec>;
  /** Slot-to-slot requirement: each key slot must co-render with its value slot. */
  requires?: Partial<Record<SlotKeys<Entry>, SlotKeys<Entry>>>;
  /** Pairs of slot groups that may not co-render. */
  exclusive?: readonly (readonly [
    readonly SlotKeys<Entry>[],
    readonly SlotKeys<Entry>[],
  ])[];
  /** Report unresolvable children as violations; presence checks always run. */
  strict?: boolean;
  /** Subtree bans keyed by the prop that activates them. */
  subtree?: Record<string, SubtreeBan>;
  /**
   * Descendants required anywhere below this component, with count bounds — a
   * gap the direct-child slots facet can't close (wrappers may sit between a
   * root and its parts). Keyed by name; a key starting with `.` is shorthand
   * for `<Component><key>` (`".List"` under `Tabs.Root` → `Tabs.Root.List`).
   * `true` = default bounds (at most one); otherwise count bounds and/or an own
   * gate. Always active for the matched component — no `when`.
   */
  descendants?: Record<string, SlotSpec>;
  /** Element-local prop contracts: required, exclusive, and deprecated props. */
  props?: PropsEntry;
  /** The component itself is deprecated; a string is a replacement hint. */
  deprecated?: string | true;
  /**
   * Ancestors this component may not render below (anywhere in the file's JSX
   * tree, not just as a direct child). A bare string matches by name only; an
   * object additionally gates the ancestor by its `from` import. Use it for
   * HTML-validity and interaction contracts — no `<Button>` inside a `<Button>`,
   * no `<Link>` inside a `<Link>`. Only the forbidden direction is enforced;
   * requiring an ancestor is deliberately not offered (it is unsound per-file).
   */
  notInside?: readonly [Forbid, ...Forbid[]];
}

// The loosest single-entry view (slot keys unresolved). This is the inference
// constraint: the F-bounded `ContractsInput<T>` alone leaves the language
// service without a contextual type mid-literal (T is still being inferred
// from the very literal being typed), killing completions and hover docs.
export type AnyComponentEntry = ComponentEntry<{
  slots: Record<string, SlotSpec>;
}>;

// The traps are branded objects, not `never` or error-string types: those
// would intersect with the literal's own property type to `never`, and TS then
// collapses the whole entry intersection to `never`, moving the error onto
// sibling lines. A brand intersects cleanly, so the error stays on the
// offending property.
interface UndeclaredSlot<Key> {
  "Error: this key is not a declared slot of the component": Key;
}

interface UnknownOption<Key> {
  "Error: this is not a contract entry option": Key;
}

interface UnknownPropsOption<Key> {
  "Error: this is not a props contract option": Key;
}

// Because `T` (the literal's own type) is intersected into the parameter,
// excess-property checking can no longer reject a `requires` key or an entry
// option that only exists on `T`. This validator traps both instead: the
// offending property's type gains a brand nothing satisfies.
type ValidEntry<Entry> = (Entry extends {
  requires: infer Requires extends object;
}
  ? {
      requires: {
        [Key in keyof Requires]: Key extends SlotKeys<Entry>
          ? SlotKeys<Entry>
          : UndeclaredSlot<Key>;
      };
    }
  : unknown) &
  // Excess-property checking is defeated inside a nested object too (the
  // literal's own type is intersected in), so the `props` sub-object needs the
  // same brand trap the top-level options get.
  (Entry extends { props: infer Props extends object }
    ? {
        props: {
          [Key in keyof Props]: Key extends keyof PropsEntry
            ? PropsEntry[Key]
            : UnknownPropsOption<Key>;
        };
      }
    : unknown) & {
    [Key in keyof Entry]: Key extends keyof ComponentEntry<Entry>
      ? ComponentEntry<Entry>[Key]
      : UnknownOption<Key>;
  };

interface UnknownComponent<Key> {
  "Error: this is not a capitalized export path of the contracts module": Key;
}

export type ContractsInput<T, Names extends string = string> = {
  [Component in keyof T]: Component extends Names
    ? ComponentEntry<T[Component]> & ValidEntry<T[Component]>
    : UnknownComponent<Component>;
};
