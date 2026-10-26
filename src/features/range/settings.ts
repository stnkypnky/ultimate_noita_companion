// Test range options set on the Settings page (kept per device in localStorage).

export type RangeSettings = {
  /** For slow tablets: no glow, fewer particles, the picture redrawn 30 times a second (the game still runs at 60). */
  performance: boolean;
  /** Frame rate and timings over the range. */
  showFps: boolean;
};

const KEYS: Record<keyof RangeSettings, string> = { performance: 'range-performance', showFps: 'range-fps' };

export function rangeSettings(): RangeSettings {
  const read = (k: string) => {
    try {
      return localStorage.getItem(k) === '1';
    } catch {
      return false;
    }
  };
  return { performance: read(KEYS.performance), showFps: read(KEYS.showFps) };
}

export function setRangeSetting(key: keyof RangeSettings, on: boolean) {
  try {
    localStorage.setItem(KEYS[key], on ? '1' : '0');
  } catch {
    // Private browsing without storage: the setting lasts until the page closes.
  }
}
