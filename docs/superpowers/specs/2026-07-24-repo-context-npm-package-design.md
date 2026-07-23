# Design: `@krizic/repo-context` npm package

_Date: 2026-07-24_

## Purpose

Publish the existing `generate-context.ts` script (which produces a single
`context.md` snapshot of a repository for feeding to LLM coding agents) as a
public npm package so other projects can install and run it without copying
the script around.

## Goals

- Installable via `npm i -D @krizic/repo-context` / runnable via `npx repo-context`.
- Works with plain Node.js (>=18) — no Bun runtime requirement for consumers.
- Usable as a library (`import { generateContext } from '@krizic/repo-context'`)
  for projects that want to override defaults from their own scripts.
- Ships a positive, welcoming README for the public GitHub repo.
- CI on every push/PR; automatic publish to npm on push to `master`, skipping
  publish when the version wasn't bumped.

## Non-goals

- No config-file system (`.repo-contextrc` etc.) — CLI flags only, matching
  the original script's surface area. YAGNI.
- No changesets/semantic-release automation — version bumps are manual edits
  to `package.json`, publish workflow just detects and publishes new versions.

## Package layout

```
repo-context/
├── src/
│   ├── generate-context.ts   # core logic, ported from Bun to Node APIs
│   └── cli.ts                # shebang entry: parses argv, calls generateContext
├── dist/                     # build output (published), gitignored
├── test/
│   └── generate-context.test.ts  # smoke test via node:test
├── .github/workflows/
│   ├── ci.yml
│   └── publish.yml
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── LICENSE                   # MIT
├── README.md
└── .gitignore
```

## Porting Bun → Node

| Bun API | Node replacement |
|---|---|
| `Bun.spawn(['git', 'ls-files', ...])` | `node:child_process` `execFile('git', [...])` (promisified) |
| `Bun.file(path).text()` / `.size` | `fs.promises.readFile(path, 'utf8')` / `fs.statSync(path).size` |
| `Bun.file(path).slice(0, 8000).arrayBuffer()` | `fs.promises.open(path, 'r')` + `fh.read(buffer, 0, 8000, 0)` |
| `Bun.write(path, content)` | `fs.promises.writeFile(path, content)` |
| `import.meta.main` | `import.meta.url === url.pathToFileURL(process.argv[1]).href` |
| `performance.now()` | unchanged — available as a Node global |

Behavior (exclusion lists, tree rendering, stats output, CLI flags) stays
identical to the original script.

## Build & publish

- `tsup` bundles `src/cli.ts` → `dist/cli.js` (ESM, shebang preserved,
  executable bit set) and `src/generate-context.ts` → `dist/index.js` (library
  entry with `.d.ts`).
- `package.json`:
  - `"name": "@krizic/repo-context"`, `"license": "MIT"`
  - `"bin": { "repo-context": "./dist/cli.js" }`
  - `"main"/"module"/"types"` → `dist/index.js` / `dist/index.d.ts`
  - `"files": ["dist"]` to keep the published tarball minimal
  - `"engines": { "node": ">=18" }`
  - `"publishConfig": { "access": "public" }` (required for scoped public packages)
- `.github/workflows/ci.yml`: on push/PR to any branch — install, build, test.
- `.github/workflows/publish.yml`: on push to `master` — install, build, test,
  then `JS-DevTools/npm-publish@v3` (auto-skips if the `package.json` version
  matches what's already on npm; publishes with `--provenance` otherwise).
  Requires an `NPM_TOKEN` repo secret (automation token) — setup steps go in
  the README/PR description for the user to follow manually.

## Testing

One smoke test using Node's built-in test runner (`node --test`): run
`generateContext` against a small temp fixture directory and assert the
resulting `context.md` contains expected sections (Overview, Directory
Structure, File Contents, Stats). No extra test framework dependency.

## Consumer usage pattern (documented in README)

```jsonc
// consumer's package.json
{
  "scripts": {
    "context": "repo-context --out CONTEXT.md --max-bytes 50000"
  }
}
```

or programmatically:

```ts
import { generateContext } from '@krizic/repo-context'
await generateContext({ out: 'CONTEXT.md', maxFileBytes: 50_000 })
```
