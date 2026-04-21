# smart-diff

[![NPM](https://img.shields.io/npm/v/@mcarvin/smart-diff.svg?label=smart-diff)](https://www.npmjs.com/package/@mcarvin/smart-diff)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/smart-diff/main/LICENSE.md)
[![Downloads/week](https://img.shields.io/npm/dw/@mcarvin/smart-diff.svg)](https://npmjs.org/package/@mcarvin/smart-diff)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/smart-diff/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/smart-diff)
[![codecov](https://codecov.io/gh/mcarvin8/smart-diff/graph/badge.svg?token=H3ZWAGG7S9)](https://codecov.io/gh/mcarvin8/smart-diff)

TypeScript library that turns a **git revision range** into a **Markdown summary** using any LLM provider supported by the [Vercel AI SDK](https://sdk.vercel.ai) — OpenAI, Anthropic, Google Gemini, Amazon Bedrock, Mistral, Cohere, Groq, xAI, DeepSeek, or any OpenAI-compatible gateway. It uses [`simple-git`](https://github.com/steveukx/git-js) to read the repo, respects **path includes/excludes** and **commit message include/exclude regexes**, and sends commits, paths, structured diff stats, and unified diff text to the model.

## Requirements

- **Node.js** 20+
- An LLM provider credential (see [Provider configuration](#provider-configuration))
- [Git](https://git-scm.com/) on the `PATH`

## Installation

```bash
npm install @mcarvin/smart-diff
```

`@ai-sdk/openai` and `@ai-sdk/openai-compatible` ship as direct dependencies. Every other provider (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/mistral`, `@ai-sdk/cohere`, `@ai-sdk/groq`, `@ai-sdk/xai`, `@ai-sdk/deepseek`) is declared as an **optional peer** and only needs to be installed when you actually use that provider. If the package is missing, smart-diff throws a clear error telling you which one to install.

## Provider configuration

smart-diff is "configured" when [`isLlmProviderConfigured()`](#lower-level-api) returns true — i.e. at least one supported provider can be resolved from env vars — **or** you pass your own `llmModelProvider` factory. Otherwise `summarizeGitDiff` / `generateSummary` throw with `LLM_GATEWAY_REQUIRED_MESSAGE`.

### Selecting a provider

`LLM_PROVIDER` explicitly selects a provider. When unset, the resolver auto-detects in this order: `LLM_BASE_URL`/`OPENAI_BASE_URL` → `openai-compatible`, `OPENAI_API_KEY`/`LLM_API_KEY` → `openai`, then `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (or `GOOGLE_API_KEY`), `MISTRAL_API_KEY`, `COHERE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, and finally `OPENAI_DEFAULT_HEADERS`/`LLM_DEFAULT_HEADERS` → `openai`.

| Provider (`LLM_PROVIDER`) | Package | Credential env vars | Default model |
|---|---|---|---|
| `openai` | `@ai-sdk/openai` | `OPENAI_API_KEY` or `LLM_API_KEY` | `gpt-4o-mini` |
| `openai-compatible` | `@ai-sdk/openai-compatible` | `LLM_BASE_URL` or `OPENAI_BASE_URL` (required); `OPENAI_API_KEY`/`LLM_API_KEY` or custom headers | `gpt-4o-mini` |
| `anthropic` | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` | `claude-3-5-haiku-latest` |
| `google` | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| `bedrock` | `@ai-sdk/amazon-bedrock` | Standard AWS credential chain (env / profile / role) | `anthropic.claude-3-5-haiku-20241022-v1:0` |
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
| `cwd` / `git` | Working tree for `simple-git`, or inject your own `SimpleGit` instance. |
| `includeFolders` | Limit diff to these paths relative to repo root (omit for full repo minus excludes). |
| `excludeFolders` | Excluded paths (git `:(exclude)` pathspecs), e.g. `node_modules`. |
| `commitMessageIncludeRegexes` | If any pattern is non-empty, only commits whose **full message** matches at least one pattern are kept (after excludes). Case-insensitive. |
| `commitMessageExcludeRegexes` | Drop commits whose message matches **any** of these patterns. |
| `teamName` | Adds a `Team:` line to the user payload for the model. |
| `systemPrompt` | Replaces the default system prompt. |
| `provider` | `LlmProviderId` — wins over `LLM_PROVIDER` env and auto-detection. |
| `model` | Chat model id; overrides `LLM_MODEL` and the provider default. |
| `maxDiffChars` | Caps unified diff size for the request. |
| `llmModelProvider` | `() => Promise<LanguageModel>` — bypass env-based resolution entirely; hand-wire a Vercel AI SDK `LanguageModel` (required in tests or custom setups). |

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

- **Git**: `createGitClient`, `getRepoRoot`, `getCommits`, `getDiff`, `getDiffSummary`, `getChangedFiles`, `filterCommitsByMessageRegexes`, `buildDiffPathspecs`
- **AI**: `generateSummary`, `resolveLlmMaxDiffChars`, `truncateUnifiedDiffForLlm`
- **Provider resolution**: `resolveLanguageModel`, `detectLlmProvider`, `isLlmProviderConfigured`, `defaultModelForProvider`, `resolveLlmBaseUrl`, `parseLlmDefaultHeadersFromEnv`
- **Constants / types**: `DEFAULT_GIT_DIFF_SYSTEM_PROMPT`, `LLM_GATEWAY_REQUIRED_MESSAGE`, `LlmProviderId`, `LlmModelProvider`, `ResolveLanguageModelOptions`, `GenerateSummaryInput`, `SummarizeFlags`

## Migrating from 1.x → 2.x

v2 replaces the direct `openai` SDK dependency with the Vercel AI SDK. If you only rely on env-var configuration, your setup keeps working — `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_DEFAULT_HEADERS`, `LLM_*` equivalents, `OPENAI_MAX_DIFF_CHARS`, and `OPENAI_MAX_TOKENS` are all still honored.

Breaking changes:

- **Removed `openAiClientProvider` option** on `summarizeGitDiff`/`generateSummary`. Use `llmModelProvider: () => Promise<LanguageModel>` returning a Vercel AI SDK model instead.
- **Removed `OpenAiLikeClient` and `createOpenAiLikeClient` exports**, along with `shouldUseLlmGateway`. Use `isLlmProviderConfigured()` / `resolveLanguageModel()` instead.
- **`openai` npm package is no longer a dependency.** Remove it from your own `package.json` if you only depended on it transitively via smart-diff.

## Used By

This package is used by:

- [sf-git-ai-meta-insights](https://github.com/mcarvin8/sf-git-ai-meta-insights) — Salesforce metadata wrapper compatible with Salesforce DX projects

## License

MIT — see [LICENSE.md](LICENSE.md).
