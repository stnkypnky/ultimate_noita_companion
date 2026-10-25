import { createBrowserRouter } from 'react-router';
import { Layout } from './Layout';
import { HomePage } from '@/features/home/HomePage';
import { MorePage } from '@/features/home/MorePage';
import { Placeholder } from '@/ui/Placeholder';
import { SpellsPage } from '@/features/spells/SpellsPage';
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
        { path: 'perks/:id?', element: <Placeholder title="Perks" /> },
        { path: 'items/:id?', element: <Placeholder title="Items" /> },
        { path: 'materials/:id?', element: <Placeholder title="Materials" /> },
        { path: 'alchemy', element: <Placeholder title="Alchemy" /> },
        { path: 'progress', element: <Placeholder title="Progress Sync" /> },
        { path: 'settings', element: <Placeholder title="Settings" /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
