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
  if (key === 'performance') applyGlow(on);
}

/**
 * UI bloom (the glow on secret items) is for capable devices: off in performance mode, and on devices that
 * report 4 or fewer CPU cores or 4 GB or less of memory. Sets <html data-lite> for the CSS.
 */
export function applyGlow(performance = rangeSettings().performance) {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  if (performance || weak) document.documentElement.dataset.lite = '';
  else delete document.documentElement.dataset.lite;
}
