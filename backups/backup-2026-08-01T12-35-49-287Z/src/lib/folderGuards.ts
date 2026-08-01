export const isSavedFolderName = (folderName: string): boolean =>
  folderName.trim().toLowerCase().startsWith('saved')

export const sortFoldersSavedFirst = (folders: string[]): string[] =>
  [...folders].sort((a, b) => {
    const aSaved = isSavedFolderName(a)
    const bSaved = isSavedFolderName(b)
    if (aSaved !== bSaved) {
      return aSaved ? -1 : 1
    }
    return a.localeCompare(b)
  })

