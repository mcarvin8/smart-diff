/** Map numstat path field (including `{old => new}` rename form) to the post-change path used as lookup key. */
function numStatPathToLookupKey(pathField: string): string {
  const brace = /^(.*)\{(.+) => (.+)\}$/.exec(pathField);
  if (!brace) {
    return pathField;
  }
  const dirRaw = brace[1];
  const toSeg = brace[3].trim();
  return `${dirRaw}${toSeg}`;
}

function parseNumStatLine(
  line: string,
): { key: string; additions: number; deletions: number } | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;

  const addStr = parts[0] ?? "";
  const delStr = parts[1] ?? "";
  const pathField = parts.slice(2).join("\t");

  const additions = addStr !== "-" ? Number.parseInt(addStr, 10) || 0 : 0;
  const deletions = delStr !== "-" ? Number.parseInt(delStr, 10) || 0 : 0;

  const key = numStatPathToLookupKey(pathField);
  return { key, additions, deletions };
}

export function accumulateNumStat(
  numStatOutput: string,
  into: Map<string, { additions: number; deletions: number }>,
): void {
  for (const rawLine of numStatOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsed = parseNumStatLine(line);
    if (!parsed) continue;
    const prev = into.get(parsed.key) ?? { additions: 0, deletions: 0 };
    into.set(parsed.key, {
      additions: prev.additions + parsed.additions,
      deletions: prev.deletions + parsed.deletions,
    });
  }
}
