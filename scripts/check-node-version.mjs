const REQUIRED_MAJOR = 22

const currentVersion = process.versions.node || ''
const currentMajor = Number.parseInt(currentVersion.split('.')[0] || '', 10)

if (process.env.MEAL_PLANNER_SKIP_NODE_CHECK === '1') {
  process.exit(0)
}

if (!Number.isFinite(currentMajor) || currentMajor !== REQUIRED_MAJOR) {
  console.error(
    `Node ${REQUIRED_MAJOR}.x is required for this project. Current version: ${currentVersion}.`
  )
  console.error('Use `nvm use` after adding `.nvmrc`, or set MEAL_PLANNER_SKIP_NODE_CHECK=1 temporarily.')
  process.exit(1)
}
