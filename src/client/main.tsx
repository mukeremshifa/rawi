import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmProvider } from '@/components/ui/alert-dialog';
import { App } from '@/app/App';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query';
import '@/styles/globals.css';
import { retireBrowserStorage } from '@/app/retire-storage';
retireBrowserStorage();
const router = createBrowserRouter([{ path: '*', element: <App /> }]);
createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><TooltipProvider delayDuration={300}><ConfirmProvider>
    <RouterProvider router={router} /><Toaster />
  </ConfirmProvider></TooltipProvider></QueryClientProvider></ErrorBoundary></StrictMode>,
);
