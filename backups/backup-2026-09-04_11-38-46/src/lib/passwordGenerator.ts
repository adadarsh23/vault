/**
 * Reusable password generation utility
 */

export const PASSWORD_CONFIG = {
  MIN_LENGTH: 16,
  MAX_LENGTH: 64,
  DEFAULT_LENGTH: 32,
  CHARSETS: {
    UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
    NUMBERS: '0123456789',
    SYMBOLS: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  },
};

// 200 clean, simple, easy-to-type English words for passphrase generation
export const PASSPHRASE_WORDS = [
  'apple',
  'banana',
  'cherry',
  'orange',
  'grape',
  'melon',
  'lemon',
  'peach',
  'berry',
  'water',
  'river',
  'mountain',
  'forest',
  'desert',
  'valley',
  'ocean',
  'beach',
  'cloud',
  'storm',
  'rain',
  'wind',
  'snow',
  'fire',
  'flame',
  'smoke',
  'ash',
  'stone',
  'rock',
  'sand',
  'dirt',
  'clay',
  'gold',
  'silver',
  'iron',
  'copper',
  'bronze',
  'metal',
  'wood',
  'leaf',
  'root',
  'stem',
  'flower',
  'rose',
  'lily',
  'tulip',
  'daisy',
  'tree',
  'bush',
  'grass',
  'moss',
  'fern',
  'bird',
  'fish',
  'frog',
  'toad',
  'crab',
  'clam',
  'snail',
  'worm',
  'spider',
  'insect',
  'bee',
  'wasp',
  'ant',
  'fly',
  'moth',
  'dog',
  'cat',
  'horse',
  'cow',
  'pig',
  'sheep',
  'goat',
  'deer',
  'elk',
  'moose',
  'bear',
  'wolf',
  'fox',
  'lion',
  'tiger',
  'leopard',
  'zebra',
  'camel',
  'panda',
  'koala',
  'rabbit',
  'hare',
  'mouse',
  'rat',
  'squirrel',
  'beaver',
  'otter',
  'seal',
  'whale',
  'shark',
  'dolphin',
  'eagle',
  'hawk',
  'owl',
  'crow',
  'duck',
  'goose',
  'swan',
  'chicken',
  'turkey',
  'paper',
  'pen',
  'pencil',
  'book',
  'page',
  'word',
  'line',
  'desk',
  'chair',
  'table',
  'door',
  'window',
  'wall',
  'floor',
  'roof',
  'house',
  'room',
  'kitchen',
  'bath',
  'bed',
  'sheet',
  'pillow',
  'clock',
  'watch',
  'ring',
  'key',
  'lock',
  'chain',
  'rope',
  'wire',
  'card',
  'coin',
  'bill',
  'bag',
  'box',
  'cup',
  'glass',
  'plate',
  'bowl',
  'fork',
  'spoon',
  'knife',
  'pan',
  'pot',
  'stove',
  'oven',
  'sink',
  'tub',
  'soap',
  'towel',
  'brush',
  'comb',
  'mirror',
  'lamp',
  'light',
  'bulb',
  'shade',
  'switch',
  'plug',
  'cord',
  'phone',
  'radio',
  'screen',
  'keys',
  'mouse',
  'button',
  'wheel',
  'gear',
  'tool',
  'nail',
  'screw',
  'bolt',
  'nut',
  'hammer',
  'saw',
  'pipe',
  'tube',
  'hose',
  'valve',
  'pump',
  'tank',
  'well',
  'lake',
  'pond',
  'pool',
  'gate',
  'fence',
  'path',
  'road',
  'street',
  'bridge',
  'tower',
  'fort',
  'camp',
];

const getSecureRandomInt = (maxExclusive: number): number => {
  if (maxExclusive <= 0) return 0;

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const uint32 = new Uint32Array(1);
    const maxUint32 = 0x100000000;
    const cutoff = maxUint32 - (maxUint32 % maxExclusive);

    do {
      crypto.getRandomValues(uint32);
    } while (uint32[0] >= cutoff);

    return uint32[0] % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
};

const pickRandomChar = (charset: string): string => charset[getSecureRandomInt(charset.length)];

const secureShuffle = (input: string): string => {
  const chars = input.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/**
 * Generates a secure random password
 * @param length - Length of the password (clamped between MIN and MAX)
 */
export const generateSecurePassword = (length: number = PASSWORD_CONFIG.DEFAULT_LENGTH): string => {
  const actualLength = Math.max(
    PASSWORD_CONFIG.MIN_LENGTH,
    Math.min(PASSWORD_CONFIG.MAX_LENGTH, length),
  );

  const { UPPERCASE, LOWERCASE, NUMBERS, SYMBOLS } = PASSWORD_CONFIG.CHARSETS;
  const allChars = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS;

  // Ensure at least one character from each set for strength
  let password = '';
  password += pickRandomChar(UPPERCASE);
  password += pickRandomChar(LOWERCASE);
  password += pickRandomChar(NUMBERS);
  password += pickRandomChar(SYMBOLS);

  // Fill the rest
  for (let i = password.length; i < actualLength; i++) {
    password += pickRandomChar(allChars);
  }

  return secureShuffle(password);
};

export interface GeneratorOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  excludeConfusing?: boolean;
  passphrase?: boolean;
  numWords?: number;
  separator?: string;
  capitalize?: boolean;
}

/**
 * Generates a password or passphrase with advanced customization options
 */
export const generatePasswordWithOptions = (options: GeneratorOptions): string => {
  if (options.passphrase) {
    const numWords = options.numWords || 4;
    const separator = options.separator !== undefined ? options.separator : '-';
    const capitalize = options.capitalize ?? false;
    const selectedWords: string[] = [];

    for (let i = 0; i < numWords; i++) {
      let word = PASSPHRASE_WORDS[getSecureRandomInt(PASSPHRASE_WORDS.length)];
      if (capitalize) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }
      selectedWords.push(word);
    }
    return selectedWords.join(separator);
  }

  const { UPPERCASE, LOWERCASE, NUMBERS, SYMBOLS } = PASSWORD_CONFIG.CHARSETS;

  // Confusing characters filter
  const filterConfusing = (set: string) => {
    return set.replace(/[iIlLoO01!|]/g, '');
  };

  const getSet = (set: string, enabled: boolean) => {
    if (!enabled) return '';
    return options.excludeConfusing ? filterConfusing(set) : set;
  };

  const activeUppercase = getSet(UPPERCASE, options.uppercase ?? true);
  const activeLowercase = getSet(LOWERCASE, options.lowercase ?? true);
  const activeNumbers = getSet(NUMBERS, options.numbers ?? true);
  const activeSymbols = getSet(SYMBOLS, options.symbols ?? true);

  let chosenCharsets = activeUppercase + activeLowercase + activeNumbers + activeSymbols;
  const requiredChars: string[] = [];

  if (activeUppercase) requiredChars.push(pickRandomChar(activeUppercase));
  if (activeLowercase) requiredChars.push(pickRandomChar(activeLowercase));
  if (activeNumbers) requiredChars.push(pickRandomChar(activeNumbers));
  if (activeSymbols) requiredChars.push(pickRandomChar(activeSymbols));

  // Fallback to lowercase if everything is disabled
  if (chosenCharsets === '') {
    const fallback = options.excludeConfusing ? filterConfusing(LOWERCASE) : LOWERCASE;
    chosenCharsets = fallback;
    requiredChars.push(pickRandomChar(fallback));
  }

  const length = options.length || PASSWORD_CONFIG.DEFAULT_LENGTH;
  const actualLength = Math.max(8, Math.min(128, length));

  let password = requiredChars.join('');
  for (let i = password.length; i < actualLength; i++) {
    password += pickRandomChar(chosenCharsets);
  }

  return secureShuffle(password);
};

export interface StrengthResult {
  score: number; // 0 to 4
  label: string; // 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong'
  color: string; // Tailwind bg color class
  percentage: number; // 0 to 100
  suggestions: string[];
}

/**
 * Evaluates a password's strength based on various criteria
 */
export const evaluatePasswordStrength = (password: string): StrengthResult => {
  const suggestions: string[] = [];
  if (!password) {
    return { score: 0, label: 'Empty', color: 'bg-white/10', percentage: 0, suggestions: [] };
  }

  let score = 0;

  // Length criteria
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;

  if (password.length < 12) {
    suggestions.push('Make password at least 12 characters long (ideally 16+).');
  }

  // Character variety criteria
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  let varietyCount = 0;
  if (hasUpper) varietyCount++;
  if (hasLower) varietyCount++;
  if (hasDigit) varietyCount++;
  if (hasSpecial) varietyCount++;

  if (varietyCount >= 3) score += 1;
  if (varietyCount === 4 && password.length >= 12) score += 1;

  if (!hasUpper) suggestions.push('Add uppercase letters.');
  if (!hasLower) suggestions.push('Add lowercase letters.');
  if (!hasDigit) suggestions.push('Add numbers.');
  if (!hasSpecial) suggestions.push('Add special characters.');

  // Deduct for pattern repetitions (e.g., aaa, 111)
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    suggestions.push('Avoid repeating characters 3 or more times.');
  }

  // Deduct for sequential numbers or letters
  const sequentialNumbers = /012|123|234|345|456|567|678|789|890|321|432|543|654|765|876|987/;
  if (sequentialNumbers.test(password)) {
    score = Math.max(0, score - 1);
    suggestions.push('Avoid sequential numbers.');
  }

  const finalScore = Math.min(4, Math.max(0, score));

  let label = 'Very Weak';
  let color = 'bg-red-500';
  let percentage = 20;

  switch (finalScore) {
    case 0:
      label = 'Very Weak';
      color = 'bg-red-500';
      percentage = 20;
      break;
    case 1:
      label = 'Weak';
      color = 'bg-orange-500';
      percentage = 40;
      break;
    case 2:
      label = 'Fair';
      color = 'bg-yellow-500';
      percentage = 60;
      break;
    case 3:
      label = 'Strong';
      color = 'bg-emerald-500';
      percentage = 85;
      break;
    case 4:
      label = 'Very Strong';
      color = 'bg-cyan-400';
      percentage = 100;
      break;
  }

  return {
    score: finalScore,
    label,
    color,
    percentage,
    suggestions,
  };
};
