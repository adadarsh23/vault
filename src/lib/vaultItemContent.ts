/**
 * Vault content utilities for items that must store encrypted text payloads.
 */
const MAX_STRING_CONTENT_LENGTH = 32 * 1024 * 1024;
const MAX_JSON_PARSE_INPUT_LENGTH = 4 * 1024 * 1024;

const normalizeTextContent = (value: string): string => {
  const withoutBom = value.startsWith('\uFEFF') ? value.slice(1) : value;
  return withoutBom.trim();
};

export const getStringContent = (content: string | Uint8Array): string | null => {
  if (typeof content !== 'string') {
    return null;
  }

  if (content.length === 0 || content.length > MAX_STRING_CONTENT_LENGTH) {
    return null;
  }

  const normalizedContent = normalizeTextContent(content);
  return normalizedContent.length > 0 ? normalizedContent : null;
};

/**
 * Safe JSON parser that never throws.
 */
export const parseJsonSafely = <T>(rawJson: string): T | null => {
  if (
    typeof rawJson !== 'string' ||
    rawJson.length === 0 ||
    rawJson.length > MAX_JSON_PARSE_INPUT_LENGTH
  ) {
    return null;
  }

  const normalizedJson = normalizeTextContent(rawJson);
  if (!normalizedJson) {
    return null;
  }

  try {
    return JSON.parse(normalizedJson) as T;
  } catch {
    return null;
  }
};
