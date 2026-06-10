import { fileURLToPath } from 'node:url'
import path from 'node:path'
import iconGen from 'icon-gen'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../../..')

const targets = [
  {
    name: 'prod',
    source: path.join(root, 'apps/web/public/icon-emerald-dark-512.png'),
    out: path.join(__dirname, '../resources/icons/prod'),
  },
  {
    name: 'dev',
    source: path.join(root, 'apps/web/public/icon-blue-light-512.png'),
    out: path.join(__dirname, '../resources/icons/dev'),
  },
]

for (const target of targets) {
  console.log(`Generating icons for ${target.name} from ${target.source}`)
  await iconGen(target.source, target.out, {
    report: true,
    ico: { name: 'icon', sizes: [16, 24, 32, 48, 64, 128, 256] },
    icns: { name: 'icon', sizes: [16, 32, 64, 128, 256, 512] },
    favicon: { name: 'icon', pngSizes: [16, 32, 48, 64, 128, 256, 512], icoSizes: [] },
  })
}
