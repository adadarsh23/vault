export type PlatformType = 'auto' | 'mac' | 'windows' | 'linux' | 'touch';
export type DetectedOS = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

export interface DeviceInfo {
  os: DetectedOS;
  isTouch: boolean;
  isApple: boolean;
  platformName: string;
  userAgent: string;
}

/**
 * Detect user operating system and input capabilities
 */
export function detectDevice(): DeviceInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      os: 'unknown',
      isTouch: false,
      isApple: false,
      platformName: 'Unknown Device',
      userAgent: '',
    };
  }

  const ua = navigator.userAgent || '';
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    '';

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMac = /Mac/.test(platform) || /Macintosh/.test(ua) || isIOS;
  const isWindows = /Win/.test(platform) || /Windows/.test(ua);
  const isLinux = /Linux/.test(platform) || /X11/.test(ua);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  let os: DetectedOS = 'unknown';
  let platformName = 'Desktop Device';

  if (isIOS) {
    os = 'ios';
    platformName = 'Apple iOS / iPadOS';
  } else if (isAndroid) {
    os = 'android';
    platformName = 'Android Device';
  } else if (isMac) {
    os = 'mac';
    platformName = 'macOS';
  } else if (isWindows) {
    os = 'windows';
    platformName = 'Windows OS';
  } else if (isLinux) {
    os = 'linux';
    platformName = 'Linux Desktop';
  }

  return {
    os,
    isTouch,
    isApple: isMac || isIOS,
    platformName,
    userAgent: ua,
  };
}

/**
 * Resolve effective platform mode based on user selection and detected OS
 */
export function getEffectivePlatform(
  selectedPlatform: PlatformType,
  detectedOS: DetectedOS,
  isTouch: boolean
): 'mac' | 'windows' | 'linux' | 'touch' {
  if (selectedPlatform !== 'auto') {
    return selectedPlatform;
  }

  if (isTouch && (detectedOS === 'ios' || detectedOS === 'android')) {
    return 'touch';
  }

  if (detectedOS === 'mac' || detectedOS === 'ios') {
    return 'mac';
  }

  if (detectedOS === 'linux') {
    return 'linux';
  }

  return 'windows';
}

/**
 * Translate generic shortcut key names into OS-native display strings
 */
export function formatKeyForPlatform(
  key: string,
  platform: 'mac' | 'windows' | 'linux' | 'touch'
): string {
  const isMac = platform === 'mac';

  // Normalize key name comparisons
  const lower = key.trim().toLowerCase();

  if (isMac) {
    switch (lower) {
      case 'ctrl':
      case 'control':
      case 'cmd':
      case 'mod':
        return '⌘';
      case 'alt':
      case 'option':
      case 'opt':
        return '⌥';
      case 'shift':
        return '⇧';
      case 'delete':
      case 'del':
        return '⌫';
      case 'backspace':
        return '⌫';
      case 'enter':
      case 'return':
        return '↵';
      case 'escape':
      case 'esc':
        return 'Esc';
      case 'space':
        return 'Space';
      default:
        return key.length === 1 ? key.toUpperCase() : key;
    }
  } else {
    // Windows / Linux / Touch
    switch (lower) {
      case 'cmd':
      case 'mod':
        return 'Ctrl';
      case 'option':
      case 'opt':
        return 'Alt';
      case 'del':
        return 'Delete';
      case 'esc':
        return 'Escape';
      case 'backspace':
        return 'Backspace';
      default:
        return key;
    }
  }
}

/**
 * Convert array of key tokens into OS formatted keys
 */
export function formatKeysForPlatform(
  keys: string[],
  platform: 'mac' | 'windows' | 'linux' | 'touch'
): string[] {
  return keys.map((key) => formatKeyForPlatform(key, platform));
}

/**
 * Helper to match a live KeyboardEvent against a target key combo array
 */
export function matchesShortcut(event: KeyboardEvent, keys: string[]): boolean {
  const isMac =
    typeof navigator !== 'undefined' &&
    (/Mac/.test(navigator.platform) || /Macintosh/.test(navigator.userAgent));

  const reqCtrlOrCmd = keys.some((k) => ['ctrl', 'cmd', 'mod'].includes(k.toLowerCase()));
  const reqAlt = keys.some((k) => ['alt', 'option', 'opt'].includes(k.toLowerCase()));
  const reqShift = keys.some((k) => k.toLowerCase() === 'shift');

  const pressedCtrlOrCmd = isMac ? event.metaKey || event.ctrlKey : event.ctrlKey || event.metaKey;
  const pressedAlt = event.altKey;
  const pressedShift = event.shiftKey;

  if (reqCtrlOrCmd !== pressedCtrlOrCmd) return false;
  if (reqAlt !== pressedAlt) return false;
  if (reqShift !== pressedShift) return false;

  // Extract non-modifier key requirement
  const mainKeys = keys.filter(
    (k) => !['ctrl', 'cmd', 'mod', 'alt', 'option', 'opt', 'shift'].includes(k.toLowerCase())
  );

  if (mainKeys.length === 0) return true;

  const eventKey = event.key.toLowerCase();

  return mainKeys.some((mk) => {
    const subKeys = mk.split('/').map((s) => s.trim().toLowerCase());
    return subKeys.some((targetMainKey) => {
      if (targetMainKey === 'delete' || targetMainKey === 'del') {
        return eventKey === 'delete' || eventKey === 'backspace';
      }
      if (targetMainKey === 'f11') return eventKey === 'f11';
      if (targetMainKey === '←' || targetMainKey === 'left') return eventKey === 'arrowleft';
      if (targetMainKey === '→' || targetMainKey === 'right') return eventKey === 'arrowright';
      if (targetMainKey === '↑' || targetMainKey === 'up') return eventKey === 'arrowup';
      if (targetMainKey === '↓' || targetMainKey === 'down') return eventKey === 'arrowdown';

      // Ignore gesture descriptions like 'drag files', 'swipe ↔', 'hold 500ms', etc.
      if (
        targetMainKey.includes('drag') ||
        targetMainKey.includes('swipe') ||
        targetMainKey.includes('hold') ||
        targetMainKey.includes('tap')
      ) {
        return false;
      }

      return targetMainKey === eventKey;
    });
  });
}
