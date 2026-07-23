# 📦 repo-context

**Turn your entire repository into one clean Markdown file your AI coding agent can actually read.**

Stop copy-pasting files into ChatGPT one at a time. `repo-context` scans your repo, respects your `.gitignore`, and writes a single `context.md` with an overview, a directory tree, and the full contents of every relevant file — ready to paste into Claude, ChatGPT, Cursor, Copilot, or any LLM that needs to understand your project fast.

[![npm version](https://img.shields.io/npm/v/%40krizic%2Frepo-context.svg)](https://www.npmjs.com/package/@krizic/repo-context)
[![CI](https://github.com/krizic/repo-context/actions/workflows/ci.yml/badge.svg)](https://github.com/krizic/repo-context/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## ✨ Why you'll like it

- **Zero config, sensible defaults** — just run it, it figures out what matters.
- **Git-aware** — uses `git ls-files` under the hood so anything in `.gitignore` is automatically skipped.
- **Monorepo friendly** — picks up every `package.json` in the tree for a quick multi-package overview.
- **Binary-safe** — skips images, fonts, archives, and lockfiles instead of dumping garbage into your context window.
- **Budget aware** — caps individual file size and total embedded size so you don't blow your model's context window.
- **Fast** — plain Node.js, no heavy dependencies, runs in milliseconds on most repos.

## 🚀 Quick start

Run it once, no install required:

```bash
npx @krizic/repo-context
```

That's it — you now have a `context.md` in your project root. Drop it into your favorite AI chat and start asking questions about your codebase.

## 📥 Install

```bash
npm install --save-dev @krizic/repo-context
# or
pnpm add -D @krizic/repo-context
# or
yarn add -D @krizic/repo-context
```

## 🛠️ Add it to your project's scripts

The nicest way to use `repo-context` is to wire it into `package.json` so your whole team (and every agent) can run it the same way:

```jsonc
{
  "scripts": {
    "context": "repo-context",

    // override the defaults to fit your project
    "context:full": "repo-context --out docs/context.md --max-bytes 200000 --max-total-bytes 20000000",

    // just want the shape of the repo, no file contents?
    "context:tree": "repo-context --tree-only --out docs/tree.md"
  }
}
```

Then simply run:

```bash
npm run context
```

## ⚙️ CLI options

| Flag | Default | Description |
|---|---|---|
| `--out <path>` | `context.md` | Where to write the generated file (relative to `--root`). |
| `--root <path>` | current directory | Repository root to scan. |
| `--max-bytes <n>` | `100000` | Max size (bytes) of a single file's content to embed. Larger files are listed but skipped. |
| `--max-total-bytes <n>` | `5000000` | Total size (bytes) budget for all embedded file contents combined. |
| `--tree-only` | `false` | Only emit the overview + directory tree, skip embedding file contents entirely. |

`README.md`, `AGENTS.md`, `AGENT.md`, `CONTRIBUTING.md`, and `ARCHITECTURE.md` are always embedded in full, regardless of size limits, since they're usually the most useful context for an agent.

## 🧑‍💻 Use it as a library

Prefer to script it yourself? `repo-context` exports its core function too:

```ts
import { generateContext } from '@krizic/repo-context'

const result = await generateContext({
  root: process.cwd(),
  out: 'CONTEXT.md',
  maxFileBytes: 50_000
})

console.log(result.stats)
```

## 📄 What you get

```markdown
# Repository Context: my-app

_Generated: 2026-07-24T10:00:00.000Z_

## Overview
- **my-app** (package.json) — v1.0.0
  - scripts: build, dev, test

## Directory Structure
├── src/
│   ├── index.ts
│   └── utils.ts
└── package.json

## File Contents
### src/index.ts
​```ts
...
​```

## Stats
- Files listed: 42
- Files embedded: 38 (210.4 KB)
- Skipped (binary): 3
- Skipped (over --max-bytes): 1
```

## 🤝 Contributing

Issues and PRs are very welcome! This is a small, focused tool — the best contributions keep it that way.

```bash
git clone https://github.com/krizic/repo-context.git
cd repo-context
npm install
npm run build
npm test
```

## 📜 License

MIT © Vedran Krizic
