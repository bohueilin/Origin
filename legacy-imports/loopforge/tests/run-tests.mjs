import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const testsDir = resolve('tests')
const files = (await readdir(testsDir))
  .filter((file) => file.endsWith('.test.ts'))
  .sort()

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  for (const file of files) {
    await server.ssrLoadModule(pathToFileURL(resolve(testsDir, file)).href)
  }
} finally {
  await server.close()
}
