import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { OnlineApp } from '@/online/OnlineApp';
import '@/styles/globals.css';
import { retireBrowserStorage } from '@/retire-storage';
retireBrowserStorage();
const router = createBrowserRouter([{ path: '*', element: <OnlineApp /> }]);
createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><TooltipProvider delayDuration={300}>
    <RouterProvider router={router} /><Toaster />
  </TooltipProvider></ErrorBoundary></StrictMode>,
);
