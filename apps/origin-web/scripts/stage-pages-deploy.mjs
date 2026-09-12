import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDirectory, '..')
const repositoryRoot = path.resolve(appRoot, '../..')
const markerName = '.origin-pages-stage'
const routes = [
  'api/evidence/status.ts',
  'api/foundry/parse-floor.ts',
  'api/lead.ts',
]
const supports = ['server', 'src']
const stageManifest = `${JSON.stringify({
  schema: 'origin-pages-stage/v1',
  routes,
  supports,
})}\n`

function usage() {
  throw new Error('Usage: node apps/origin-web/scripts/stage-pages-deploy.mjs --out <directory>')
}

function parseOutput(args) {
  if (args.length !== 2 || args[0] !== '--out' || !args[1]) usage()
  return args[1]
}

async function exists(candidate) {
  try {
    await fs.lstat(candidate)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false
    throw error
  }
}

async function canonicalOutput(raw) {
  const absolute = path.resolve(raw)
  if (await exists(absolute)) return fs.realpath(absolute)

  const missing = []
  let cursor = absolute
  while (!(await exists(cursor))) {
    const parent = path.dirname(cursor)
    if (parent === cursor) throw new Error(`Cannot resolve output path: ${raw}`)
    missing.unshift(path.basename(cursor))
    cursor = parent
  }
  const resolvedParent = await fs.realpath(cursor)
  return path.resolve(resolvedParent, ...missing)
}

function isForbiddenOutput(output) {
  const root = path.parse(output).root
  const relativeToApp = path.relative(appRoot, output)
  const isInsideApp = relativeToApp === '' || (
    relativeToApp !== '..' &&
    !relativeToApp.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeToApp)
  )
  return output === root || output === repositoryRoot || output === os.homedir() || isInsideApp
}

async function prepareEmptyDirectory(output) {
  const existing = await exists(output)
  if (!existing) {
    await fs.mkdir(output, { recursive: true })
    return
  }

  const stat = await fs.lstat(output)
  if (!stat.isDirectory()) throw new Error(`Output must be a directory: ${output}`)
  const entries = await fs.readdir(output, { withFileTypes: true })
  if (entries.length === 0) return
  throw new Error(`Refusing nonempty staging output directory: ${output}`)
}

async function collectRegularFiles(directory, label) {
  const root = await fs.lstat(directory)
  if (root.isSymbolicLink()) throw new Error(`Refusing symlink ${label} root: ${directory}`)
  if (!root.isDirectory()) throw new Error(`Expected ${label} directory: ${directory}`)

  const files = []
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      const metadata = await fs.lstat(absolute)
      if (metadata.isSymbolicLink()) throw new Error(`Refusing symlink in ${label}: ${absolute}`)
      if (metadata.isDirectory()) await visit(absolute)
      else if (metadata.isFile()) files.push(path.relative(directory, absolute).split(path.sep).join('/'))
      else throw new Error(`Unexpected ${label} entry: ${absolute}`)
    }
  }
  await visit(directory)
  return files.sort()
}

async function assertSourceRoute(relative) {
  const root = path.join(appRoot, 'functions')
  let current = root
  for (const component of relative.split('/')) {
    const metadata = await fs.lstat(current)
    if (metadata.isSymbolicLink()) throw new Error(`Refusing symlink in route source: ${current}`)
    if (!metadata.isDirectory()) throw new Error(`Expected route source directory: ${current}`)
    current = path.join(current, component)
  }
  const metadata = await fs.lstat(current)
  if (metadata.isSymbolicLink()) throw new Error(`Refusing symlink route source: ${current}`)
  if (!metadata.isFile()) throw new Error(`Expected route source file: ${current}`)
  return current
}

async function preflightSource() {
  const sources = new Map()
  for (const route of routes) sources.set(route, await assertSourceRoute(route))
  const supportFiles = new Map()
  for (const support of supports) {
    supportFiles.set(support, await collectRegularFiles(path.join(appRoot, support), 'support source'))
  }
  return { sources, supportFiles }
}

async function copyFile(relative, source, output) {
  const destination = path.join(output, 'functions', relative)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { dereference: false, force: false })
}

async function stagedFunctionFiles(directory) {
  const results = []
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in staged functions tree: ${absolute}`)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) results.push(path.relative(directory, absolute).split(path.sep).join('/'))
      else throw new Error(`Unexpected staged functions entry: ${absolute}`)
    }
  }
  await visit(directory)
  return results.sort()
}

async function main() {
  const output = await canonicalOutput(parseOutput(process.argv.slice(2)))
  if (isForbiddenOutput(output)) throw new Error(`Unsafe staging output directory: ${output}`)
  const { sources, supportFiles } = await preflightSource()

  await prepareEmptyDirectory(output)
  await fs.mkdir(path.join(output, 'functions'), { recursive: true })
  for (const route of routes) await copyFile(route, sources.get(route), output)

  for (const support of supports) {
    await fs.cp(path.join(appRoot, support), path.join(output, support), {
      recursive: true,
      dereference: false,
      force: true,
    })
  }

  const actualRoutes = await stagedFunctionFiles(path.join(output, 'functions'))
  if (JSON.stringify(actualRoutes) !== JSON.stringify(routes)) {
    throw new Error(`Staged Pages routes diverged from the allowlist: ${actualRoutes.join(', ')}`)
  }
  for (const support of supports) {
    const actualFiles = await collectRegularFiles(path.join(output, support), 'staged support')
    if (JSON.stringify(actualFiles) !== JSON.stringify(supportFiles.get(support))) {
      throw new Error(`Staged Pages support tree diverged from source: ${support}`)
    }
  }
  await fs.writeFile(path.join(output, markerName), stageManifest)
  process.stdout.write(`Staged Pages routes in ${output}: ${actualRoutes.join(', ')}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
