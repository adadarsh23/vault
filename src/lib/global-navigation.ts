import { VaultItem } from './storage';

export const GLOBAL_NAVIGABLE_TYPES: VaultItem['type'][] = [
  'photo',
  'video',
  'audio',
  'document',
  'file',
  'password',
  'contact',
  'location',
  'todo',
  'chat',
  'card',
  'identity',
  'wifi',
];

export const GLOBAL_NAVIGATION_EVENT = 'vault:global-navigate-to-item';

export const mapItemTypeToTab = (type: VaultItem['type']): string => {
  switch (type) {
    case 'photo':
      return 'photos';
    case 'video':
      return 'videos';
    case 'audio':
      return 'audio';
    case 'document':
      return 'documents';
    case 'file':
      return 'files';
    case 'password':
      return 'passwords';
    case 'contact':
      return 'contacts';
    case 'note':
      return 'notes';
    case 'chat':
      return 'chats';
    case 'todo':
      return 'todos';
    case 'secret':
      return 'secrets';
    case 'location':
      return 'locations';
    case 'card':
      return 'cards';
    case 'identity':
      return 'identities';
    case 'wifi':
      return 'wifi';
    default:
      return 'dashboard';
  }
};

export const requestGlobalItemNavigation = (item: VaultItem) => {
  window.dispatchEvent(
    new CustomEvent<VaultItem>(GLOBAL_NAVIGATION_EVENT, {
      detail: item,
    }),
  );
};
