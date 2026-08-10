import { diffLines } from "diff";

export type LineOp = {
  kind: "context" | "add" | "del";
  text: string;
  /** True when this line is the last line of its file and that file has no trailing newline. */
  noEol: boolean;
};

function linesFromValue(
  value: string,
): Array<{ text: string; noEol: boolean }> {
  const endsWithNewline = value.endsWith("\n");
  const body = endsWithNewline ? value.slice(0, -1) : value;
  const lines = body.split("\n");
  return lines.map((text, i) => ({
    text,
    noEol: !endsWithNewline && i === lines.length - 1,
  }));
}

/** Turn two file contents into a flat line-level op stream via Myers diff (`diff` package). */
export function computeLineOps(oldText: string, newText: string): LineOp[] {
  const parts = diffLines(oldText, newText);
  const ops: LineOp[] = [];
  for (const part of parts) {
    // Stryker disable next-line ConditionalExpression
    const kind = part.added ? "add" : part.removed ? "del" : "context";
    for (const line of linesFromValue(part.value)) {
      ops.push({ kind, ...line });
    }
  }
  return ops;
}

type PositionedOp = LineOp & { oldNo?: number; newNo?: number };

function positionOps(ops: LineOp[]): PositionedOp[] {
  const positioned: PositionedOp[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const op of ops) {
    if (op.kind === "context") {
      positioned.push({ ...op, oldNo, newNo });
      oldNo++;
      newNo++;
    } else if (op.kind === "del") {
      positioned.push({ ...op, oldNo });
      oldNo++;
    } else {
      positioned.push({ ...op, newNo });
      newNo++;
    }
  }
  return positioned;
}

/**
 * The line number just before `index`, for a side with zero lines in this hunk.
 * `index` is always either 0 (start of file) or the position right after a context
 * line (buildHunks' clustering merges any adjacent changed op into the same hunk,
 * so a zero-length side can only border a context line or the file start) — so a
 * single lookback always resolves it.
 */
function nearestNoBefore(
  positioned: PositionedOp[],
  index: number,
  key: "oldNo" | "newNo",
): number {
  if (index === 0) return 0;
  return positioned[index - 1]![key]!;
}

export type Hunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: LineOp[];
};

/**
 * Group a line-op stream into unified-diff hunks, `contextLines` of context around
 * each change run, merging runs whose gap is within `2 * contextLines`.
 */
export function buildHunks(ops: LineOp[], contextLines: number): Hunk[] {
  const context = Math.max(0, Math.trunc(contextLines));
  const positioned = positionOps(ops);
  const changedIdx: number[] = [];
  positioned.forEach((op, i) => {
    if (op.kind !== "context") changedIdx.push(i);
  });
  if (changedIdx.length === 0) return [];

  const clusters: Array<[number, number]> = [];
  let curStart = changedIdx[0]!;
  let curEnd = changedIdx[0]!;
  for (let k = 1; k < changedIdx.length; k++) {
    const idx = changedIdx[k]!;
    if (idx - curEnd - 1 <= context * 2) {
      curEnd = idx;
    } else {
      clusters.push([curStart, curEnd]);
      curStart = idx;
      curEnd = idx;
    }
  }
  clusters.push([curStart, curEnd]);

  return clusters.map(([start, end]) => {
    const from = Math.max(0, start - context);
    const to = Math.min(positioned.length - 1, end + context);
    const lines = positioned.slice(from, to + 1);
    const oldLines = lines.filter((l) => l.kind !== "add").length;
    const newLines = lines.filter((l) => l.kind !== "del").length;
    const firstOld = lines.find((l) => l.oldNo !== undefined)?.oldNo;
    const firstNew = lines.find((l) => l.newNo !== undefined)?.newNo;
    const oldStart =
      oldLines === 0 ? nearestNoBefore(positioned, from, "oldNo") : firstOld!;
    const newStart =
      newLines === 0 ? nearestNoBefore(positioned, from, "newNo") : firstNew!;
    return { oldStart, oldLines, newStart, newLines, lines };
  });
}

/** Render hunks as unified-diff body text (`@@ ... @@` headers plus ` `/`-`/`+` lines). */
export function formatHunks(hunks: Hunk[]): string {
  const out: string[] = [];
  for (const hunk of hunks) {
    out.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const line of hunk.lines) {
      const prefix =
        line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
      out.push(`${prefix}${line.text}`);
      if (line.noEol) out.push("\\ No newline at end of file");
    }
  }
  return out.join("\n");
}

/** Net added/deleted line counts for a line-op stream (the numstat-equivalent data). */
export function countLineOps(ops: LineOp[]): {
  added: number;
  deleted: number;
} {
  let added = 0;
  let deleted = 0;
  for (const op of ops) {
    if (op.kind === "add") added++;
    else if (op.kind === "del") deleted++;
  }
  return { added, deleted };
}
