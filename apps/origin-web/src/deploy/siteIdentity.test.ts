import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IndexHtmlTransformContext, Plugin, ResolvedConfig, UserConfig } from 'vite'
import viteConfig from '../../vite.config'

const temporaryDirectories: string[] = []

async function identityPlugin(): Promise<Plugin> {
  const config = typeof viteConfig === 'function'
    ? await viteConfig({ command: 'build', mode: 'production' })
    : await viteConfig
  return (config as UserConfig).plugins?.flat().find((plugin) =>
    plugin && 'name' in plugin && plugin.name === 'origin-site-url-rewrite') as Plugin
}

async function transformHtml(plugin: Plugin, html: string): Promise<unknown> {
  const hook = plugin.transformIndexHtml!
  const handler = typeof hook === 'function' ? hook : hook.handler
  return handler.call({} as never, html, {} as IndexHtmlTransformContext)
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('canonical website identity at build time', () => {
  it('rewrites public identity for an explicit preview without changing the source repository URL', async () => {
    vi.stubEnv('SITE_URL', 'https://review.example.test/')
    const plugin = await identityPlugin()
    expect(await transformHtml(plugin,
      '<link rel="canonical" href="https://originphysicalai.com/verify"><a href="https://github.com/bohueilin/Origin">Source</a>',
    )).toBe('<link rel="canonical" href="https://review.example.test/verify"><a href="https://github.com/bohueilin/Origin">Source</a>')
  })

  it('does not rewrite its own replacement or unrelated subdomains', async () => {
    vi.stubEnv('SITE_URL', 'https://preview.originphysicalai.com')
    const plugin = await identityPlugin()
    expect(await transformHtml(plugin,
      'https://originphysicalai.com/verify originphysicalai.com/brief https://api.originphysicalai.com/status',
    )).toBe('https://preview.originphysicalai.com/verify preview.originphysicalai.com/brief https://api.originphysicalai.com/status')
  })

  it('leaves canonical metadata unchanged when no override is configured', async () => {
    vi.stubEnv('SITE_URL', '')
    vi.stubEnv('PUBLIC_SITE_URL', '')
    vi.stubEnv('CONTACT_EMAIL', '')
    const html = '<link rel="canonical" href="https://originphysicalai.com/">'
    expect(await transformHtml(await identityPlugin(), html)).toBe(html)
  })

  it('updates only public pages and discovery in the configured output directory, preserving evidence bytes', async () => {
    vi.stubEnv('SITE_URL', 'https://review.example.test')
    vi.stubEnv('CONTACT_EMAIL', 'review@example.test')
    const outputDirectory = mkdtempSync(join(tmpdir(), 'origin-identity-'))
    temporaryDirectories.push(outputDirectory)
    const fixture = 'https://originphysicalai.com/verify bohueilin@gmail.com'
    const immutableFiles: Record<string, string> = {
      'proof/tr-a002.json': readFileSync(resolve(__dirname, '../../public/proof/tr-a002.json'), 'utf8'),
      'proof/issuer.json': JSON.stringify({ issuer: fixture, legacy: 'https://origin-physical-ai.pages.dev' }),
      'trust/receipt.txt': fixture,
      'rsi/research.html': fixture,
      'assets/app.js': `const identity = ${JSON.stringify(fixture)}`,
      '_routes.json': JSON.stringify({ include: ['/api/*'], note: fixture }),
    }
    const publicFiles = ['index.html', '404.html', 'legal/privacy-policy.html', 'llms.txt', 'robots.txt', 'sitemap.xml']
    for (const [name, content] of Object.entries({
      ...immutableFiles, ...Object.fromEntries(publicFiles.map((name) => [name, fixture])),
    })) {
      const path = join(outputDirectory, name)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
    const plugin = await identityPlugin()
    const configHook = plugin.configResolved!
    const configure = typeof configHook === 'function' ? configHook : configHook.handler
    await configure.call({} as never, {
      root: resolve(__dirname, '../..'), build: { outDir: outputDirectory },
    } as ResolvedConfig)
    const closeHook = plugin.closeBundle!
    const close = typeof closeHook === 'function' ? closeHook : closeHook.handler
    await close.call({} as never)

    for (const name of publicFiles) {
      expect(readFileSync(join(outputDirectory, name), 'utf8'), name)
        .toBe('https://review.example.test/verify review@example.test')
    }
    for (const [name, original] of Object.entries(immutableFiles)) {
      expect(readFileSync(join(outputDirectory, name), 'utf8'), name).toBe(original)
    }
  })

  it('publishes the same canonical identity to search and social consumers across entry pages', () => {
    const appRoot = resolve(__dirname, '../..')
    const pages = readdirSync(appRoot).filter((name) => name.endsWith('.html'))
    for (const page of pages) {
      const html = readFileSync(join(appRoot, page), 'utf8')
      const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1]
      if (!ogUrl) continue // Internal noindex admin page has no public metadata.
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1]
      expect(canonical, page).toBe(ogUrl)
      expect(new URL(canonical!).origin, page).toBe('https://originphysicalai.com')
      for (const image of html.matchAll(/(?:property="og:image"|name="twitter:image") content="([^"]+)"/g)) {
        expect(new URL(image[1]).origin, page).toBe('https://originphysicalai.com')
      }
    }
    const sitemap = readFileSync(join(appRoot, 'public/sitemap.xml'), 'utf8')
    for (const loc of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      expect(new URL(loc[1]).origin).toBe('https://originphysicalai.com')
    }
  })

})
