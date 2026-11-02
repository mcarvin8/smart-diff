# Add entity-level context to a diff summary

This optional example attaches [Sem](https://github.com/Ataraxy-Labs/sem)'s
structural diff to smart-diff's existing model request. It keeps the original
text diff and configured provider. It does not replace the library's Git engine
or claim that additional context always improves a summary.

Install Sem on PATH. From this repository, install dependencies and build:

```bash
npm ci
npm run build
node examples/sem/summarize.mjs /absolute/path/to/repo HEAD~1 HEAD
```

Configure your normal smart-diff model provider first. The example invokes Sem
without a shell, uses the same explicit range for both tools, rejects malformed
JSON, and stops on tool errors, timeout, or oversized output. It does not upload
to Sem cloud. The structural diff is sent to your configured model alongside
the regular diff, so this can increase model input tokens.

For a merge-base comparison, resolve the base commit first and pass that SHA as
`from`. Review the generated summary against the code changes.
