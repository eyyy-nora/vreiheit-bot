import * as Diff from "diff";
export function buildDiff(a: string, b: string) {
  if (a.toLowerCase() === b.toLowerCase()) return a;
  const patches = Diff.diffWords(a, b, { ignoreCase: true });
  const parts: { added?: string; removed?: string; value?: string }[] = [];
  let lastRemoved = false;
  let lastAdded = false;
  for (const part of patches) {
    if (part.added) {
      if (lastRemoved) parts[parts.length - 1].added = part.value;
      else parts.push({ added: part.value });
    } else if (part.removed) {
      if (lastAdded) parts[parts.length - 1].removed = part.value;
      else parts.push({ removed: part.value });
    } else parts.push({ value: part.value });
    lastRemoved = part.removed;
    lastAdded = part.added;
  }
  return parts
    .map(({ added, removed, value }) => {
      if (added && removed) return `[~~${added}~~ -> **${removed}**]`;
      if (added) return `[**${added}**]`;
      if (removed) return `[**${removed}**]`;
      return value;
    })
    .join("");
}
