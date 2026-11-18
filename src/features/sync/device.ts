// This device's identity for sync: a random id and a name the player can change.

const ID_KEY = 'device-id';
const NAME_KEY = 'device-name';

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the id just won't survive a reload */
  }
};

export function randomId(bytes = 8): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

let cachedId: string | null = null;
export function deviceId(): string {
  cachedId ??= safeGet(ID_KEY) ?? (() => {
    const id = randomId();
    safeSet(ID_KEY, id);
    return id;
  })();
  return cachedId;
}

/** A readable default from the user agent: "Windows PC", "Android phone", "iPad", … */
export function defaultDeviceName(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (/Silk|KF[A-Z]{2,}/.test(ua)) return 'Fire tablet';
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'This device';
}

export const deviceName = () => safeGet(NAME_KEY)?.trim() || defaultDeviceName();
export const setDeviceName = (name: string) => safeSet(NAME_KEY, name.trim().slice(0, 40));
