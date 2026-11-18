import { useState } from 'react';
import { Link } from 'react-router';
import { rangeSettings, setRangeSetting, type RangeSettings } from '@/features/range/settings';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useGameData } from '@/data/store';
import { useProgress } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Section } from '@/ui/controls';

export function SettingsPage() {
  const mode = useProgress((s) => s.mode);
  const setMode = useProgress((s) => s.setMode);
  const revealed = useProgress((s) => s.revealed);
  const version = useGameData((s) => s.version);

  return (
    <Page title="Settings">
      <Section title="Spoilers">
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeCard
            active={mode === 'progress'}
            onClick={() => setMode('progress')}
            icon={<EyeOff size={18} />}
            title="Hide undiscovered"
            text="Only show what your synced save has found."
          />
          <ModeCard active={mode === 'all'} onClick={() => setMode('all')} icon={<Eye size={18} />} title="Show everything" text="No spoiler protection." />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Link to="/progress" className="text-ember hover:underline">
            Manage progress sync
          </Link>
          {revealed.length > 0 && (
            <button onClick={() => useProgress.getState().hideAll()} className="inline-flex items-center gap-1.5 hover:text-ink">
              <RotateCcw size={14} /> Re-hide {revealed.length} individually revealed item{revealed.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </Section>

      <Section title="Test range">
        <div className="grid gap-2 sm:grid-cols-2">
          <RangeToggle
            setting="performance"
            title="Performance mode"
            text="For slower tablets and phones: no glow (here and on secret items), fewer particles, and the picture redrawn 30 times a second. Spells behave the same."
          />
          <RangeToggle setting="showFps" title="Show frame rate" text="Frame rate and timings in the corner of the range, to see how your device keeps up." />
        </div>
      </Section>

      <Section title="Live run (companion mod)">
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
              and unzip it into <code className="text-ink">Noita\mods</code> (in Steam: right-click Noita → Manage → Browse local files).
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
      </Section>

      <Section title="About">
        <div className="space-y-2 panel p-4 text-sm text-muted">
          <p>
            Ultimate Noita Companion is an unofficial fan project and isn't affiliated with Nolla Games. Game data, art and scripts are © Nolla
            Games and are extracted from the game for reference.
          </p>
          {version && (
            <p className="text-xs text-faint">
              Game data: build {version.gameHash.slice(0, 10)} ({version.branch}), extracted {new Date(version.extractedAt).toLocaleDateString()}
            </p>
          )}
          <p>
            <a className="text-ember hover:underline" href="https://github.com/stnkypnky/ultimate_noita_companion" target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
          </p>
        </div>
      </Section>
    </Page>
  );
}

/** An on/off test range setting (stored on this device). */
function RangeToggle({ setting, title, text }: { setting: keyof RangeSettings; title: string; text: string }) {
  const [on, setOn] = useState(() => rangeSettings()[setting]);
  return (
    <button
      onClick={() => {
        setRangeSetting(setting, !on);
        setOn(!on);
      }}
      role="switch"
      aria-checked={on}
      data-active={on || undefined}
      className="slot slot-hover flex items-start gap-3 p-4 text-left"
    >
      <span className={`mt-0.5 grid h-5 w-9 shrink-0 items-center px-0.5 ${on ? 'bg-ember' : 'bg-black/60'}`} aria-hidden>
        <span className={`h-4 w-4 bg-ink transition-transform ${on ? 'translate-x-4' : ''}`} />
      </span>
      <span>
        <span className="font-game block text-[16px]">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </button>
  );
}

function ModeCard({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="slot slot-hover flex items-start gap-3 p-4 text-left">
      <span className={active ? 'text-ember' : 'text-muted'}>{icon}</span>
      <span>
        <span className="font-game block text-[16px]">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </button>
  );
}
