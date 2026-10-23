import { VaultItem } from './storage';

export const GLOBAL_NAVIGABLE_TYPES: VaultItem['type'][] = [
  // Personal Information
  'identity',
  'contact',
  'password',
  'card',
  'wifi',
  'secret',

  // Notes & Productivity
  'note',
  'todo',
  'chat',
  'location',

  // Media
  'photo',
  'video',
  'audio',

  // Documents & Files
  'document',
  'file',
];

export const GLOBAL_NAVIGABLE_TYPES_SET = new Set(GLOBAL_NAVIGABLE_TYPES);

export const GLOBAL_NAVIGATION_EVENT = 'vault:global-navigate-to-item';

export const mapItemTypeToTab = (type: VaultItem['type']): string => {
  switch (type) {
    // Personal Information
    case 'identity':
      return 'identities';
    case 'contact':
      return 'contacts';
    case 'password':
      return 'passwords';
    case 'card':
      return 'cards';
    case 'wifi':
      return 'wifi';
    case 'secret':
      return 'secrets';

    // Notes & Productivity
    case 'note':
      return 'notes';
    case 'todo':
      return 'todos';
    case 'chat':
      return 'chats';
    case 'location':
      return 'locations';

    // Media
    case 'photo':
      return 'photos';
    case 'video':
      return 'videos';
    case 'audio':
      return 'audio';

    // Documents & Files
    case 'document':
      return 'documents';
    case 'file':
      return 'files';

    default:
      return 'dashboard';
  }
};

export const requestGlobalItemNavigation = (item: VaultItem) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<VaultItem>(GLOBAL_NAVIGATION_EVENT, {
        detail: item,
      }),
    );
  }
};
