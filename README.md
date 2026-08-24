# smart-diff

[![NPM](https://img.shields.io/npm/v/@mcarvin/smart-diff.svg?label=smart-diff)](https://www.npmjs.com/package/@mcarvin/smart-diff)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/smart-diff/main/LICENSE.md)
[![Downloads/week](https://img.shields.io/npm/dw/@mcarvin/smart-diff.svg)](https://npmjs.org/package/@mcarvin/smart-diff)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/smart-diff/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/smart-diff)
[![codecov](https://codecov.io/gh/mcarvin8/smart-diff/graph/badge.svg?token=H3ZWAGG7S9)](https://codecov.io/gh/mcarvin8/smart-diff)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fmcarvin8%2Fsmart-diff%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/mcarvin8/smart-diff/main)

Generate AI-powered natural-language summaries of git diffs for code review in any git repository.

Supports OpenAI, Anthropic, Google Gemini, Amazon Bedrock, Mistral, Cohere, Groq, xAI, DeepSeek, or any OpenAI-compatible gateway.

- [Requirements](#requirements)
- [Installation](#installation)
- [Provider configuration](#provider-configuration)
- [Usage](#usage)
  - [Use as a Library - `summarizeGitDiff`](#use-as-a-library---summarizegitdiff)
  - [Use as a CLI](#use-as-a-cli)
  - [Options reference](#options-reference)
  - [Handling large diffs](#handling-large-diffs)
  - [Token usage reporting](#token-usage-reporting)
  - [Injecting your own `ChatModel`](#injecting-your-own-chatmodel)
  - [Diff shape: single range vs per-commit](#diff-shape-single-range-vs-per-commit)
  - [Lower-level API](#lower-level-api)
- [Used By](#used-by)
- [License](#license)

## Requirements

- **Node.js** 22.22.1+
- An LLM provider credential (see [Provider configuration](#provider-configuration))
- No git binary required, on any platform — smart-diff reads the git repository directly via [`@scolladon/tsgit`](https://github.com/scolladon/tsgit), a pure-TypeScript git implementation with zero native dependencies

## Installation

```bash
npm install @mcarvin/smart-diff
```

## Provider configuration

smart-diff is "configured" when [`isLlmProviderConfigured()`](#lower-level-api) returns true — i.e. at least one supported provider can be resolved from env vars — **or** you pass your own `llmModelProvider` factory. Otherwise `summarizeGitDiff` / `generateSummary` throw with `LLM_GATEWAY_REQUIRED_MESSAGE`.

### Selecting a provider

`LLM_PROVIDER` explicitly selects a provider. When unset, the resolver auto-detects in this order: `LLM_BASE_URL`/`OPENAI_BASE_URL` → `openai-compatible`, `OPENAI_API_KEY`/`LLM_API_KEY` → `openai`, then `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (or `GOOGLE_API_KEY`), `MISTRAL_API_KEY`, `COHERE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `AWS_ACCESS_KEY_ID`/`AWS_PROFILE` → `bedrock`, and finally `OPENAI_DEFAULT_HEADERS`/`LLM_DEFAULT_HEADERS` → `openai`.

| Provider (`LLM_PROVIDER`) | Endpoint | Credential env vars | Default model |
|---|---|---|---|
| `openai` | OpenAI Chat Completions | `OPENAI_API_KEY` or `LLM_API_KEY` | `gpt-4o-mini` |
| `openai-compatible` | Chat Completions at `LLM_BASE_URL`/`OPENAI_BASE_URL` | `LLM_BASE_URL` or `OPENAI_BASE_URL` (required); `OPENAI_API_KEY`/`LLM_API_KEY` or custom headers | `gpt-4o-mini` |
| `anthropic` | Anthropic Messages API | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001` |
| `google` | Gemini Generative Language API | `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| `bedrock` | Bedrock Converse API (in-house SigV4 signing) | `AWS_ACCESS_KEY_ID`+`AWS_SECRET_ACCESS_KEY` (+ optional `AWS_SESSION_TOKEN`), or `AWS_PROFILE` pointing at a profile in `~/.aws/credentials`; region from `AWS_REGION`/`AWS_DEFAULT_REGION`/`~/.aws/config` (default `us-east-1`). SSO, instance-role, and container credentials are **not** supported — static credentials only. | `anthropic.claude-3-5-haiku-20241022-v1:0` |
| `mistral` | Mistral Chat Completions API | `MISTRAL_API_KEY` | `mistral-small-latest` |
| `cohere` | Cohere Chat API (v2) | `COHERE_API_KEY` | `command-r-08-2024` |
| `groq` | Groq Chat Completions API | `GROQ_API_KEY` | `llama-3.1-8b-instant` |
| `xai` | xAI Chat Completions API | `XAI_API_KEY` | `grok-2-latest` |
| `deepseek` | DeepSeek Chat Completions API | `DEEPSEEK_API_KEY` | `deepseek-chat` |

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
| `LLM_MAX_RETRIES` | Retry count for transient LLM call failures — rate limits, 5xx, network errors (default 2). Set to 0 to disable retries. |

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

Use smart-diff as a library, or as the `smart-diff` CLI binary that ships with the package via the `bin` field — no separate install. Provider configuration is identical either way; see [Provider configuration](#provider-configuration). Every option below has a library form (a key in the `summarizeGitDiff` object) and, where applicable, an equivalent kebab-case CLI flag.

### Use as a Library - `summarizeGitDiff`

```ts
import { summarizeGitDiff } from '@mcarvin/smart-diff';

const { summary, usage } = await summarizeGitDiff({
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
// summary: Markdown string
// usage: LlmUsageReport aggregated across every LLM call — see Token usage reporting below
```

### Use as a CLI

```bash
npm install @mcarvin/smart-diff
npx smart-diff origin/main HEAD --team Platform --max-diff-chars 20000
npx smart-diff --help
```

- `<from>` (required) and `[to]` (default `HEAD`) can be passed positionally or via `--from`/`--to`.
- Pass `--merge-base` / `-b` alongside `<from>`/`--from` to resolve it as the merge base of `to` and `from` instead of using it directly — e.g. `--to develop --from main --merge-base` is the tsgit-native equivalent of `--to develop --from $(git merge-base develop main)`, with no local git binary required.
- Repeatable options (`--include`, `--exclude`, `--commit-include`, `--commit-exclude`) accept multiple flags.
- The Markdown summary is printed to stdout; errors go to stderr and exit with code 1.
- Run `smart-diff --help` for the full flag reference, or `smart-diff --version` for the installed version.

### Options reference

#### Core

| Option | CLI flag | Description |
|--------|----------|-------------|
| `from` / `to` | `<from>` `[to]` / `--from` / `--to` | Git refs for the range; `to` defaults to `HEAD`. |
| `mergeBase` | `--merge-base`, `-b` | Resolve `from` as the merge base of `to` and `from`, in-process via tsgit — no local git binary needed. |
| `cwd` / `git` | `--cwd <path>` | Working directory path, or inject your own `GitClient` instance (library only; see [Lower-level API](#lower-level-api)). |
| `includeFolders` | `--include <path>` | Limit diff to these paths relative to repo root (omit for full repo minus excludes). |
| `excludeFolders` | `--exclude <path>` | Excluded paths, applied client-side to the changed-path list (directory-prefix match), e.g. `node_modules`. |
| `commitMessageIncludeRegexes` | `--commit-include <regex>` | If any pattern is non-empty, only commits whose **full message** matches at least one pattern are kept (after excludes). Case-insensitive. |
| `commitMessageExcludeRegexes` | `--commit-exclude <regex>` | Drop commits whose message matches **any** of these patterns. |
| `teamName` | `--team <name>` | Adds a `Team:` line to the user payload for the model. |
| `systemPrompt` | `--system-prompt <text>` | Replaces the default system prompt. |
| `provider` | `--provider <id>` | `LlmProviderId` — wins over `LLM_PROVIDER` env and auto-detection. |
| `model` | `--model <id>` | Chat model id; overrides `LLM_MODEL` and the provider default. |
| `llmModelProvider` | — (library only) | `() => Promise<ChatModel>` — bypass env-based resolution entirely; hand-wire your own `ChatModel` (required in tests or custom setups). |

#### Token reduction — see [Handling large diffs](#handling-large-diffs)

| Option | CLI flag | Description |
|--------|----------|-------------|
| `maxDiffChars` | `--max-diff-chars <n>` | Caps unified diff size for the request; see `LLM_MAX_DIFF_CHARS`. |
| `mapReduce` | `--map-reduce` | Split an oversized diff into per-file batches instead of hard-truncating it. |
| `contextLines` | `--context-lines <n>` | Number of context lines around each change (`git diff -U<n>`). Lower values (1 or 0) are the single biggest token saver on modification-heavy diffs. |
| `ignoreWhitespace` | `--ignore-whitespace` | Passes `-w` / `--ignore-all-space` to `git diff` so pure-whitespace hunks don't consume tokens. Also applies to `--numstat` / `--name-status` so counts stay consistent. |
| `stripDiffPreamble` | `--strip-diff-preamble` | Removes low-value lines from the unified diff (`diff --git`, `index`, mode changes, `similarity/rename/copy` metadata). `--- a/…`, `+++ b/…`, and `@@` hunk headers are kept. |
| `maxHunkLines` | `--max-hunk-lines <n>` | Caps the body of each hunk; anything past the limit is replaced with a single elision marker. The `@@` header and `DiffSummary` totals are preserved. |
| `excludeDefaultNoise` | `--exclude-default-noise` | Merges the built-in `DEFAULT_NOISE_EXCLUDES` list (lockfiles, `dist`, `build`, `out`, `coverage`, `node_modules`, `__snapshots__`) into `excludeFolders`. |

#### Reliability

| Option | CLI flag | Description |
|--------|----------|-------------|
| `maxRetries` | `--max-retries <n>` | Retry count for transient LLM call failures; see `LLM_MAX_RETRIES`. |

#### Security

| Option | CLI flag | Description |
|--------|----------|-------------|
| `redactSecrets` | `--redact-secrets` | Masks likely secrets/credentials in the diff text before it's sent to the LLM — cloud provider keys, VCS/chat tokens, PEM private key blocks, JWTs, `Bearer` headers, basic-auth URL passwords, and generic `KEY=value` assignments. Uses `DEFAULT_SECRET_PATTERNS` unless `secretPatterns` overrides them. |
| `secretPatterns` | — (library only) | Overrides the built-in secret-detection rules used when `redactSecrets` is true. |

#### Other

| Option | CLI flag | Description |
|--------|----------|-------------|
| — (`summarizeGitDiff` always returns `usage`) | `--usage` | Print the same `LlmUsageReport` as [Token usage reporting](#token-usage-reporting) to stderr, after the Markdown summary on stdout. |
| — | `-h`, `--help` | Show CLI help. |
| — | `-v`, `--version` | Print the installed version. |

### Handling large diffs

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

### Token usage reporting

`summarizeGitDiff` returns the Markdown summary plus token usage aggregated across every LLM call made to produce it — one call by default, or every map-reduce batch plus the reduce call when `mapReduce` is used:

```ts
import { summarizeGitDiff } from '@mcarvin/smart-diff';

const { summary, usage } = await summarizeGitDiff({ from: 'origin/main' });
// usage: { requestCount, inputTokens, outputTokens, totalTokens, cachedInputTokens }
```

This reports token counts only — no dollar cost estimate, since per-token pricing varies by provider/model and changes over time; a hardcoded price table would drift out of date. Fields are 0 when a provider doesn't report a given figure. `generateSummaryWithUsage` is the lower-level equivalent of `generateSummary`.

### Injecting your own `ChatModel`

If you want full control — for example, to hit an in-process mock, add your own middleware/logging, or talk to a provider smart-diff doesn't support directly — pass `llmModelProvider`. A `ChatModel` is just an object with a `generate` method:

```ts
import { summarizeGitDiff, type ChatModel } from '@mcarvin/smart-diff';

const myModel: ChatModel = {
  async generate({ system, prompt, temperature, maxOutputTokens }) {
    const res = await fetch('https://my-llm-gateway.example.com/v1/chat', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.MY_GATEWAY_KEY}` },
      body: JSON.stringify({ system, prompt, temperature, maxOutputTokens }),
    });
    const data = await res.json();
    return { text: data.text, usage: { inputTokens: data.inputTokens, outputTokens: data.outputTokens } };
  },
};

const { summary } = await summarizeGitDiff({
  from: 'origin/main',
  llmModelProvider: async () => myModel,
});
```

### Diff shape: single range vs per-commit

- **Single unified diff** for `from..to` when no commit-message filters apply and the filtered commit list matches the full log for that range.
- **Concatenated per-commit patches** (each commit diffed against its first parent, or the empty tree for a root commit) when you use include/exclude regexes or when the filtered commit list differs in length from the full range (so the diff reflects only the commits that remain).

### Lower-level API

The package also exports helpers for building a custom pipeline on top of the same git and LLM behavior:

- **Git**: `createGitClient(cwd?, timeout?)` *(async — returns `Promise<GitClient>`, a live [`@scolladon/tsgit`](https://github.com/scolladon/tsgit) repository handle; call `git.dispose()` when done)*, `getRepoRoot`, `getCommits`, `getDiff`, `getDiffSummary`, `getChangedFiles`, `filterCommitsByMessageRegexes`, `buildPathFilterPredicate`, `matchesAnyPath`, `renderFileDiff`, `renderUnifiedDiff`, `buildFileSummary`, `mergeFileSummariesByPath`, `summarizeFiles`, `shapeUnifiedDiff`, `redactSecrets`, `DEFAULT_NOISE_EXCLUDES`, `DEFAULT_SECRET_PATTERNS` — `timeout` is in milliseconds; omit for no timeout
- **AI**: `generateSummary`, `generateSummaryWithUsage`, `resolveLlmMaxDiffChars`, `resolveLlmMaxRetries`, `truncateUnifiedDiffForLlm`, `splitUnifiedDiffIntoFileChunks`, `groupDiffChunksByBudget`
- **Provider resolution**: `resolveLanguageModel`, `detectLlmProvider`, `isLlmProviderConfigured`, `defaultModelForProvider`, `resolveLlmBaseUrl`, `parseLlmDefaultHeadersFromEnv`
- **Constants**: `DEFAULT_GIT_DIFF_SYSTEM_PROMPT`, `DEFAULT_MAP_REDUCE_MAP_SYSTEM_PROMPT`, `DEFAULT_MAP_REDUCE_REDUCE_SYSTEM_PROMPT`, `LLM_GATEWAY_REQUIRED_MESSAGE`
- **Types**: `LlmProviderId`, `LlmModelProvider`, `ChatModel`, `ChatCallOptions`, `ChatResult`, `ChatUsage`, `ResolveLanguageModelOptions`, `GenerateSummaryInput`, `SummarizeFlags`, `LlmUsageReport`, `DiffFileSummary`, `DiffSummary`, `CommitInfo`, `GitClient`, `GitDiffRangeQuery`, `DiffPathFilter`, `DiffShapingOptions`, `PathFilterPredicate`, `RenderedFileDiff`, `SecretRedactionRule`
  - `DiffFileSummary.binary?: boolean` is `true` when either blob sniffs as binary; absent for text files

## Used By

This package is used downstream by:

- [sf-git-ai-meta-insights](https://github.com/mcarvin8/sf-git-ai-meta-insights) — Salesforce metadata wrapper compatible with Salesforce DX projects
- [gitlab-llm-kit](https://github.com/mcarvin8/gitlab-llm-kit) — TypeScript toolkit for GitLab REST API access and LLM-powered insights (merge requests, issues, pipelines, security, releases, wiki, and more)

## License

[MIT](LICENSE.md)
