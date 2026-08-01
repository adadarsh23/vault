import path from 'node:path'

export const createPathHelpers = (root) => {
  const toRelPath = (filePath) => path.relative(root, filePath).split(path.sep).join('/')
  const dirnameRel = (filePath) => path.dirname(filePath).replace(/\\/g, '/')
  const resolveRelativeImport = (fileRelPath, specifier) => {
    if (!specifier.startsWith('.')) return null
    const abs = path.resolve(root, path.dirname(fileRelPath), specifier)
    return toRelPath(abs)
  }

  return { dirnameRel, resolveRelativeImport, toRelPath }
}
