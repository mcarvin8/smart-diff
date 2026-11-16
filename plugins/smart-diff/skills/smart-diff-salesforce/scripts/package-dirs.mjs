#!/usr/bin/env node
// Prints the smart-diff --include paths for a Salesforce DX project as JSON.
//
// Usage: node package-dirs.mjs [path/to/sfdx-project.json]
// Default: ./sfdx-project.json, resolved from the current directory.
//
// Output:
// {
//   "repoRoot": "/abs/repo",
//   "projectDir": "sfdx" | "",            // sfdx-project.json folder, relative to repoRoot
//   "packageDirectories": [{ "path", "include", "package", "default" }],
//   "skipped": [{ "path", "reason" }],    // paths outside the repository
//   "manifestDirs": ["manifest"],         // folders with package.xml / destructiveChanges*.xml outside the package dirs
//   "wholeRepo": false,                   // true when a package dir is the repository root
//   "includes": ["force-app", "manifest"] // pass each as --include (empty when wholeRepo)
// }
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const toPosix = (p) => p.split(sep).join("/").split("\\").join("/");

const trimSlashes = (p) => {
  let out = p;
  while (out.startsWith("./")) out = out.slice(2);
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
};

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const projectFile = resolve(process.argv[2] ?? "sfdx-project.json");
if (!existsSync(projectFile)) {
  console.error(`sfdx-project.json not found: ${projectFile}`);
  process.exit(1);
}

let project;
try {
  project = JSON.parse(readFileSync(projectFile, "utf8"));
} catch (err) {
  console.error(`Could not parse ${projectFile}: ${err.message}`);
  process.exit(1);
}

const projectAbs = dirname(projectFile);
const repoRoot = findRepoRoot(projectAbs);
if (!repoRoot) {
  console.error(`No git repository found above ${projectAbs}`);
  process.exit(1);
}

const projectDir = trimSlashes(toPosix(relative(repoRoot, projectAbs)));
const packageDirectories = [];
const skipped = [];

for (const entry of project.packageDirectories ?? []) {
  if (!entry || typeof entry.path !== "string" || entry.path.trim() === "")
    continue;
  const raw = trimSlashes(toPosix(entry.path.trim()));
  const abs = isAbsolute(entry.path) ? entry.path : resolve(projectAbs, raw);
  const rel = toPosix(relative(repoRoot, abs));
  if (rel.startsWith("..") || isAbsolute(rel)) {
    skipped.push({ path: entry.path, reason: "outside the repository" });
    continue;
  }
  packageDirectories.push({
    path: entry.path,
    include: trimSlashes(rel) || ".",
    package: entry.package ?? null,
    default: Boolean(entry.default),
  });
}

const pkgIncludes = packageDirectories.map((d) => d.include);
const insidePackageDir = (rel) =>
  pkgIncludes.some((p) => p === "." || rel === p || rel.startsWith(`${p}/`));

// Look one level below the project folder for folders holding deployment manifests.
const manifestDirs = [];
const isManifestFile = (name) =>
  name === "package.xml" || /^destructiveChanges.*\.xml$/i.test(name);
for (const name of readdirSync(projectAbs)) {
  if (name.startsWith(".") || name === "node_modules") continue;
  const abs = join(projectAbs, name);
  let isDir = false;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    continue;
  }
  if (!isDir) continue;
  const rel = toPosix(relative(repoRoot, abs));
  if (insidePackageDir(rel)) continue;
  let files = [];
  try {
    files = readdirSync(abs);
  } catch {
    continue;
  }
  if (files.some(isManifestFile)) manifestDirs.push(rel);
}

// A package directory at the repository root covers everything, and smart-diff
// ignores an "--include ." flag, so report it as a whole-repository diff.
const wholeRepo = pkgIncludes.includes(".");

console.log(
  JSON.stringify(
    {
      repoRoot: toPosix(repoRoot),
      projectDir,
      packageDirectories,
      skipped,
      manifestDirs,
      wholeRepo,
      includes: wholeRepo
        ? []
        : [...new Set([...pkgIncludes, ...manifestDirs])],
    },
    null,
    2,
  ),
);
