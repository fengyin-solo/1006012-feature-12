// 冒烟测试运行器：用仓库自带 esbuild 把 TS 测试脚本（含 @ 别名）打包后再交给 node 执行。
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outfile = path.join(here, '.smoke-fueling.mjs')

await build({
  entryPoints: [path.join(here, 'smoke-fueling.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  alias: { '@': path.join(root, 'src') },
})

try {
  await import(pathToFileURL(outfile).href)
} finally {
  await rm(outfile, { force: true })
}
