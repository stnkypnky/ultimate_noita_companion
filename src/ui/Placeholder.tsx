import { Page } from './Page';

export function Placeholder({ title }: { title: string }) {
  return (
    <Page title={title}>
      <div className="mt-6 grid place-items-center rounded-[var(--radius)] border border-dashed border-line-strong bg-surface/50 px-6 py-20 text-center">
        <div>
          <div className="font-display text-lg text-gold">Under construction</div>
          <p className="mt-1 text-sm text-muted">The alchemists are still brewing this one.</p>
        </div>
      </div>
    </Page>
  );
}
