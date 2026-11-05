# smart-diff options reference

Usage: `smart-diff <from> [to] [options]`. `to` defaults to `HEAD`. The
summary is printed to stdout; errors go to stderr with exit code 1.

## CLI flags

### Core

| Flag                       | Description                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `<from>` / `--from`        | Start ref (required).                                                                                      |
| `[to]` / `--to`            | End ref (default `HEAD`).                                                                                  |
| `-b`, `--merge-base`       | Use the merge base of `to` and `from` as the start, like `git merge-base`. Use for "changes on my branch". |
| `--cwd <path>`             | Repository working directory (default: current directory).                                                 |
| `--include <path>`         | Only include this path, relative to the repo root (repeatable).                                            |
| `--exclude <path>`         | Exclude this path, directory-prefix match (repeatable).                                                    |
| `--commit-include <regex>` | Only keep commits whose full message matches (repeatable, OR, case-insensitive).                           |
| `--commit-exclude <regex>` | Drop commits whose message matches any pattern (repeatable).                                               |
| `--team <name>`            | Adds a team label to the prompt.                                                                           |
| `--system-prompt <text>`   | Replaces the default system prompt.                                                                        |
| `--provider <id>`          | Provider id; overrides `LLM_PROVIDER` and auto-detection.                                                  |
| `--model <id>`             | Model id; overrides `LLM_MODEL` and the provider default.                                                  |

### Token reduction

| Flag                      | Description                                                                    |
| ------------------------- | ------------------------------------------------------------------------------ |
| `--max-diff-chars <n>`    | Cap on diff characters sent to the model (default about 120k).                 |
| `--map-reduce`            | Summarize an oversized diff in per-file batches instead of truncating it.      |
| `--context-lines <n>`     | Context lines per hunk (`git diff -U<n>`). 0 or 1 saves the most tokens.       |
| `--ignore-whitespace`     | Drop whitespace-only changes.                                                  |
| `--strip-diff-preamble`   | Remove `diff --git`, `index`, and mode lines.                                  |
| `--max-hunk-lines <n>`    | Elide hunk bodies longer than this many lines.                                 |
| `--exclude-default-noise` | Skip lockfiles, `dist`, `build`, `out`, `coverage`, `node_modules`, snapshots. |

### Reliability, security, other

| Flag                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `--max-retries <n>` | Retries for rate limits, 5xx, and network errors (default 2). |
| `--redact-secrets`  | Mask likely secrets in the diff before sending it.            |
| `--usage`           | Print token usage to stderr after the summary.                |
| `-h`, `--help`      | Show help.                                                    |
| `-v`, `--version`   | Print the version.                                            |

## Providers

Set `LLM_PROVIDER` to choose one explicitly. Otherwise the first match wins:
`LLM_BASE_URL`/`OPENAI_BASE_URL`, then `OPENAI_API_KEY`/`LLM_API_KEY`, then
`ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (or `GOOGLE_API_KEY`),
`MISTRAL_API_KEY`, `COHERE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`,
`DEEPSEEK_API_KEY`, `AWS_ACCESS_KEY_ID`/`AWS_PROFILE`, and finally
`OPENAI_DEFAULT_HEADERS`/`LLM_DEFAULT_HEADERS`.

| Provider id         | Credential env vars                                                                                             | Default model                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `openai`            | `OPENAI_API_KEY` or `LLM_API_KEY`                                                                               | `gpt-4o-mini`                              |
| `openai-compatible` | `LLM_BASE_URL` or `OPENAI_BASE_URL` (required), plus an API key or custom headers                               | `gpt-4o-mini`                              |
| `anthropic`         | `ANTHROPIC_API_KEY`                                                                                             | `claude-haiku-4-5-20251001`                |
| `google`            | `GOOGLE_GENERATIVE_AI_API_KEY` or `GOOGLE_API_KEY`                                                              | `gemini-2.0-flash`                         |
| `bedrock`           | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, or `AWS_PROFILE`; region from `AWS_REGION` (default `us-east-1`) | `anthropic.claude-3-5-haiku-20241022-v1:0` |
| `mistral`           | `MISTRAL_API_KEY`                                                                                               | `mistral-small-latest`                     |
| `cohere`            | `COHERE_API_KEY`                                                                                                | `command-r-08-2024`                        |
| `groq`              | `GROQ_API_KEY`                                                                                                  | `llama-3.1-8b-instant`                     |
| `xai`               | `XAI_API_KEY`                                                                                                   | `grok-2-latest`                            |
| `deepseek`          | `DEEPSEEK_API_KEY`                                                                                              | `deepseek-chat`                            |

Bedrock supports static credentials only (no SSO, instance role, or container
credentials).

## Other environment variables

| Variable                                         | Purpose                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `LLM_MODEL`                                      | Overrides the provider's default model.                      |
| `LLM_DEFAULT_HEADERS` / `OPENAI_DEFAULT_HEADERS` | JSON object of extra headers for OpenAI-compatible requests. |
| `LLM_MAX_DIFF_CHARS`                             | Default for `--max-diff-chars`.                              |
| `LLM_MAX_TOKENS`                                 | Max completion tokens (default 4000).                        |
| `LLM_TEMPERATURE`                                | Sampling temperature, 0 to 2 (default 0.2).                  |
| `LLM_MAX_RETRIES`                                | Default for `--max-retries`.                                 |

`LLM_*` variables win over their `OPENAI_*` equivalents.
