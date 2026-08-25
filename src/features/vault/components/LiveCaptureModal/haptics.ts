export type HapticType = 'light' | 'medium' | 'heavy' | 'tick' | 'shutter' | 'success' | 'warning';

export const triggerHaptic = (type: HapticType = 'light'): void => {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'tick':
        navigator.vibrate(8);
        break;
      case 'light':
        navigator.vibrate(15);
        break;
      case 'medium':
        navigator.vibrate(30);
        break;
      case 'heavy':
        navigator.vibrate(50);
        break;
      case 'shutter':
        navigator.vibrate([20, 30, 20]);
        break;
      case 'success':
        navigator.vibrate([15, 30, 45]);
        break;
      case 'warning':
        navigator.vibrate([35, 40, 35]);
        break;
      default:
        navigator.vibrate(15);
    }
  } catch {
    // Vibration failed or blocked by permissions policy
  }
};
