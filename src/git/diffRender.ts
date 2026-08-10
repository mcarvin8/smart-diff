import type { DiffChange, ObjectId, Repository } from "@scolladon/tsgit";
import { isBinary } from "@scolladon/tsgit";

import {
  buildHunks,
  computeLineOps,
  countLineOps,
  formatHunks,
} from "./diffRenderPrimitives.js";

const textDecoder = new TextDecoder("utf-8", { fatal: false });

export type RenderedFileDiff = {
  /** Path used for lookups/display: `newPath` for add/rename/copy, `oldPath` for delete, `path` otherwise. */
  path: string;
  oldPath?: string;
  newPath?: string;
  added: number;
  deleted: number;
  binary: boolean;
  /** Full `diff --git ...` block for this file, including headers. Empty hunks are omitted (e.g. a pure rename). */
  text: string;
};

export type ChangePaths = { oldPath?: string; newPath?: string; path: string };

/** Repo-relative path(s) touched by a change: the pair for rename/copy, a single path otherwise. */
export function changePaths(change: DiffChange): ChangePaths {
  switch (change.type) {
    case "add":
      return { newPath: change.newPath, path: change.newPath };
    case "delete":
      return { oldPath: change.oldPath, path: change.oldPath };
    case "modify":
    case "type-change":
      return { oldPath: change.path, newPath: change.path, path: change.path };
    case "rename":
    case "copy":
      return {
        oldPath: change.oldPath,
        newPath: change.newPath,
        path: change.newPath,
      };
  }
}

function changeIds(change: DiffChange): {
  oldId?: ObjectId;
  newId?: ObjectId;
} {
  switch (change.type) {
    case "add":
      return { newId: change.newId };
    case "delete":
      return { oldId: change.oldId };
    default:
      return { oldId: change.oldId, newId: change.newId };
  }
}

function abbrev(id: ObjectId | undefined): string {
  return id ? id.slice(0, 7) : "0000000";
}

function similarityPercent(similarity: {
  score: number;
  maxScore: number;
}): number {
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  if (similarity.maxScore <= 0) return 0;
  return Math.round((similarity.score / similarity.maxScore) * 100);
}

function buildHeaderLines(change: DiffChange, binary: boolean): string[] {
  const { oldPath, newPath, path } = changePaths(change);
  const { oldId, newId } = changeIds(change);
  const displayOld = oldPath ?? path;
  const displayNew = newPath ?? path;
  const lines: string[] = [`diff --git a/${displayOld} b/${displayNew}`];

  if (change.type === "add") {
    lines.push(`new file mode ${change.newMode}`);
  } else if (change.type === "delete") {
    lines.push(`deleted file mode ${change.oldMode}`);
  } else if (change.oldMode !== change.newMode) {
    lines.push(`old mode ${change.oldMode}`);
    lines.push(`new mode ${change.newMode}`);
  }

  if (change.type === "rename" || change.type === "copy") {
    const label = change.type === "rename" ? "rename" : "copy";
    lines.push(`similarity index ${similarityPercent(change.similarity)}%`);
    lines.push(`${label} from ${change.oldPath}`);
    lines.push(`${label} to ${change.newPath}`);
  }

  const modeSuffix =
    change.type === "modify" && change.oldMode === change.newMode
      ? ` ${change.newMode}`
      : "";
  lines.push(`index ${abbrev(oldId)}..${abbrev(newId)}${modeSuffix}`);

  if (binary) {
    lines.push(`Binary files a/${displayOld} and b/${displayNew} differ`);
  } else {
    lines.push(change.type === "add" ? "--- /dev/null" : `--- a/${displayOld}`);
    lines.push(
      change.type === "delete" ? "+++ /dev/null" : `+++ b/${displayNew}`,
    );
  }
  return lines;
}

async function readBlobBytes(
  repo: Repository,
  id: ObjectId | undefined,
): Promise<Uint8Array | undefined> {
  if (id === undefined) return undefined;
  const blob = await repo.primitives.readBlob(id);
  return blob.content;
}

/** Materialize both blob sides of a `DiffChange` and render it as a unified-diff text block. */
export async function renderFileDiff(
  repo: Repository,
  change: DiffChange,
  contextLines: number,
): Promise<RenderedFileDiff> {
  const { oldPath, newPath, path } = changePaths(change);
  const { oldId, newId } = changeIds(change);

  const [oldBytes, newBytes] = await Promise.all([
    readBlobBytes(repo, oldId),
    readBlobBytes(repo, newId),
  ]);

  const binary = Boolean(
    (oldBytes && isBinary(oldBytes)) || (newBytes && isBinary(newBytes)),
  );
  const headerLines = buildHeaderLines(change, binary);

  if (binary) {
    return {
      path,
      oldPath,
      newPath,
      added: 0,
      deleted: 0,
      binary: true,
      text: headerLines.join("\n"),
    };
  }

  const oldText = oldBytes ? textDecoder.decode(oldBytes) : "";
  const newText = newBytes ? textDecoder.decode(newBytes) : "";
  const ops = computeLineOps(oldText, newText);
  const { added, deleted } = countLineOps(ops);
  const body = formatHunks(buildHunks(ops, contextLines));

  return {
    path,
    oldPath,
    newPath,
    added,
    deleted,
    binary: false,
    text: body ? `${headerLines.join("\n")}\n${body}` : headerLines.join("\n"),
  };
}

/** Render every change in a `TreeDiff` and join into one unified-diff document. */
export async function renderUnifiedDiff(
  repo: Repository,
  changes: readonly DiffChange[],
  contextLines: number,
): Promise<RenderedFileDiff[]> {
  return Promise.all(
    changes.map((change) => renderFileDiff(repo, change, contextLines)),
  );
}
