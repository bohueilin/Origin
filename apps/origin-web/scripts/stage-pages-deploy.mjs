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
  return output === root || output === repositoryRoot || output === os.homedir()
}

async function emptyManagedDirectory(output) {
  const existing = await exists(output)
  if (!existing) {
    await fs.mkdir(output, { recursive: true })
    return
  }

  const stat = await fs.stat(output)
  if (!stat.isDirectory()) throw new Error(`Output must be a directory: ${output}`)
  const entries = await fs.readdir(output)
  if (entries.length > 0 && !entries.includes(markerName)) {
    throw new Error(`Refusing nonempty unmarked output directory: ${output}`)
  }
  await Promise.all(entries.map((entry) => fs.rm(path.join(output, entry), { recursive: true, force: true })))
}

async function copyFile(relative, output) {
  const source = path.join(appRoot, 'functions', relative)
  const destination = path.join(output, 'functions', relative)
  const stat = await fs.stat(source)
  if (!stat.isFile()) throw new Error(`Expected route source file: ${source}`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(source, destination)
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

  await emptyManagedDirectory(output)
  await fs.mkdir(path.join(output, 'functions'), { recursive: true })
  for (const route of routes) await copyFile(route, output)

  for (const support of ['server', 'src']) {
    await fs.cp(path.join(appRoot, support), path.join(output, support), {
      recursive: true,
      dereference: true,
      force: true,
    })
  }

  const actualRoutes = await stagedFunctionFiles(path.join(output, 'functions'))
  if (JSON.stringify(actualRoutes) !== JSON.stringify(routes)) {
    throw new Error(`Staged Pages routes diverged from the allowlist: ${actualRoutes.join(', ')}`)
  }
  await fs.writeFile(path.join(output, markerName), 'Origin Pages staging manifest\n')
  process.stdout.write(`Staged Pages routes in ${output}: ${actualRoutes.join(', ')}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
