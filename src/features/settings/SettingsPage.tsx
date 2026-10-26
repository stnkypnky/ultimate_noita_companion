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
  const progress = useProgress((s) => s.progress);
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
            text={progress ? 'Only show what your synced save has found.' : 'Hide everything until you sync your progress.'}
          />
          <ModeCard active={mode === 'all'} onClick={() => setMode('all')} icon={<Eye size={18} />} title="Show everything" text="No spoiler protection." />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <Link to="/progress" className="text-ember hover:underline">
            Manage progress sync
          </Link>
          {revealed.length > 0 && (
            <button onClick={() => useProgress.setState({ revealed: [] })} className="inline-flex items-center gap-1.5 hover:text-ink">
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
            text="For slower tablets and phones: no glow, fewer particles, and the picture redrawn 30 times a second. Spells behave the same."
          />
          <RangeToggle setting="showFps" title="Show frame rate" text="Frame rate and timings in the corner of the range, to see how your device keeps up." />
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
