---
name: smart-diff
description: Use when the user asks to "summarize this diff", "summarize my branch changes", "write a PR description from the diff", "what changed between these refs", or "draft release notes from git history". Runs the smart-diff CLI (@mcarvin/smart-diff) to produce a Markdown summary of a git range using the user's own LLM provider, with built-in handling for large diffs (map-reduce, token reduction), commit-message filtering, and secret redaction. Requires Node.js 22.22.1+ and an LLM provider credential in environment variables. Works in any agent that can run shell commands.
---

# smart-diff

Summarize the changes in a git range as Markdown with the `smart-diff` CLI.
The CLI reads the repository directly (no `git` binary needed), sends the diff
to the LLM provider configured in the user's environment, and prints the
summary to stdout.

## When to use this instead of reading the diff yourself

- The diff is large (hundreds of files or more than ~100k characters).
  smart-diff can batch it with `--map-reduce` instead of losing the tail.
- The user wants the summary produced by a specific provider or model, or
  through a company LLM gateway.
- The user wants a repeatable command they can also run in CI.

For a small diff with no such needs, reading `git diff` yourself is fine.

## Step 1: Check prerequisites

1. Confirm the working directory is inside a git repository.
2. Confirm `node --version` is 22.22.1 or newer.
3. Confirm at least one provider credential is set. Check only whether the
   variable exists; never print its value. Common ones:
   `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
   `LLM_BASE_URL`, `AWS_ACCESS_KEY_ID` / `AWS_PROFILE`.
   The full list is in `references/options.md`.
4. If no credential is set, stop and tell the user which variables they can
   set. Never ask the user to paste a key into the chat, and never write a key
   to a file.

## Step 2: Pick the range

| User intent                     | Command arguments                     |
| ------------------------------- | ------------------------------------- |
| "my branch" / "this PR" vs main | `main HEAD --merge-base`              |
| Since a tag or release          | `v1.2.0 HEAD`                         |
| Between two specific refs       | `<from> <to>`                         |
| Only part of the repo           | add `--include <path>` (repeatable)   |
| Only feature/fix commits        | add `--commit-include "^(feat\|fix)"` |

If the default branch is not `main`, use the repository's actual default
branch (for example `origin/main`, `master`, or `develop`).

## Step 3: Run

Use the locally installed CLI if the project has it, otherwise `npx`:

```bash
npx @mcarvin/smart-diff <from> [to] --redact-secrets --exclude-default-noise
```

- Always pass `--redact-secrets`. It masks likely credentials in the diff
  before it is sent to the provider.
- `--exclude-default-noise` skips lockfiles, `dist/`, `build/`, `coverage/`,
  and `node_modules/`.
- For large diffs, add `--map-reduce --max-diff-chars 20000`, and optionally
  `--context-lines 1 --ignore-whitespace` to cut tokens.
- Pass `--provider <id>` or `--model <id>` only if the user asks for a
  specific provider or model.

## Step 4: Report the result

- On success (exit code 0), show the Markdown from stdout exactly as printed.
  Do not rewrite or re-summarize it unless the user asks.
- If the output starts with a truncation notice, tell the user and offer to
  rerun with `--map-reduce`.
- On failure (exit code 1), show the stderr message and the likely fix:
  - "No LLM provider configured": no provider credential is set.
  - Unknown or bad revision: the ref does not exist locally; suggest
    `git fetch` or a different ref.
  - Rate limit or 5xx after retries: suggest rerunning later or
    `--max-retries 4`.

## Reference

`references/options.md` lists every CLI flag and provider environment
variable.
