import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Standard page frame: sticky title bar (with optional toolbar such as search/filters) + constrained content.
 * Publishes the header's height as --page-header-h so other sticky elements can sit below it.
 */
export function Page({
  title,
  subtitle,
  actions,
  toolbar,
  children,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--page-header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-[1600px]' : 'max-w-5xl'} px-4 md:px-8`}>
      <header ref={ref} className="safe-top sticky top-0 z-20 -mx-4 bg-bg/85 px-4 pt-5 pb-3 backdrop-blur-md md:-mx-8 md:px-8 md:pt-7">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold tracking-wide md:text-3xl">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {toolbar && <div className="mt-3 space-y-3">{toolbar}</div>}
      </header>
      <div className="pt-1 pb-8">{children}</div>
    </div>
  );
}
