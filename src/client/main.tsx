import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, createBrowserRouter, RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';
import { ThemeProvider } from '@/components/theme.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import { Toaster } from '@/components/ui/sonner.tsx';
import { StoreProvider } from '@/store/store.tsx';
import { AppRoutes } from '@/routes.tsx';
import { OnlineApp } from '@/online/OnlineApp';

import '@/styles/globals.css';

// Online routes never mount the local store. Mode links load a fresh root,
// clearing online memory while preserving rawi.state.v1 on this browser.

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');
const online = window.location.pathname === '/online' || window.location.pathname.startsWith('/online/');
const onlineRouter = online ? createBrowserRouter([{ path: '*', element: <OnlineApp /> }]) : null;

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      {onlineRouter ? <RouterProvider router={onlineRouter} /> : <StoreProvider>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <AppRoutes />
              <Toaster />
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </StoreProvider>}
    </ErrorBoundary>
  </StrictMode>,
);
