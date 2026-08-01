import path from 'node:path'

import { parseArgs } from './code-memory-index/args.mjs'
import { buildIndex } from './code-memory-index/build-index.mjs'

const root = process.cwd()
const options = parseArgs(process.argv.slice(2))
const index = buildIndex({
  root,
  options,
  outputDir: path.join(root, '.memory'),
})

console.log([
  `Code memory index created: ${index.generatedArtifacts.outputFile}`,
  `schema=${index.schema}`,
  `files=${index.totals.filesIndexed}/${index.totals.filesScanned}`,
  `changed=${index.changes.counts.changed}`,
  `riskCritical=${index.riskSummary.critical}`,
  `historyCount=${index.history?.historyCount || 0}`,
].join(' | '))
