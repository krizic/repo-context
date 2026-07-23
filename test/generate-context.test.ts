import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { generateContext } from '../src/generate-context.ts'

const makeFixture = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repo-context-test-'))
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify(
      { name: 'fixture-repo', version: '1.2.3', description: 'A test fixture', scripts: { build: 'echo build' } },
      null,
      2
    )
  )
  await writeFile(join(dir, 'README.md'), '# Fixture\n\nHello world.')
  await mkdir(join(dir, 'src'))
  await writeFile(join(dir, 'src', 'index.ts'), 'export const hello = () => "hi"\n')
  await mkdir(join(dir, 'node_modules'))
  await writeFile(join(dir, 'node_modules', 'ignored.js'), 'module.exports = {}')
  return dir
}

test('generateContext writes a context file with expected sections', async () => {
  const dir = await makeFixture()
  try {
    const result = await generateContext({ root: dir, out: 'context.md' })
    const content = await readFile(result.outPath, 'utf8')

    assert.match(content, /# Repository Context: fixture-repo/)
    assert.match(content, /## Overview/)
    assert.match(content, /## Directory Structure/)
    assert.match(content, /## File Contents/)
    assert.match(content, /### src\/index\.ts/)
    assert.match(content, /## Stats/)
    assert.doesNotMatch(content, /node_modules/)
    assert.ok(result.stats.filesEmbedded > 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('generateContext --tree-only skips file contents', async () => {
  const dir = await makeFixture()
  try {
    const result = await generateContext({ root: dir, out: 'context.md', treeOnly: true })
    const content = await readFile(result.outPath, 'utf8')

    assert.match(content, /## Directory Structure/)
    assert.doesNotMatch(content, /## File Contents/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
