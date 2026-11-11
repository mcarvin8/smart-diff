---
name: smart-diff-claude
description: Use when the user asks to "summarize this diff", "summarize my branch", "write a PR description from my changes", "what changed between these refs", "what changed since the last release", or "draft release notes from git history", and no LLM provider API key is set (or the user wants Claude itself to write the summary). Uses the smart-diff CLI (@mcarvin/smart-diff) with --emit-context to read, filter, shape, and redact the git range locally, then Claude writes the summary from smart-diff's own prompts. No API key needed. Requires Node.js 22.22.1+.
---

# smart-diff (Claude writes the summary)

smart-diff normally sends the diff to an LLM provider using the user's API key.
With `--emit-context`, it stops before that call. It does all the local work
(reads the repository with no `git` binary, resolves the merge base, applies
path and commit filters, cuts token noise, masks secrets, and splits oversized
diffs into batches), then writes out the exact prompts it would have sent.
You (Claude) act as the model and write the summary from those prompts.

Use the `smart-diff` skill instead when the user wants a specific provider or
model, or a command that runs in CI. That path needs an API key.

## Step 1: Check prerequisites

1. Confirm the working directory is inside a git repository.
2. Confirm `node --version` is 22.22.1 or newer. If it is older, stop and tell
   the user.

## Step 2: Pick the range

| User intent                     | Arguments                             |
| ------------------------------- | ------------------------------------- |
| "my branch" / "this PR" vs main | `main HEAD --merge-base`              |
| Since a tag or release          | `v1.2.0 HEAD`                         |
| Between two specific refs       | `<from> <to>`                         |
| Only part of the repo           | add `--include <path>` (repeatable)   |
| Only feature/fix commits        | add `--commit-include "^(feat\|fix)"` |

If the default branch is not `main`, use the repository's actual default
branch (for example `origin/main`, `master`, or `develop`).

## Step 3: Emit the context

Create a fresh temporary directory (this works in any shell):

```bash
node -e "console.log(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'smart-diff-')))"
```

Then run smart-diff with `--emit-context --out-dir <that directory>`. Use the
project's installed CLI if it has one, otherwise `npx`:

```bash
npx -y @mcarvin/smart-diff@latest <from> [to] --emit-context --out-dir <dir> --redact-secrets --exclude-default-noise --map-reduce --max-diff-chars 60000
```

- Always pass `--redact-secrets`. The diff will enter your context, so mask
  likely credentials first.
- `--exclude-default-noise` skips lockfiles, `dist/`, `build/`, `coverage/`,
  and `node_modules/`.
- `--map-reduce --max-diff-chars 60000` keeps each batch small enough to read
  in full. Small diffs still come back as a single prompt.
- For very large ranges, also add `--context-lines 1 --ignore-whitespace
  --strip-diff-preamble` to cut tokens.
- To add domain rules, pass `--prompt-file <path>`. Its contents are appended
  to every system prompt, including the map and reduce prompts.
- Ignore `--provider`, `--model`, `--max-retries`, and `--usage`. They only
  apply when smart-diff calls an LLM itself.

If the command fails with `Unknown option '--emit-context'`, the installed
version is too old. Rerun with `npx -y @mcarvin/smart-diff@latest`.

stdout is a small JSON manifest. Parse it. It has `mode`, `notice`, and
`files` (absolute paths to Markdown files).

## Step 4: Write the summary

Treat each system-prompt file as your instructions for that step, and the
matching user-content file as the input. Follow the system prompt exactly.
It defines the format, the sections, and the team title.

### `mode: "single"`

1. Read `files.systemPrompt` and `files.userContent` in full.
2. Write the summary as that system prompt instructs, based only on the
   user content.

### `mode: "map-reduce"`

The diff was split into per-file batches (`files.mapUserContents`, in order).

1. Map: for each batch file, apply `files.mapSystemPrompt` to it and produce
   terse bullet notes for that batch only. If you can start subagents, give
   each batch to its own subagent with the paths of both files and ask it to
   return only the notes. That keeps the raw diff out of your main context.
   Otherwise, process the batches one at a time.
2. Reduce: read `files.reduceSystemPrompt` and
   `files.reduceUserContentPrefix`. Treat the prefix followed by the batch
   notes as the input, with each batch formatted as
   `--- Batch <i> of <n> ---` on its own line, then that batch's notes, and
   blank lines between batches. Write the final summary as the reduce system
   prompt instructs.

## Step 5: Report the result

- Output `notice` first, exactly as given (it may be empty). It tells the
  reader if the diff was truncated or batched. Then output the summary.
- If `notice` mentions a truncated diff, tell the user that part of the diff
  was not seen, and offer to rerun with `--map-reduce`.
- Delete the temporary directory when you are done.
- On failure (exit code 1), show the stderr message and the likely fix:
  - Unknown or bad revision: the ref does not exist locally. Suggest
    `git fetch` or a different ref.
  - "Missing required <from> ref": add the start ref.

## Reference

`../smart-diff/references/options.md` lists every CLI flag.
