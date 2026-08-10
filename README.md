# smart-diff

[![NPM](https://img.shields.io/npm/v/@mcarvin/smart-diff.svg?label=smart-diff)](https://www.npmjs.com/package/@mcarvin/smart-diff)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/smart-diff/main/LICENSE.md)
[![Downloads/week](https://img.shields.io/npm/dw/@mcarvin/smart-diff.svg)](https://npmjs.org/package/@mcarvin/smart-diff)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/smart-diff/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/smart-diff)
[![codecov](https://codecov.io/gh/mcarvin8/smart-diff/graph/badge.svg?token=H3ZWAGG7S9)](https://codecov.io/gh/mcarvin8/smart-diff)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fmcarvin8%2Fsmart-diff%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/mcarvin8/smart-diff/main)

TypeScript library that turns a **git revision range** into a **Markdown summary** using any LLM provider supported by the [Vercel AI SDK](https://sdk.vercel.ai) (OpenAI, Anthropic, Google Gemini, Amazon Bedrock, Mistral, Cohere, Groq, xAI, DeepSeek, and OpenAI-compatible gateways). Ships a bundled git binary via [dugite](https://github.com/desktop/dugite) — no system git required. Supports path includes/excludes and commit message regex filters, and sends commits, file paths, diff stats, and unified diff text to the model.

## Requirements

- **Node.js** 22+
- An LLM provider credential (see [Provider configuration](#provider-configuration))

### Alpine Linux / musl libc

Dugite's bundled git binary is compiled against glibc and will not run on Alpine Linux or other musl-based images. Set the two [dugite execution env vars](https://github.com/desktop/dugite/blob/main/docs/environment-variables.md#execution) to point at your system git instead:

| Variable | Purpose |
|---|---|
| `LOCAL_GIT_DIRECTORY` | Root of your git installation (the directory containing `bin/git`) |
| `GIT_EXEC_PATH` | Directory containing git's subprograms (set if your distro moves them) |

```sh
export LOCAL_GIT_DIRECTORY=/usr        # uses /usr/bin/git
export GIT_EXEC_PATH=/usr/lib/git-core # only needed if subprograms are non-standard
```

Install git in your image first if needed (`apk add git`). No code changes are required — these are first-class dugite env vars.

## Installation

```bash
npm install @mcarvin/smart-diff
```

All provider packages are **optional** — only install the one(s) you need:

```bash
# OpenAI
npm install @ai-sdk/openai

# Anthropic
npm install @ai-sdk/anthropic

# Google Gemini
npm install @ai-sdk/google

# Amazon Bedrock
npm install @ai-sdk/amazon-bedrock

# OpenAI-compatible gateway (Azure, Ollama, Together, etc.)
npm install @ai-sdk/openai-compatible

# Others: @ai-sdk/mistral  @ai-sdk/cohere  @ai-sdk/groq  @ai-sdk/xai  @ai-sdk/deepseek
```

If the package for the selected provider is missing at runtime, smart-diff throws a clear error telling you which one to install.

## Provider configuration

smart-diff is "configured" when [`isLlmProviderConfigured()`](#lower-level-api) returns true — i.e. at least one supported provider can be resolved from env vars — **or** you pass your own `llmModelProvider` factory. Otherwise `summarizeGitDiff` / `generateSummary` throw with `LLM_GATEWAY_REQUIRED_MESSAGE`.

### Selecting a provider

`LLM_PROVIDER` explicitly selects a provider. When unset, the resolver auto-detects in this order: `LLM_BASE_URL`/`OPENAI_BASE_URL` → `openai-compatible`, `OPENAI_API_KEY`/`LLM_API_KEY` → `openai`, then `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (or `GOOGLE_API_KEY`), `MISTRAL_API_KEY`, `COHERE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `AWS_ACCESS_KEY_ID`/`AWS_PROFILE` → `bedrock`, and finally `OPENAI_DEFAULT_HEADERS`/`LLM_DEFAULT_HEADERS` → `openai`.

| Provider (`LLM_PROVIDER`) | Package | Credential env vars | Default model |
|---|---|---|---|
| `openai` | `@ai-sdk/openai` | `OPENAI_API_KEY` or `LLM_API_KEY` | `gpt-4o-mini` |
| `openai-compatible` | `@ai-sdk/openai-compatible` | `LLM_BASE_URL` or `OPENAI_BASE_URL` (required); `OPENAI_API_KEY`/`LLM_API_KEY` or custom headers | `gpt-4o-mini` |
| `anthropic` | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` |
| `google` | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| `bedrock` | `@ai-sdk/amazon-bedrock` | `AWS_ACCESS_KEY_ID` / `AWS_PROFILE` (auto-detects); full AWS credential chain supported | `anthropic.claude-3-5-haiku-20241022-v1:0` |
| `mistral` | `@ai-sdk/mistral` | `MISTRAL_API_KEY` | `mistral-small-latest` |
| `cohere` | `@ai-sdk/cohere` | `COHERE_API_KEY` | `command-r-08-2024` |
| `groq` | `@ai-sdk/groq` | `GROQ_API_KEY` | `llama-3.1-8b-instant` |
| `xai` | `@ai-sdk/xai` | `XAI_API_KEY` | `grok-2-latest` |
| `deepseek` | `@ai-sdk/deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` |

> `LLM_*` wins over `OPENAI_*` where both exist.

### Common env vars

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | Explicit provider id from the table above. |
| `LLM_MODEL` | Overrides the per-provider default model id. |
| `OPENAI_BASE_URL` / `LLM_BASE_URL` | Base URL for an OpenAI-compatible gateway; presence alone auto-selects the `openai-compatible` provider. |
| `OPENAI_DEFAULT_HEADERS` / `LLM_DEFAULT_HEADERS` | JSON object of extra headers merged onto OpenAI / OpenAI-compatible requests (e.g. RBAC tokens, raw `Authorization`). `LLM_*` overrides `OPENAI_*` key-by-key. |
| `LLM_PROVIDER_NAME` | Display name used when `openai-compatible` is active (defaults to `openai-compatible`). |
| `OPENAI_MAX_DIFF_CHARS` / `LLM_MAX_DIFF_CHARS` | Max size of unified diff text sent to the model (default ~120k characters). |
| `OPENAI_MAX_TOKENS` / `LLM_MAX_TOKENS` | Max completion tokens (default 4000). |
| `LLM_TEMPERATURE` | Sampling temperature, clamped to 0–2 (default 0.2). Lower = more deterministic; higher = more varied prose. |
| `LLM_MAX_RETRIES` | Retry count for transient LLM call failures — rate limits, 5xx, network errors (default 2, matching the Vercel AI SDK's own default). Set to 0 to disable retries. |

### Example: native OpenAI

```powershell
$env:OPENAI_API_KEY = "sk-..."
# Optional: $env:LLM_MODEL = "gpt-4o"
```

### Example: Anthropic Claude

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:LLM_MODEL = "claude-3-5-sonnet-latest"   # optional override
```

### Example: company-managed OpenAI-compatible gateway

```powershell
$env:OPENAI_BASE_URL = "https://llm-gateway.example.com"
$env:OPENAI_DEFAULT_HEADERS = '{"x-company-rbac":"your-rbac-token-here","Authorization":"Bearer sk-your-api-key-here"}'
# LLM_PROVIDER is auto-detected as "openai-compatible" because LLM_BASE_URL/OPENAI_BASE_URL is set.
```

### Example: Google Gemini

```powershell
$env:GOOGLE_GENERATIVE_AI_API_KEY = "..."
$env:LLM_MODEL = "gemini-2.0-flash"
```

## Usage

### `summarizeGitDiff`

```ts
import { summarizeGitDiff } from '@mcarvin/smart-diff';

const markdown = await summarizeGitDiff({
  from: 'origin/main',
  to: 'HEAD',
  cwd: '/path/to/repo', // optional; default process.cwd()
  includeFolders: ['src'],
  excludeFolders: ['node_modules', 'dist'],
  commitMessageExcludeRegexes: ['^\\[bot\\]'],
  commitMessageIncludeRegexes: ['^feat:'], // optional; OR across patterns
  teamName: 'Platform',
  systemPrompt: undefined,   // optional; overrides DEFAULT_GIT_DIFF_SYSTEM_PROMPT
  provider: 'anthropic',     // optional; overrides LLM_PROVIDER env + auto-detection
  model: 'claude-3-5-sonnet-latest', // optional
  maxDiffChars: 120_000,     // optional; also see LLM_MAX_DIFF_CHARS
});
```

| Option | Description |
|--------|-------------|
| `from` / `to` | Git refs for the range; `to` defaults to `HEAD`. |
| `cwd` / `git` | Working directory path, or inject your own `GitClient` instance. |
| `includeFolders` | Limit diff to these paths relative to repo root (omit for full repo minus excludes). |
| `excludeFolders` | Excluded paths (git `:(exclude)` pathspecs), e.g. `node_modules`. |
| `commitMessageIncludeRegexes` | If any pattern is non-empty, only commits whose **full message** matches at least one pattern are kept (after excludes). Case-insensitive. |
| `commitMessageExcludeRegexes` | Drop commits whose message matches **any** of these patterns. |
| `teamName` | Adds a `Team:` line to the user payload for the model. |
| `systemPrompt` | Replaces the default system prompt. |
| `provider` | `LlmProviderId` — wins over `LLM_PROVIDER` env and auto-detection. |
| `model` | Chat model id; overrides `LLM_MODEL` and the provider default. |
| `maxDiffChars` | Caps unified diff size for the request. |
| `maxRetries` | Retry count for transient LLM call failures (rate limits, 5xx, network errors); also settable via `LLM_MAX_RETRIES`. Default 2 (matches the Vercel AI SDK's own default). Set to 0 to disable retries. |
| `mapReduce` | When the diff exceeds `maxDiffChars`, split it into per-file batches, summarize each batch independently (map), then synthesize one final summary from the batch summaries (reduce) instead of hard-truncating the diff. No effect when the diff already fits within `maxDiffChars`. |
| `contextLines` | Number of context lines around each change (`git diff -U<n>`). Lower values (1 or 0) are the single biggest token saver on modification-heavy diffs. |
| `ignoreWhitespace` | Passes `-w` / `--ignore-all-space` to `git diff` so pure-whitespace hunks don't consume tokens. Also applies to `--numstat` / `--name-status` so counts stay consistent. |
| `stripDiffPreamble` | Removes low-value lines from the unified diff (`diff --git`, `index`, mode changes, `similarity/rename/copy` metadata). `--- a/…`, `+++ b/…`, and `@@` hunk headers are kept. |
| `maxHunkLines` | Caps the body of each hunk; anything past the limit is replaced with a single elision marker. The `@@` header and `DiffSummary` totals are preserved. |
| `excludeDefaultNoise` | Merges the built-in `DEFAULT_NOISE_EXCLUDES` list (lockfiles, `dist`, `build`, `out`, `coverage`, `node_modules`, `__snapshots__`) into `excludeFolders`. |
| `redactSecrets` | Masks likely secrets/credentials in the diff text before it's sent to the LLM — cloud provider keys, VCS/chat tokens, PEM private key blocks, JWTs, `Bearer` headers, basic-auth URL passwords, and generic `KEY=value` assignments. Uses `DEFAULT_SECRET_PATTERNS` unless `secretPatterns` overrides them. |
| `secretPatterns` | Overrides the built-in secret-detection rules used when `redactSecrets` is true. |
| `llmModelProvider` | `() => Promise<LanguageModel>` — bypass env-based resolution entirely; hand-wire a Vercel AI SDK `LanguageModel` (required in tests or custom setups). |

#### Reducing tokens

For most repos, the cheapest wins are:

```ts
await summarizeGitDiff({
  from: 'origin/main',
  contextLines: 1,          // -U1 cuts 30-60% of tokens on typical diffs
  ignoreWhitespace: true,   // drop pure-whitespace hunks entirely
  stripDiffPreamble: true,  // kill `index`/`mode`/`similarity` lines
  maxHunkLines: 400,        // truncate monster hunks but keep the @@ header
  excludeDefaultNoise: true // skip lockfiles, dist/, coverage/, node_modules/
});
```

These options only reshape the *unified diff text* — the structured `DiffSummary` still reports true file counts and line totals, so the model always sees the full change inventory.

#### Map-reduce for oversized diffs

By default, a diff over `maxDiffChars` is hard-truncated — only the first N characters are sent, and a notice is prepended to the summary. Set `mapReduce: true` to instead split the diff into per-file batches, summarize each batch independently, then synthesize one final summary from the batch summaries:

```ts
await summarizeGitDiff({
  from: 'origin/main',
  maxDiffChars: 20_000,
  mapReduce: true, // no-op when the diff already fits within maxDiffChars
});
```

This costs one extra LLM call per batch plus one reduce call, so it's slower and more expensive than a single request — use it when losing coverage of the tail of a large diff matters more than latency/cost. `systemPrompt` (if set) applies to the reduce phase only; the map phase always uses `DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT`.

### Usage reporting

`summarizeGitDiffWithUsage` returns the same Markdown summary plus token usage aggregated across every LLM call made to produce it — one call by default, or every map-reduce batch plus the reduce call when `mapReduce` is used:

```ts
import { summarizeGitDiffWithUsage } from '@mcarvin/smart-diff';

const { summary, usage } = await summarizeGitDiffWithUsage({ from: 'origin/main' });
// usage: { requestCount, inputTokens, outputTokens, totalTokens, cachedInputTokens }
```

This reports token counts only — no dollar cost estimate, since per-token pricing varies by provider/model and changes over time; a hardcoded price table would drift out of date. Fields are 0 when a provider doesn't report a given figure. `generateSummaryWithUsage` is the lower-level equivalent of `generateSummary`.

### Injecting your own `LanguageModel`

If you want full control — for example, to configure retries, middlewares, or hit an in-process mock — pass `llmModelProvider`:

```ts
import { summarizeGitDiff } from '@mcarvin/smart-diff';
import { createAnthropic } from '@ai-sdk/anthropic';

const md = await summarizeGitDiff({
  from: 'origin/main',
  llmModelProvider: async () =>
    createAnthropic({ apiKey: process.env.MY_ANTHROPIC_KEY })(
      'claude-3-5-sonnet-latest',
    ),
});
```

### Diff shape: single range vs per-commit

- **Single unified diff** for `from..to` when no commit-message filters apply and the filtered commit list matches the full log for that range.
- **Concatenated per-commit patches** (`<hash>^!`) when you use include/exclude regexes or when the filtered commit list differs in length from the full range (so the diff reflects only the commits that remain).

### Lower-level API

The package also exports helpers for building a custom pipeline on top of the same git and LLM behavior:

- **Git**: `createGitClient(cwd?, timeout?)`, `getRepoRoot`, `getCommits`, `getDiff`, `getDiffSummary`, `getChangedFiles`, `filterCommitsByMessageRegexes`, `buildDiffPathspecs`, `buildDiffShapingGitArgs`, `shapeUnifiedDiff`, `redactSecrets`, `DEFAULT_NOISE_EXCLUDES`, `DEFAULT_SECRET_PATTERNS` — `timeout` is in milliseconds; omit for no timeout
- **AI**: `generateSummary`, `generateSummaryWithUsage`, `resolveLlmMaxDiffChars`, `resolveLlmMaxRetries`, `truncateUnifiedDiffForLlm`, `splitUnifiedDiffIntoFileChunks`, `groupDiffChunksByBudget`
- **Provider resolution**: `resolveLanguageModel`, `detectLlmProvider`, `isLlmProviderConfigured`, `defaultModelForProvider`, `resolveLlmBaseUrl`, `parseLlmDefaultHeadersFromEnv`
- **Constants / types**: `DEFAULT_GIT_DIFF_SYSTEM_PROMPT`, `DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT`, `DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT`, `LLM_GATEWAY_REQUIRED_MESSAGE`, `LlmProviderId`, `LlmModelProvider`, `ResolveLanguageModelOptions`, `GenerateSummaryInput`, `SummarizeFlags`, `LlmUsageReport`, `DiffFileSummary`, `DiffSummary`, `CommitInfo`, `GitClient`, `GitDiffRangeQuery`, `DiffPathFilter`, `DiffShapingOptions`, `SecretRedactionRule` — `DiffFileSummary.binary?: boolean` is set to `true` when git reports `-` for additions/deletions (binary file); absent for text files

## Migrating from 2.x → 3.x

`@ai-sdk/openai` and `@ai-sdk/openai-compatible` are no longer bundled as direct dependencies. If you use either, add them explicitly:

```bash
npm install @ai-sdk/openai
# or
npm install @ai-sdk/openai-compatible
```

Everything else — env vars, auto-detection, the public API — is unchanged.

## Used By

This package is used downstream by:

- [sf-git-ai-meta-insights](https://github.com/mcarvin8/sf-git-ai-meta-insights) — Salesforce metadata wrapper compatible with Salesforce DX projects
- [gitlab-llm-kit](https://github.com/mcarvin8/gitlab-llm-kit) — TypeScript toolkit for GitLab REST API access and LLM-powered insights (merge requests, issues, pipelines, security, releases, wiki, and more)

## License

[MIT](LICENSE.md)
