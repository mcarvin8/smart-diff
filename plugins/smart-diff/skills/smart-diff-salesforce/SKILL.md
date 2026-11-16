---
name: smart-diff-salesforce
description: Use when the repository is a Salesforce DX project (has an sfdx-project.json) and the user asks to "summarize this diff", "summarize my branch", "write a PR description", "what changed since the last release", "draft release notes", or "what's in this Salesforce release/deployment". Uses the smart-diff CLI (@mcarvin/smart-diff) to limit the diff to the package directories listed in sfdx-project.json and to frame the summary as a Salesforce release (metadata types, destructive changes, security and access, deployment risks). Works with no API key (the agent writes the summary) or with the user's own LLM provider. Requires Node.js 22.22.1+.
license: MIT
---

# smart-diff for Salesforce DX releases

This skill runs the same pipeline as the `smart-diff-agent` and
`smart-diff-provider` skills, with two changes for Salesforce DX projects:

- The diff is limited to the package directories in `sfdx-project.json`, so
  CI config, scripts, and tooling files stay out of the release summary.
- `references/salesforce-release-prompt.md` is appended to every smart-diff
  system prompt. It tells the model to group changes by metadata type and to
  call out destructive changes, security and access changes, and deployment
  risks.

Use this skill instead of `smart-diff-agent` or `smart-diff-provider` whenever
the repository has an `sfdx-project.json`, unless the user asks for a summary
of the whole repository.

## Step 1: Check prerequisites

1. Confirm the working directory is inside a git repository, and find the
   repository root (`git rev-parse --show-toplevel`).
2. Confirm `node --version` is 22.22.1 or newer. If it is older, stop and
   tell the user.
3. Find `sfdx-project.json`. It is usually at the repository root. If it is
   in a subfolder, note that folder's path relative to the repository root.
   If there is none, stop and use the `smart-diff-agent` or
   `smart-diff-provider` skill instead.

## Step 2: Get the package directories

Read `sfdx-project.json` (it is JSON) and build the list of `--include`
paths from its `packageDirectories` array. Each entry has a `path`, and may
have a `package` name and a `default` flag.

For each `path`:

1. Use forward slashes, and drop a leading `./` and any trailing `/`.
2. `--include` is relative to the repository root. If `sfdx-project.json` is
   in a subfolder, prefix the path with that subfolder (for example
   `force-app` in `sfdx/` becomes `sfdx/force-app`).
3. Skip a path that resolves outside the repository (for example
   `../shared`), and mention it to the user.
4. If the user names one package (by `package` name or path), keep only
   that one.

Then look at the folders next to `sfdx-project.json` that are not package
directories. Add any folder that holds `package.xml` or
`destructiveChanges*.xml` (usually `manifest/`) as another `--include`, so
destructive changes show up in the summary.

Special cases:

- If a package directory is the project root (`path` is `.` or `./`) and
  `sfdx-project.json` is at the repository root, pass no `--include` flags
  at all. smart-diff ignores `--include .`, and mixing it with other
  includes would drop the root package. Tell the user the summary covers the
  whole repository.
- If `packageDirectories` is empty or missing, tell the user and ask whether
  to summarize the whole repository instead.
- If `sfdx-project.json` is not valid JSON, show the parse error and stop.

## Step 3: Pick the range

| User intent                         | Arguments                             |
| ----------------------------------- | ------------------------------------- |
| "my branch" / "this PR" vs main     | `main HEAD --merge-base`              |
| Since the last release tag          | `<tag> HEAD`                          |
| Between two specific refs           | `<from> <to>`                         |
| Only feature/fix commits            | add `--commit-include "^(feat\|fix)"` |

If the default branch is not `main`, use the repository's actual default
branch (for example `origin/main`, `master`, or `develop`). For "since the
last release", find the latest tag with `git describe --tags --abbrev=0`.

If the user gives a team, product, or release name, pass it as
`--team "<name>"`. It is used in the summary title.

## Step 4: Choose who writes the summary

- **Agent mode (default):** you write the summary from smart-diff's prompts.
  No API key needed. Use this unless the user asks for a specific provider or
  model, or a command to run in CI.
- **Provider mode:** smart-diff calls the user's own LLM provider. Use this
  only if the user asks for it and a provider credential is set. Check only
  whether the variable exists, and never print its value (see
  `../smart-diff-provider/SKILL.md` for the variable names).

Both modes use these flags:

```text
--include <dir> [--include <dir> ...]
--prompt-file <absolute path to references/salesforce-release-prompt.md in this skill's folder>
--redact-secrets
--exclude-default-noise
```

- Always pass `--redact-secrets`. Salesforce metadata can hold credentials
  (named credentials, custom metadata, static resources).
- If a user asks for extra house rules, write them to a temporary file and
  pass a second `--prompt-file`.

### Agent mode

Create a fresh temporary directory:

```bash
node -e "console.log(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'smart-diff-')))"
```

Then run:

```bash
npx -y @mcarvin/smart-diff@latest <from> [to] <shared flags> --emit-context --out-dir <dir> --map-reduce --max-diff-chars 60000
```

For very large ranges (Salesforce profiles and layouts can be huge), also add
`--context-lines 1 --ignore-whitespace --strip-diff-preamble`.

Parse the JSON manifest on stdout and write the summary exactly as described
in Step 4 of `../smart-diff-agent/SKILL.md`:

- `mode: "single"`: follow `files.systemPrompt` to summarize
  `files.userContent`.
- `mode: "map-reduce"`: summarize each `files.mapUserContents` batch with
  `files.mapSystemPrompt` (in subagents if you can), then combine the batch
  notes with `files.reduceSystemPrompt` and `files.reduceUserContentPrefix`,
  formatting each batch as `--- Batch <i> of <n> ---` followed by its notes.

The Salesforce rules are already inside those system prompts. Follow them.

### Provider mode

```bash
npx @mcarvin/smart-diff <from> [to] <shared flags>
```

For large diffs, add `--map-reduce --max-diff-chars 20000`. Pass
`--provider` or `--model` only if the user asks.

## Step 5: Report the result

- Output `notice` (agent mode) or any truncation notice (provider mode)
  first, then the summary. In provider mode, show stdout as printed.
- Say which package directories were included, and that files outside them
  (CI config, scripts, tooling) were left out on purpose.
- If the summary mentions deleted components and no destructive changes
  manifest was in the diff, remind the user that removing source does not
  delete the component from the org.
- If the diff was truncated, offer to rerun with `--map-reduce`.
- In agent mode, delete the temporary directory when you are done.
- On failure (exit code 1), show stderr and the likely fix:
  - Unknown or bad revision: suggest `git fetch` or a different ref.
  - "No LLM provider configured" in provider mode: switch to agent mode.
  - An empty diff: the range has no changes in the package directories.
    Tell the user, and offer to summarize the whole repository.

## Reference

`../smart-diff-provider/references/options.md` lists every CLI flag.
