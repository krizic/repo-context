import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/generate-context.ts',
    cli: 'src/cli.ts'
  },
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  shims: false
})
