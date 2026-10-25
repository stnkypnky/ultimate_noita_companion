import type { ReactNode } from 'react';

/** Standard page frame: sticky title bar + constrained content width. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-[1600px]' : 'max-w-5xl'} px-4 md:px-8`}>
      <header className="safe-top sticky top-0 z-20 -mx-4 flex items-end gap-3 bg-bg/80 px-4 pt-5 pb-3 backdrop-blur-md md:-mx-8 md:px-8 md:pt-7">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold tracking-wide md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="pb-8">{children}</div>
    </div>
  );
}
