// Which version of the app this is (set at build time from the latest commit).
declare const __APP_BUILD__: number;
declare const __APP_COMMIT__: string;

/** The commit's time (ms): a bigger number is a newer version. */
export const APP_BUILD: number = typeof __APP_BUILD__ === 'number' ? __APP_BUILD__ : 0;
export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';

/** "Nov 21, 2026 · ee5085e" */
export const versionLabel = (build = APP_BUILD, commit?: string) =>
  [build ? new Date(build).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown', commit]
    .filter(Boolean)
    .join(' · ');
