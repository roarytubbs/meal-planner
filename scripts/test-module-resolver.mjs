import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

const rootDir = process.cwd()
const exts = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs']

function resolveFileMaybe(basePath) {
  for (const ext of exts) {
    const filePath = `${basePath}${ext}`
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath
  }

  for (const ext of exts.slice(1)) {
    const indexPath = path.join(basePath, `index${ext}`)
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) return indexPath
  }

  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const fromAlias = resolveFileMaybe(path.join(rootDir, specifier.slice(2)))
      if (fromAlias) {
        return nextResolve(pathToFileURL(fromAlias).href, context)
      }
    }

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const parentPath = context.parentURL
        ? path.dirname(fileURLToPath(context.parentURL))
        : rootDir
      const fromRelative = resolveFileMaybe(path.resolve(parentPath, specifier))
      if (fromRelative) {
        return nextResolve(pathToFileURL(fromRelative).href, context)
      }
    }

    return nextResolve(specifier, context)
  },
})
