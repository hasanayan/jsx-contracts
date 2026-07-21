import type { WhenCondition } from "@jsx-contracts/eslint-plugin";

/** Module a component must be imported from for its contract to apply. */
export type Gate = string;

/** A prop value a when-condition activates on. */
export type Literal = string | number | boolean;

interface GatedElement {
  name: string;
  from?: Gate;
}

/** A forbidden element: a bare name, or a name gated by its own import. */
export type Forbid = string | GatedElement;

export interface RuntimeSlotSpec {
  count?: { min?: number; max?: number };
  from?: Gate;
}

export interface RuntimeProps {
  required?: readonly (string | readonly string[])[];
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  deprecated?: Record<string, string | true>;
}

/** One `when` call: the condition, and the nameless contract it gates. */
export interface RuntimeConditional {
  when: WhenCondition;
  rules: RuntimeEntry;
}

export interface RuntimeEntry {
  slots?: Record<string, RuntimeSlotSpec>;
  requires?: Record<string, string>;
  exclusive?: readonly (readonly [readonly string[], readonly string[]])[];
  strict?: boolean;
  descendants?: Record<string, RuntimeSlotSpec>;
  forbid?: readonly Forbid[];
  forbidProps?: readonly string[];
  props?: RuntimeProps;
  deprecated?: string | true;
  notInside?: readonly Forbid[];
  /** One entry per `when` call, in the order they were authored. */
  conditional?: readonly RuntimeConditional[];
}
