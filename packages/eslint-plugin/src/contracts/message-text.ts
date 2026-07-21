/** Joins display names as "a, b and c". */
export function formatList(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Spells one as a word; larger counts as digits. */
export function countWord(count: number): string {
  return count === 1 ? "one" : String(count);
}
