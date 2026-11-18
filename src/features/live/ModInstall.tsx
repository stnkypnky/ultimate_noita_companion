// How to install the companion mod: on Settings and on the Run page when no game is running.
export function ModInstall() {
  return (
    <div className="space-y-3 panel p-4 text-sm text-muted">
      <p>
        An optional Noita mod shows your current run here and on your paired devices as you play: health, gold, biome, perks, flasks and
        every wand, with <b className="text-ink">Open in builder</b> to test a wand you're carrying.
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Download{' '}
          <a className="text-ember hover:underline" href={`${import.meta.env.BASE_URL}mod/noita_companion.zip`} download>
            noita_companion.zip
          </a>{' '}
          and unzip it into <code className="text-ink">Noita\mods</code> (in Steam: right-click Noita → Manage → Browse local files). If you
          already have it, replace the old folder to get the newest version.
        </li>
        <li>
          In Noita, open <b className="text-ink">Mods</b>, turn on <b className="text-ink">Noita Companion Live</b>, and allow unsafe mods.
        </li>
        <li>Start a run with this companion watching your save folder (Progress Sync, live sync on).</li>
      </ol>
      <p className="text-xs text-faint">
        Noita calls it “unsafe” because it writes a file: the mod writes only <code>companion_live.json</code> into your save folder, and
        nothing goes online.
      </p>
    </div>
  );
}
