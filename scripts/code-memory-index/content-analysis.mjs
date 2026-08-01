import crypto from 'node:crypto'

import {
  COMMENT_LINE_RE,
  FUNCTION_RE,
  WHITESPACE_LINE_RE,
} from './constants.mjs'

export const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

export const extractFunctions = (content) => {
  const names = []
  let match
  while ((match = FUNCTION_RE.exec(content)) !== null) {
    const name = match.slice(1).find(Boolean)
    if (name) names.push(name)
  }
  return [...new Set(names)]
}

export const extractMatches = (content, regex) => {
  const matches = content.match(regex)
  return matches ? matches.map((line) => line.trim()) : []
}

export const extractImportSpecifiers = (content) => {
  const results = []
  const fromRe = /import\s+[^;\n]*?from\s+['"]([^'"]+)['"]/g
  const bareRe = /import\s+['"]([^'"]+)['"]/g
  let match
  while ((match = fromRe.exec(content)) !== null) results.push(match[1])
  while ((match = bareRe.exec(content)) !== null) results.push(match[1])
  return [...new Set(results)]
}

export const classifyImport = (specifier) => {
  if (specifier.startsWith('.')) return 'relative'
  if (specifier.startsWith('/')) return 'absolute'
  if (specifier.startsWith('node:')) return 'node_builtin'
  return 'package'
}

export const summarizeLines = (content) => {
  const rows = content.split(/\r?\n/)
  let code = 0
  let comments = 0
  let blanks = 0
  for (const line of rows) {
    if (WHITESPACE_LINE_RE.test(line)) {
      blanks += 1
      continue
    }
    if (COMMENT_LINE_RE.test(line)) {
      comments += 1
      continue
    }
    code += 1
  }
  return { total: content === '' ? 0 : rows.length, code, comments, blanks }
}

export const countKeywords = (content) => ({
  asyncCount: (content.match(/\basync\b/g) || []).length,
  awaitCount: (content.match(/\bawait\b/g) || []).length,
  tryCount: (content.match(/\btry\b/g) || []).length,
  catchCount: (content.match(/\bcatch\b/g) || []).length,
  throwCount: (content.match(/\bthrow\b/g) || []).length,
  ifCount: (content.match(/\bif\b/g) || []).length,
  switchCount: (content.match(/\bswitch\b/g) || []).length,
})
