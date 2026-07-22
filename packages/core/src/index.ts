/**
 * `@jsx-contracts/core` — the contract format, owned by neither consumer. The
 * plugin enforces this shape; authoring compiles to it. The row schema, its JSON
 * schema, the runtime validator and the condition prose live here so all three
 * spellings of the format have a single home and no import cycle can form.
 */

export type {
  AncestorRow,
  ConditionValue,
  ContractRow,
  ContractRows,
  Count,
  Descendant,
  Facet,
  Forbidden,
  MatchKey,
  NameMatch,
  PropDeprecation,
  PropSpec,
  PropsBranch,
  PropsRow,
  Slot,
  SlotBranch,
  SlotsRow,
  SubtreeBranch,
  SubtreeRow,
  When,
  WhenProp,
} from "./rows.js";
export { displayName, matchKeyId } from "./rows.js";

export type { JsonSchema } from "./rows-schema.js";
export { contractRowsSchema } from "./rows-schema.js";

export { validateContractRows } from "./validate-rows.js";

export { renderCondition } from "./condition-prose.js";

export { countWord, formatList } from "./message-text.js";
