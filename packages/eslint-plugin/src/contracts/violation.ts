/**
 * What every facet's evaluator returns: one finding, addressed to a node of the
 * rendered tree.
 */

import type { Ref } from "./rendered-tree/rendered-tree.js";

export interface Violation<MessageId extends string> {
  ref: Ref;
  messageId: MessageId;
  data: Record<string, string>;
}
