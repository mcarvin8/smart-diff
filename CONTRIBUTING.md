# Contributing

## Setup

1. Fork the repo on GitHub
2. Clone your fork:

```bash
git clone https://github.com/<your-username>/smart-diff.git
cd smart-diff
npm install
```

Husky hooks install automatically via `prepare`.

> All changes must be made on a fork. Do not push directly to the main repo.

## Development

- **Build:** `npm run build`
- **Test:** `npm test`
- **Lint:** `npm run lint`
- **Format:** `npm run format`

## Hooks

| Hook | Runs |
|------|------|
| `pre-commit` | Biome check (staged files) |
| `pre-push` | Build + full test suite |
| `commit-msg` | commitlint |

## Commit Messages

Follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for new provider
fix: handle empty diff output
docs: update README examples
chore: bump dependency versions
```

## Pull Requests

1. Fork and branch from `main`
2. Keep changes focused — one feature or fix per PR
3. Ensure all hooks pass before pushing
4. Open PR against `main`

## Issues

Report bugs and request features by creating an [issue](https://github.com/mcarvin8/smart-diff/issues).
