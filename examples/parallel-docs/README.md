# Summarize a dependency migration with documentation context

Use a dependency's public migration guide or release notes to help explain a git
diff. This example fetches excerpts from a URL you choose with
[Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp), then
passes them to smart-diff through a `ChatModel` wrapper. The summary uses your
existing LLM provider and includes the documentation source URL.

Parallel's anonymous HTTP endpoint needs no account or API key for light use.
You still need to configure an LLM provider as described in the root
[README](../../README.md#provider-configuration).

## Run from a clone

Requires Node.js 22.22.1 or newer. From the smart-diff checkout:

```bash
npm ci
npm run build
cd examples/parallel-docs
npm ci
```

Configure your provider in the environment, then select the repository, commit
range and documentation URL. For example, for a repository upgrading to Node 22:

```bash
npm start -- --cwd /path/to/your/repository \
  --from origin/main --to HEAD \
  --url https://nodejs.org/en/blog/release/v22.0.0
```

`--from` and `--url` are required. `--to` defaults to `HEAD`; `--cwd` defaults to
the current directory. Use a version-specific official guide appropriate to the
change you are reviewing. The example uses the local smart-diff build via a
`file:../..` dependency; it adds no dependencies to the library or CLI.

Only the selected URL goes to Parallel. Your diff and the retrieved excerpts go
to the LLM provider you already configured. Use public documentation URLs without
credentials or private query parameters. Retrieved text is treated as untrusted
reference material, and the model is asked to cite documentation-based claims
and distinguish advice from changes in the patch. Review the output against the
patch and source; this is a summary aid, not an automated compatibility check.

The documentation request has a 30-second deadline. Retrieval errors, rate limits
and empty excerpts stop the example rather than silently producing a summary
without context. Excerpts are capped at 12,000 characters with a truncation notice;
they do not cover the entire document. The existing diff size limit and LLM retry
settings still apply. The example does not enable map-reduce.

Run the example's deterministic transport and summary checks with `npm test`
from this directory, after the setup above.
