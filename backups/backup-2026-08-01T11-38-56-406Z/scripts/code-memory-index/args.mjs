import { DEFAULT_HISTORY_LIMIT, DEFAULT_MAX_FILE_SIZE_BYTES } from './constants.mjs'

export const parseArgs = (argv) => {
  const options = {
    maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
    includeHidden: false,
    historyLimit: DEFAULT_HISTORY_LIMIT,
    excludeBasenames: ['index.html'],
    includeExtensions: [],
    excludeDirectories: [],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--max-file-size-kb') {
      const value = Number(argv[i + 1])
      if (Number.isFinite(value) && value > 0) options.maxFileSizeBytes = Math.floor(value * 1024)
      i += 1
      continue
    }
    if (token === '--history-limit') {
      const value = Number(argv[i + 1])
      if (Number.isFinite(value) && value > 0) options.historyLimit = Math.floor(value)
      i += 1
      continue
    }
    if (token === '--include-hidden') options.includeHidden = true
    if (token === '--exclude-basename') {
      const value = String(argv[i + 1] || '').trim().toLowerCase()
      if (value) options.excludeBasenames.push(value)
      i += 1
      continue
    }
    if (token === '--include-extension') {
      const value = String(argv[i + 1] || '').trim().toLowerCase()
      if (value) options.includeExtensions.push(value.startsWith('.') ? value : `.${value}`)
      i += 1
      continue
    }
    if (token === '--exclude-directory') {
      const value = String(argv[i + 1] || '').trim()
      if (value) options.excludeDirectories.push(value)
      i += 1
    }
  }

  return options
}
