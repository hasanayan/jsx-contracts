/** Joins display names as "a, b and c"; the conjunction defaults to "and". */
export function formatList(items: string[], conjunction = "and"): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

/** Spells one as a word; larger counts as digits. */
export function countWord(count: number): string {
  return count === 1 ? "one" : String(count);
}
