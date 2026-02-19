import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const migrationsDir = resolve(projectRoot, 'prisma', 'migrations')

function runPrisma(args) {
  return spawnSync('npx', ['prisma', ...args], {
    cwd: projectRoot,
    stdio: 'pipe',
    env: process.env,
    encoding: 'utf8',
  })
}

function writeOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function getBaselineMigrationName() {
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_.+/.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  if (migrations.length === 0) {
    throw new Error('No Prisma migrations found in prisma/migrations.')
  }

  return migrations[0]
}

function deployWithOptionalBaseline() {
  const initialDeploy = runPrisma(['migrate', 'deploy'])
  writeOutput(initialDeploy)

  if (initialDeploy.status === 0) {
    return
  }

  const combinedOutput = `${initialDeploy.stdout || ''}\n${initialDeploy.stderr || ''}`
  if (!combinedOutput.includes('P3005')) {
    process.exit(initialDeploy.status ?? 1)
  }

  const baselineMigration = getBaselineMigrationName()
  console.warn(
    `Detected non-empty schema without migration history (P3005). Marking ${baselineMigration} as applied.`
  )

  const resolveResult = runPrisma(['migrate', 'resolve', '--applied', baselineMigration])
  writeOutput(resolveResult)
  if (resolveResult.status !== 0) {
    process.exit(resolveResult.status ?? 1)
  }

  const finalDeploy = runPrisma(['migrate', 'deploy'])
  writeOutput(finalDeploy)
  if (finalDeploy.status !== 0) {
    process.exit(finalDeploy.status ?? 1)
  }
}

deployWithOptionalBaseline()
