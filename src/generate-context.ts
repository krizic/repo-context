/**
 * Generates a single context.md file summarizing the repository for LLM consumption.
 *
 * It produces:
 *  - A high-level overview (root + workspace package manifests)
 *  - A directory tree of all relevant files
 *  - The full text content of those files (skipping binaries/images/build output)
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { open, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type Options = {
  root: string
  out: string
  maxFileBytes: number
  maxTotalBytes: number
  treeOnly: boolean
}

type TreeNode = Map<string, TreeNode | null>

// Directories skipped even if not covered by .gitignore (defense in depth)
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  'build',
  'out',
  'bin',
  'public',
  'coverage',
  '.git',
  '.husky',
  '.vscode',
  '.idea',
  '.turbo',
  '.cache',
  '.next',
  '.nuxt',
  'playwright-report',
  'test-results',
  'blob-report'
])

// Low-signal / generated files: shown in the tree but never embedded
const EXCLUDED_FILE_NAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  '.DS_Store'
])

// Extensions we never attempt to read as text
const BINARY_EXTENSIONS = new Set([
  // images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif',
  // fonts
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  // archives
  'zip', 'tar', 'gz', 'tgz', 'rar', '7z',
  // media
  'mp4', 'mp3', 'wav', 'mov', 'avi', 'webm', 'ogg',
  // documents / binaries
  'pdf', 'docx', 'xlsx', 'pptx', 'exe', 'dll', 'so', 'dylib', 'wasm', 'node',
  // misc
  'db', 'sqlite', 'lock'
])

// Files whose content is always embedded in full (key LLM-facing docs)
const PRIORITY_FILE_NAMES = new Set([
  'readme.md',
  'agents.md',
  'agent.md',
  'contributing.md',
  'architecture.md'
])

const DEFAULT_OPTIONS: Options = {
  root: process.cwd(),
  out: 'context.md',
  maxFileBytes: 100_000,
  maxTotalBytes: 5_000_000,
  treeOnly: false
}

export const parseArgs = (argv: string[]): Options => {
  const options: Options = { ...DEFAULT_OPTIONS, root: process.cwd() }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--out':
        options.out = argv[++i] ?? options.out
        break
      case '--root':
        options.root = argv[++i] ?? options.root
        break
      case '--max-bytes':
        options.maxFileBytes = Number(argv[++i]) || options.maxFileBytes
        break
      case '--max-total-bytes':
        options.maxTotalBytes = Number(argv[++i]) || options.maxTotalBytes
        break
      case '--tree-only':
        options.treeOnly = true
        break
      default:
        break
    }
  }

  return options
}

/**
 * Lists candidate files using `git ls-files` (tracked + untracked-but-not-ignored),
 * which transparently respects .gitignore across the whole repo. Falls back to a
 * manual recursive walk when git is unavailable (e.g. not a git checkout).
 */
const listCandidateFiles = async (root: string): Promise<string[]> => {
  if (existsSync(join(root, '.git'))) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard'],
        { cwd: root, maxBuffer: 1024 * 1024 * 64 }
      )
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch {
      // fall through to manual walk
    }
  }

  return walkDirectory(root, root)
}

const walkDirectory = async (dir: string, root: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) {
        continue
      }
      files.push(...(await walkDirectory(join(dir, entry.name), root)))
    } else if (entry.isFile()) {
      files.push(relative(root, join(dir, entry.name)))
    }
  }

  return files
}

const isExcludedPath = (relPath: string): boolean => {
  const segments = relPath.split(sep)
  const fileName = segments[segments.length - 1] ?? ''

  if (segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment))) {
    return true
  }

  if (EXCLUDED_FILE_NAMES.has(fileName)) {
    return true
  }

  return false
}

const getExtension = (fileName: string): string => {
  const idx = fileName.lastIndexOf('.')
  return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase()
}

/**
 * Heuristic binary sniff for files whose extension isn't recognized:
 * reads a small chunk and checks for a NUL byte (same heuristic git uses).
 */
const looksBinary = async (path: string): Promise<boolean> => {
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(8000)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).includes(0)
  } catch {
    return true
  } finally {
    await handle?.close()
  }
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const buildTree = (paths: string[]): string => {
  const root: TreeNode = new Map()

  for (const path of paths) {
    const parts = path.split(sep)
    let node = root
    parts.forEach((part, idx) => {
      const isFile = idx === parts.length - 1
      if (isFile) {
        node.set(part, null)
        return
      }
      let child = node.get(part)
      if (!child) {
        child = new Map()
        node.set(part, child)
      }
      node = child
    })
  }

  const render = (node: TreeNode, prefix: string): string[] => {
    const entries = [...node.entries()].sort(([aName, aVal], [bName, bVal]) => {
      const aIsDir = aVal !== null
      const bIsDir = bVal !== null
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
      return aName.localeCompare(bName)
    })

    const lines: string[] = []
    entries.forEach(([name, child], idx) => {
      const isLast = idx === entries.length - 1
      const connector = isLast ? '└── ' : '├── '
      const isDir = child !== null
      lines.push(`${prefix}${connector}${name}${isDir ? '/' : ''}`)
      if (isDir && child) {
        lines.push(...render(child, prefix + (isLast ? '    ' : '│   ')))
      }
    })
    return lines
  }

  return render(root, '').join('\n')
}

type PackageInfo = {
  path: string
  name?: string
  version?: string
  description?: string
  scripts?: Record<string, string>
}

const collectPackageInfo = async (
  root: string,
  paths: string[]
): Promise<PackageInfo[]> => {
  const manifestPaths = paths.filter(
    (p) => p === 'package.json' || p.endsWith(`${sep}package.json`)
  )

  const infos: PackageInfo[] = []
  for (const manifestPath of manifestPaths) {
    try {
      const json = JSON.parse(await readFile(join(root, manifestPath), 'utf8'))
      infos.push({
        path: manifestPath,
        name: json.name,
        version: json.version,
        description: json.description,
        scripts: json.scripts
      })
    } catch {
      // ignore unparsable manifests
    }
  }

  return infos.sort((a, b) => a.path.localeCompare(b.path))
}

const langFromExtension = (ext: string): string => {
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    mmd: 'mermaid',
    yml: 'yaml',
    yaml: 'yaml',
    css: 'css',
    html: 'html',
    sh: 'bash',
    toml: 'toml'
  }
  return map[ext] ?? ''
}

export const generateContext = async (rawOptions: Partial<Options> = {}) => {
  const options: Options = { ...DEFAULT_OPTIONS, ...rawOptions }
  const startedAt = performance.now()

  const allPaths = (await listCandidateFiles(options.root))
    .filter((p) => !isExcludedPath(p))
    .sort((a, b) => a.localeCompare(b))

  const packages = await collectPackageInfo(options.root, allPaths)

  const lines: string[] = []
  lines.push(`# Repository Context: ${packages[0]?.name ?? 'repository'}`)
  lines.push('')
  lines.push(`_Generated: ${new Date().toISOString()}_`)
  lines.push('')

  lines.push('## Overview')
  lines.push('')
  for (const pkg of packages) {
    lines.push(`- **${pkg.name ?? pkg.path}** (${pkg.path})${pkg.version ? ` — v${pkg.version}` : ''}`)
    if (pkg.description) lines.push(`  - ${pkg.description}`)
    if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
      lines.push(`  - scripts: ${Object.keys(pkg.scripts).join(', ')}`)
    }
  }
  lines.push('')

  lines.push('## Directory Structure')
  lines.push('')
  lines.push('```')
  lines.push(buildTree(allPaths))
  lines.push('```')
  lines.push('')

  let embeddedBytes = 0
  let filesEmbedded = 0
  let filesSkippedBinary = 0
  let filesSkippedSize = 0
  let filesSkippedBudget = 0

  if (!options.treeOnly) {
    lines.push('## File Contents')
    lines.push('')

    for (const relPath of allPaths) {
      const fileName = relPath.split(sep).pop() ?? relPath
      const ext = getExtension(fileName)
      const isPriority = PRIORITY_FILE_NAMES.has(fileName.toLowerCase())

      if (BINARY_EXTENSIONS.has(ext)) {
        filesSkippedBinary++
        continue
      }

      const filePath = join(options.root, relPath)
      const { size } = await stat(filePath)

      if (!isPriority && size > options.maxFileBytes) {
        filesSkippedSize++
        continue
      }

      if (!isPriority && embeddedBytes + size > options.maxTotalBytes) {
        filesSkippedBudget++
        continue
      }

      if (await looksBinary(filePath)) {
        filesSkippedBinary++
        continue
      }

      const content = await readFile(filePath, 'utf8')
      embeddedBytes += size
      filesEmbedded++

      lines.push(`### ${relPath}`)
      lines.push('')
      lines.push(`\`\`\`${langFromExtension(ext)}`)
      lines.push(content.trimEnd())
      lines.push('```')
      lines.push('')
    }
  }

  lines.push('## Stats')
  lines.push('')
  lines.push(`- Files listed: ${allPaths.length}`)
  lines.push(`- Files embedded: ${filesEmbedded} (${formatBytes(embeddedBytes)})`)
  lines.push(`- Skipped (binary): ${filesSkippedBinary}`)
  lines.push(`- Skipped (over --max-bytes): ${filesSkippedSize}`)
  lines.push(`- Skipped (over --max-total-bytes budget): ${filesSkippedBudget}`)
  lines.push(`- Generated in: ${(performance.now() - startedAt).toFixed(0)}ms`)
  lines.push('')

  const output = lines.join('\n')
  await writeFile(join(options.root, options.out), output, 'utf8')

  return {
    outPath: join(options.root, options.out),
    output,
    stats: {
      filesListed: allPaths.length,
      filesEmbedded,
      embeddedBytes,
      filesSkippedBinary,
      filesSkippedSize,
      filesSkippedBudget,
      durationMs: performance.now() - startedAt
    }
  }
}

export { formatBytes }
