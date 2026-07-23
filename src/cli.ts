#!/usr/bin/env node
import { formatBytes, generateContext, parseArgs } from './generate-context.js'

const options = parseArgs(process.argv.slice(2))

const result = await generateContext(options)
const { stats } = result

console.log(`✅ Wrote ${options.out} (${formatBytes(Buffer.byteLength(result.output))})`)
console.log(
  `   files: ${stats.filesListed} listed, ${stats.filesEmbedded} embedded, ` +
    `${stats.filesSkippedBinary} binary, ${stats.filesSkippedSize} too large, ${stats.filesSkippedBudget} over budget`
)
console.log(`   done in ${stats.durationMs.toFixed(0)}ms`)
