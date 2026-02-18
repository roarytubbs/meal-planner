function normalizeEnv(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function getServerEnv(name: string): string | undefined {
  return normalizeEnv(process.env[name])
}

export function requireServerEnv(name: string): string {
  const value = getServerEnv(name)
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }
  return value
}

export function assertServerEnvInProduction(names: string[]): void {
  if (process.env.NODE_ENV !== 'production') return
  for (const name of names) {
    requireServerEnv(name)
  }
}
