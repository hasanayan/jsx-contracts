// Payload types and their runtime validators, authoritative for hand-written
// payloads. See CONTEXT.md for the terms.

// -- slots (children facet) payload --------------------------------------------

/** A slot a container accepts, with optional count bounds and import gate. */
export interface SlotConfig {
  /** The slot's full dotted tag, e.g. `"Widget.Tray.Action"`. */
  name: string;
  /** Fewest occurrences required. Default `0`. */
  minCount?: number;
  /** Most occurrences allowed. Default `1`, or unbounded when `minCount` is set. */
  maxCount?: number;
  /** Import gate for this slot; defaults to the container's. */
  importPath?: string;
}

/** A container component and the slots it accepts as direct children. */
export interface ContainerConfig {
  /** Import gate the container must come from: a literal or a `*`-glob. */
  importPath: string;
  /** The container's full dotted tag, e.g. `"Widget.Tray"`. */
  container: string;
  /** Accepted slots; a bare string is shorthand for `{ name }`. */
  slots: (string | SlotConfig)[];
  /** Slot → a slot that must co-render with it. */
  requires?: Record<string, string>;
  /** Pairs of slot groups that may not co-render. */
  exclusive?: [string[], string[]][];
  /** Treat statically unresolvable children as errors. */
  strict?: boolean;
}

/** Hand-writable payload for `@jsx-contracts/slots`. */
export type SlotsOptions = ContainerConfig[];

export function normalizeSlot(slot: string | SlotConfig): SlotConfig {
  return typeof slot === "string" ? { name: slot } : slot;
}

export function validateSlotsOptions(options: SlotsOptions): void {
  const containerTags = new Set<string>();

  for (const config of options) {
    if (containerTags.has(config.container)) {
      throw new Error(`slots: duplicate container "${config.container}".`);
    }

    containerTags.add(config.container);

    const slots = new Set<string>();

    for (const rawSlot of config.slots) {
      const slot = normalizeSlot(rawSlot);

      if (slots.has(slot.name)) {
        throw new Error(
          `slots: <${config.container}> lists duplicate slot "${slot.name}".`,
        );
      }

      slots.add(slot.name);

      if (
        slot.minCount !== undefined &&
        (!Number.isInteger(slot.minCount) || slot.minCount < 0)
      ) {
        throw new Error(
          `slots: <${config.container}> slot "${slot.name}" minCount must be a non-negative integer.`,
        );
      }

      if (
        slot.maxCount !== undefined &&
        (!Number.isInteger(slot.maxCount) || slot.maxCount < 1)
      ) {
        throw new Error(
          `slots: <${config.container}> slot "${slot.name}" maxCount must be a positive integer.`,
        );
      }

      if (
        slot.minCount !== undefined &&
        slot.maxCount !== undefined &&
        slot.minCount > slot.maxCount
      ) {
        throw new Error(
          `slots: <${config.container}> slot "${slot.name}" minCount exceeds maxCount.`,
        );
      }
    }

    const references = [
      ...Object.entries(config.requires ?? {}).flat(),
      ...(config.exclusive ?? []).flat(2),
    ];

    for (const reference of references) {
      if (!slots.has(reference)) {
        throw new Error(
          `slots: "${reference}" is not one of <${config.container}>'s slots.`,
        );
      }
    }
  }
}

// -- subtree payload -----------------------------------------------------------

/** Activates a ban: a prop name, or a prop with allowed values. */
export type WhenCondition =
  | string
  | {
      prop: string;
      values?: (string | number | boolean)[];
    };

/** An element a subtree may not contain, optionally gated by import. */
export interface ForbiddenElement {
  name: string;
  importPath?: string;
}

/** A component whose subtree is constrained while `when` holds. */
export interface NoDescendantsConfig {
  /** Import gate the component must come from: a literal or a `*`-glob. */
  importPath: string;
  /** The component's full dotted tag, e.g. `"Widget"`. */
  component: string;
  /** The prop (and optional values) that activate the ban. */
  when: WhenCondition;
  /** Elements forbidden anywhere below; a bare string is shorthand for `{ name }`. */
  forbid?: (string | ForbiddenElement)[];
  /** Props no descendant may carry. */
  forbidProps?: string[];
}

/** Hand-writable payload for `@jsx-contracts/subtree`. */
export type SubtreeOptions = NoDescendantsConfig[];

export interface NormalizedWhen {
  prop: string;
  values?: (string | number | boolean)[];
}

export function normalizeWhen(when: WhenCondition): NormalizedWhen {
  return typeof when === "string" ? { prop: when } : when;
}

export function normalizeForbid(
  entry: string | ForbiddenElement,
): ForbiddenElement {
  return typeof entry === "string" ? { name: entry } : entry;
}

export function validateSubtreeOptions(options: SubtreeOptions): void {
  // At most one condition per component per when-prop; two would be ambiguous.
  const pairs = new Set<string>();

  for (const config of options) {
    const when = normalizeWhen(config.when);
    const pair = `${config.component}\n${when.prop}`;

    if (pairs.has(pair)) {
      throw new Error(
        `subtree: duplicate condition on <${config.component}>'s "${when.prop}" prop.`,
      );
    }

    pairs.add(pair);

    if (when.values?.length === 0) {
      throw new Error(
        `subtree: <${config.component}> "${when.prop}" values must not be empty.`,
      );
    }

    if (config.forbid?.length === 0) {
      throw new Error(
        `subtree: <${config.component}> forbid must not be empty.`,
      );
    }

    if (config.forbidProps?.length === 0) {
      throw new Error(
        `subtree: <${config.component}> forbidProps must not be empty.`,
      );
    }

    if (
      (config.forbid?.length ?? 0) === 0 &&
      (config.forbidProps?.length ?? 0) === 0
    ) {
      throw new Error(
        `subtree: <${config.component}> must forbid at least one element or prop.`,
      );
    }
  }
}
