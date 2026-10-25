import { createBrowserRouter, type RouteObject } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { MorePage } from '@/features/home/MorePage';
import { NotFound } from '@/ui/NotFound';

// Pages load on demand (the service worker still precaches every chunk for offline use).
const page = (load: () => Promise<{ default: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'more', element: <MorePage /> },
        { path: 'wand', ...page(() => import('@/features/wand/WandPage').then((m) => ({ default: m.WandPage }))) },
        { path: 'spells/:id?', ...page(() => import('@/features/spells/SpellsPage').then((m) => ({ default: m.SpellsPage }))) },
        { path: 'perks/:id?', ...page(() => import('@/features/perks/PerksPage').then((m) => ({ default: m.PerksPage }))) },
        { path: 'items/:id?', ...page(() => import('@/features/items/ItemsPage').then((m) => ({ default: m.ItemsPage }))) },
        { path: 'materials/:id?', ...page(() => import('@/features/materials/MaterialsPage').then((m) => ({ default: m.MaterialsPage }))) },
        { path: 'alchemy', ...page(() => import('@/features/alchemy/AlchemyPage').then((m) => ({ default: m.AlchemyPage }))) },
        { path: 'progress', ...page(() => import('@/features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage }))) },
        { path: 'import', ...page(() => import('@/features/progress/ImportPage').then((m) => ({ default: m.ImportPage }))) },
        { path: 'settings', ...page(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))) },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
