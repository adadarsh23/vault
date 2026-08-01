const DEFAULT_CATEGORY = "file";

const CATEGORY_ALIAS_MAP: Record<string, string> = {
  note: 'note',
  notes: 'note',
  chat: 'chat',
  chats: 'chat',
  todo: 'todo',
  todos: 'todo',
  password: 'password',
  passwords: 'password',
  secret: 'secret',
  secrets: 'secret',
  secretkey: 'secret',
  secretkeys: 'secret',
  contact: 'contact',
  contacts: 'contact',
  location: 'location',
  locations: 'location',
  photo: 'photo',
  photos: 'photo',
  video: 'video',
  videos: 'video',
  audio: 'audio',
  audios: 'audio',
  document: 'document',
  documents: 'document',
  file: 'file',
  files: 'file',
  other: 'other',
  'other-files': 'other-files',
  other_files: 'other-files',
  otherfile: 'other-files',
  otherfiles: 'other-files',
  settings: 'settings',
  system: 'system',
  users: 'users',
  logs: 'system',
  v2_items: 'file',
};

export const parseMetadataHeader = (metadataHeader: unknown): Record<string, unknown> => {
  if (!metadataHeader || typeof metadataHeader !== "string") {
    return {};
  }

  if (metadataHeader.startsWith("V2_ENC:")) {
    // Preserve encrypted metadata so clients can decrypt during sync/download.
    return { payload: metadataHeader };
  }

  try {
    const parsed = JSON.parse(metadataHeader);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const resolvePayloadEncoding = (payload: string | Buffer) => {
  if (Buffer.isBuffer(payload)) {
    return "binary-base64" as const;
  }

  if (typeof payload === "string" && payload.startsWith("V2_MODERN:")) {
    return "modern" as const;
  }

  return "legacy-encrypted" as const;
};

export const parseCategory = (value: unknown): string => {
  if (typeof value !== 'string') {
    return DEFAULT_CATEGORY
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return DEFAULT_CATEGORY
  }

  return CATEGORY_ALIAS_MAP[normalized] || DEFAULT_CATEGORY
};
