# smart-diff for Claude Code

Summarize a git branch, PR, or release range as Markdown.

## Skills

| Skill                   | Who writes the summary                                            | Needs an API key |
| ----------------------- | ----------------------------------------------------------------- | ---------------- |
| `smart-diff-agent`      | Your coding agent, from the prompts smart-diff prepares           | No               |
| `smart-diff-provider`   | Your own LLM provider, through the `smart-diff` CLI               | Yes              |
| `smart-diff-salesforce` | Your coding agent by default, or your own LLM provider if you ask | No (optional)    |

`smart-diff-salesforce` is for Salesforce DX projects (repositories with an
`sfdx-project.json`). It limits the diff to the package directories, plus any
`manifest/` folder with `package.xml` or `destructiveChanges*.xml`, and frames
the summary as a Salesforce release: changes by metadata type, destructive
changes, security and access, deployment risks, and testing focus.

All three run the [`@mcarvin/smart-diff`](https://www.npmjs.com/package/@mcarvin/smart-diff)
CLI with `npx`. It reads the repository locally (no `git` binary needed),
resolves the merge base, applies path and commit filters, skips lockfiles and
build output, masks likely secrets, and splits large diffs into batches.

With `smart-diff-agent`, the CLI stops before any model call and writes its
prompts to a temporary folder. Your coding agent follows them to write the summary,
handing large diffs to subagents batch by batch, then deletes the folder.

## Install

```text
/plugin marketplace add mcarvin8/smart-diff
/plugin install smart-diff@smart-diff
```

### Other coding agents

The skills are standard Agent Skills, so other agents can use them too:

```sh
# GitHub Copilot CLI (reads the same marketplace files)
copilot plugin marketplace add mcarvin8/smart-diff
copilot plugin install smart-diff@smart-diff

# Any agent, with the skills CLI
npx skills add mcarvin8/smart-diff

# Any agent, with the GitHub CLI
gh skill install mcarvin8/smart-diff --agent github-copilot
```

With `smart-diff-agent`, whichever agent runs the skill writes the summary.

## Requirements

- Node.js 22.22.1 or newer
- A git repository
- For the `smart-diff-provider` skill only: a provider credential in an environment
  variable, such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

## Data handling

All three skills read the current git repository: changed file paths, diffs, and
commit hashes and messages. Commit author names and emails are never read. With
secret redaction on (every skill always turns it on), likely credentials in the
diff are masked first.

| Skill                   | Where the diff goes                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smart-diff-agent`      | Nowhere outside your coding agent. The CLI writes the prompts to a temporary folder on your machine, your agent reads them, and the skill deletes the folder afterwards.                                                     |
| `smart-diff-provider`   | Sent to the LLM provider you configure through environment variables: OpenAI, Anthropic, Google Gemini, Amazon Bedrock, Mistral, Cohere, Groq, xAI, DeepSeek, or an OpenAI-compatible gateway you set.                       |
| `smart-diff-salesforce` | Same as `smart-diff-agent` by default, or `smart-diff-provider` if you ask for provider mode. It also reads `sfdx-project.json` with a small bundled Node script (`scripts/package-dirs.mjs`), which only reads local files. |

smart-diff runs no service of its own and keeps nothing. For the `smart-diff-provider`
skill (and `smart-diff-salesforce` in provider mode), your provider's own terms
decide how long it keeps requests. All three skills
download the `@mcarvin/smart-diff` package from the npm registry through `npx`.

## Try it

- "Summarize my branch against main"
- "What changed since v1.2.0?"
- "Draft release notes from the last tag"
- "Summarize this Salesforce release since the last tag" (in a Salesforce DX project)

## More

Full CLI and library documentation:
<https://github.com/mcarvin8/smart-diff#readme>
