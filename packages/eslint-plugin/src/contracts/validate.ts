// The runtime validators for the rule payloads, authoritative for hand-written
// payloads. The payload types themselves live in @jsx-contracts/helpers (the
// authoring package that also compiles to them); they are imported type-only,
// so the plugin gains no runtime dependency on it. See CONTEXT.md for the terms.

import type {
  AncestorConfig,
  ContainerConfig,
  ForbiddenElement,
  NoDescendantsConfig,
  PropsConfig,
  SlotConfig,
  WhenCondition,
} from "@jsx-contracts/helpers";

// -- slots (children facet) payload --------------------------------------------

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

/** Hand-writable payload for `@jsx-contracts/subtree`. */
export type SubtreeOptions = NoDescendantsConfig[];

export interface NormalizedWhen {
  prop: string;
  values?: (string | number | boolean)[];
}

// An absent `when` normalizes to `undefined`: the row is always active for the
// matched component.
export function normalizeWhen(
  when: WhenCondition | undefined,
): NormalizedWhen | undefined {
  if (when === undefined) {
    return undefined;
  }

  return typeof when === "string" ? { prop: when } : when;
}

export function normalizeForbid(
  entry: string | ForbiddenElement,
): ForbiddenElement {
  return typeof entry === "string" ? { name: entry } : entry;
}

export function validateSubtreeOptions(options: SubtreeOptions): void {
  // At most one condition per component per when-prop; two would be ambiguous.
  // A when-less row has no prop to key on, so it is exempt (a full-stop ban or a
  // descendant-count row may sit beside any conditional rows).
  const pairs = new Set<string>();

  for (const config of options) {
    const when = normalizeWhen(config.when);

    if (when !== undefined) {
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

    if (config.require?.length === 0) {
      throw new Error(
        `subtree: <${config.component}> require must not be empty.`,
      );
    }

    if (
      (config.forbid?.length ?? 0) === 0 &&
      (config.forbidProps?.length ?? 0) === 0 &&
      (config.require?.length ?? 0) === 0
    ) {
      throw new Error(
        `subtree: <${config.component}> must forbid an element or prop, or require a descendant.`,
      );
    }

    for (const entry of config.require ?? []) {
      if (entry.name.length === 0) {
        throw new Error(
          `subtree: <${config.component}> require entry must name an element.`,
        );
      }

      if (
        entry.min !== undefined &&
        (!Number.isInteger(entry.min) || entry.min < 0)
      ) {
        throw new Error(
          `subtree: <${config.component}> require "${entry.name}" min must be a non-negative integer.`,
        );
      }

      if (
        entry.max !== undefined &&
        (!Number.isInteger(entry.max) || entry.max < 1)
      ) {
        throw new Error(
          `subtree: <${config.component}> require "${entry.name}" max must be a positive integer.`,
        );
      }

      if (
        entry.min !== undefined &&
        entry.max !== undefined &&
        entry.min > entry.max
      ) {
        throw new Error(
          `subtree: <${config.component}> require "${entry.name}" min exceeds max.`,
        );
      }
    }
  }
}

// -- props payload -------------------------------------------------------------

/** Hand-writable payload for `@jsx-contracts/props`. */
export type PropsOptions = PropsConfig[];

export function validatePropsOptions(options: PropsOptions): void {
  const componentTags = new Set<string>();

  for (const config of options) {
    if (componentTags.has(config.component)) {
      throw new Error(`props: duplicate component "${config.component}".`);
    }

    componentTags.add(config.component);

    const hasRequired = (config.required?.length ?? 0) > 0;
    const hasExclusive = (config.exclusive?.length ?? 0) > 0;
    const hasDeprecated =
      config.deprecated !== undefined &&
      Object.keys(config.deprecated).length > 0;

    const hasDeprecatedComponent = config.deprecatedComponent !== undefined;

    if (
      !hasRequired &&
      !hasExclusive &&
      !hasDeprecated &&
      !hasDeprecatedComponent
    ) {
      throw new Error(
        `props: <${config.component}> must declare at least one prop contract.`,
      );
    }

    for (const entry of config.required ?? []) {
      if (Array.isArray(entry) && entry.length === 0) {
        throw new Error(
          `props: <${config.component}> has an empty required group.`,
        );
      }
    }

    for (const [groupA, groupB] of config.exclusive ?? []) {
      if (groupA.length === 0 || groupB.length === 0) {
        throw new Error(
          `props: <${config.component}> has an empty exclusive group.`,
        );
      }
    }
  }
}

// -- ancestor payload ----------------------------------------------------------

/** Hand-writable payload for `@jsx-contracts/ancestor`. */
export type AncestorOptions = AncestorConfig[];

export function validateAncestorOptions(options: AncestorOptions): void {
  const componentTags = new Set<string>();

  for (const config of options) {
    if (componentTags.has(config.component)) {
      throw new Error(`ancestor: duplicate component "${config.component}".`);
    }

    componentTags.add(config.component);

    if (config.notInside.length === 0) {
      throw new Error(
        `ancestor: <${config.component}> notInside must not be empty.`,
      );
    }

    for (const rawEntry of config.notInside) {
      const entry = normalizeForbid(rawEntry);

      if (entry.name.length === 0) {
        throw new Error(
          `ancestor: <${config.component}> notInside entry must name an element.`,
        );
      }
    }
  }
}
