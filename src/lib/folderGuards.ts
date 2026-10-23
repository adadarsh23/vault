export const isSavedFolderName = (folderName: string | null | undefined): boolean => {
  if (typeof folderName !== 'string') return false;
  return folderName.trim().toLowerCase().startsWith('saved');
};

export const sortFoldersSavedFirst = (folders: readonly string[]): string[] => {
  if (!Array.isArray(folders) || folders.length === 0) return [];
  return [...folders].sort((a, b) => {
    const aSaved = isSavedFolderName(a);
    const bSaved = isSavedFolderName(b);
    if (aSaved !== bSaved) {
      return aSaved ? -1 : 1;
    }
    return String(a || '').localeCompare(String(b || ''));
  });
};
