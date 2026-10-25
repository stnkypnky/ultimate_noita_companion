import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { MorePage } from '@/features/home/MorePage';
import { Placeholder } from '@/ui/Placeholder';
import { SpellsPage } from '@/features/spells/SpellsPage';
import { PerksPage } from '@/features/perks/PerksPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { ImportPage } from '@/features/progress/ImportPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { NotFound } from '@/ui/NotFound';

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'more', element: <MorePage /> },
        { path: 'wand', element: <Placeholder title="Wand Builder" /> },
        { path: 'spells/:id?', element: <SpellsPage /> },
        { path: 'perks/:id?', element: <PerksPage /> },
        { path: 'items/:id?', element: <Placeholder title="Items" /> },
        { path: 'materials/:id?', element: <MaterialsPage /> },
        { path: 'alchemy', element: <Placeholder title="Alchemy" /> },
        { path: 'progress', element: <ProgressPage /> },
        { path: 'import', element: <ImportPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
