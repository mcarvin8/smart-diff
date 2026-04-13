# smart-diff

[![NPM](https://img.shields.io/npm/v/@mcarvin/smart-diff.svg?label=smart-diff)](https://www.npmjs.com/package/@mcarvin/smart-diff)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/smart-diff/main/LICENSE.md)
[![Downloads/week](https://img.shields.io/npm/dw/@mcarvin/smart-diff.svg)](https://npmjs.org/package/@mcarvin/smart-diff)

TypeScript library that turns a **git revision range** into a **Markdown summary** using an OpenAI-compatible Chat Completions API. It uses [`simple-git`](https://github.com/steveukx/git-js) to read the repo, respects **path includes/excludes** and **commit message include/exclude regexes**, and sends commits, paths, structured diff stats, and unified diff text to the model.

There is **no local fallback**: you must either configure an LLM gateway via environment variables or pass `openAiClientProvider` (for tests or custom clients).

## Requirements

- **Node.js** 20+

## Installation

```bash
npm install smart-diff
```

Build the package from source with `npm run build` (Rollup outputs CommonJS and ESM under `dist/`).

## LLM configuration

The library is considered “configured” when `shouldUseLlmGateway()` is true: API key, base URL, and/or JSON default headers are set. Otherwise `summarizeGitDiff` / `generateSummary` throw with `LLM_GATEWAY_REQUIRED_MESSAGE` unless you pass **`openAiClientProvider`**.

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` or `LLM_API_KEY` | API key (`LLM_*` wins over `OPENAI_*` where both exist). |
| `OPENAI_BASE_URL` or `LLM_BASE_URL` | Base URL for an OpenAI-compatible gateway (`LLM_*` overrides). |
| `OPENAI_DEFAULT_HEADERS` / `LLM_DEFAULT_HEADERS` | JSON object of extra headers; `LLM_*` merges on top of `OPENAI_*`. Can supply `Authorization` (e.g. raw `sk-…`) when no env key is set. |
| `LLM_MAX_DIFF_CHARS` | Max size of unified diff text sent to the model (default ~120k characters). |
| `LLM_MAX_TOKENS` or `OPENAI_MAX_TOKENS` | Max completion tokens (default 4000). |

The client is created with the official [`openai`](https://www.npmjs.com/package/openai) SDK via `createOpenAiLikeClient()`; use a compatible endpoint and model ID for your provider.

## Usage

### `summarizeGitDiff`

```ts
import { summarizeGitDiff } from 'smart-diff';

const markdown = await summarizeGitDiff({
  from: 'origin/main',
  to: 'HEAD',
  cwd: '/path/to/repo', // optional; default process.cwd()
  includeFolders: ['src'],
  excludeFolders: ['node_modules', 'dist'],
  commitMessageExcludeRegexes: ['^\\[bot\\]'],
  commitMessageIncludeRegexes: ['^feat:'], // optional; OR across patterns
  teamName: 'Platform',
  systemPrompt: undefined, // optional; overrides DEFAULT_GIT_DIFF_SYSTEM_PROMPT
  model: 'gpt-4o-mini', // optional
  maxDiffChars: 120_000, // optional; also see LLM_MAX_DIFF_CHARS
});
```

| Option | Description |
|--------|-------------|
| `from` / `to` | Git refs for the range; `to` defaults to `HEAD`. |
| `cwd` / `git` | Working tree for `simple-git`, or inject your own `SimpleGit` instance. |
| `includeFolders` | Limit diff to these paths relative to repo root (omit for full repo minus excludes). |
| `excludeFolders` | Excluded paths (git `:(exclude)` pathspecs), e.g. `node_modules`. |
| `commitMessageIncludeRegexes` | If any pattern is non-empty, only commits whose **full message** matches at least one pattern are kept (after excludes). Case-insensitive. |
| `commitMessageExcludeRegexes` | Drop commits whose message matches **any** of these patterns. |
| `teamName` | Adds a `Team:` line to the user payload for the model. |
| `systemPrompt` | Replaces the default system prompt. |
| `model` | Chat model id (default `gpt-4o-mini`). |
| `maxDiffChars` | Caps unified diff size for the request. |
| `openAiClientProvider` | `() => Promise<OpenAiLikeClient>` — bypasses env-based client creation (required in tests or when you wire the SDK yourself). |

### Diff shape: single range vs per-commit

- **Single unified diff** for `from..to` when no commit-message filters apply and the filtered commit list matches the full log for that range.
- **Concatenated per-commit patches** (`<hash>^!`) when you use include/exclude regexes or when the filtered commit list differs in length from the full range (so the diff reflects only the commits that remain).

### Lower-level API

The package also exports helpers such as `createGitClient`, `getCommits`, `getDiff`, `getDiffSummary`, `getChangedFiles`, `filterCommitsByMessageRegexes`, `buildDiffPathspecs`, `generateSummary`, and OpenAI config utilities (`resolveLlmBaseUrl`, `shouldUseLlmGateway`, `createOpenAiLikeClient`, …). Use these if you build a custom pipeline but still want the same git and LLM behavior.

## Development

```bash
npm test      # Jest + coverage
npm run build # Rollup → dist/
```

## License

MIT — see [LICENSE.md](LICENSE.md).
