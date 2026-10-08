import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Me } from '@shared/contracts/workspace';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/layout';
import { authClient, RequestError, request, setActiveAccount } from '@/lib/api';
import { CourseLibrary, CourseEditor, NewCourse } from '@/features/courses/Courses';
import { Materials, MaterialReader } from '@/features/materials/Materials';
import { Planner, Progress } from '@/features/planning/Planning';
import { AiOperation } from '@/features/ai/AiOperation';
import { confirmDiscard, DraftBoundary } from '@/lib/hooks';
import { Navigation } from '@/app/Navigation';
import { Logo } from '@/components/Logo';
import { Search, Notifications } from '@/features/support/Support';
import { TutorLibrary, Tutor } from '@/features/tutor/Tutor';
import { Exams } from '@/features/exams/Exams';
import { Practice, PracticeSet, Run, AttemptReview } from '@/features/practice/Practice';

import { AccountSettings, Onboarding } from '@/features/account/AccountSettings';
import { safeReturnTo } from '@/app/return-to';
import { AccountContext } from '@/lib/account';
import { queryClient } from '@/lib/query';
export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'unavailable'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), authBusy = useRef(false);
  const currentAccount = useRef<Me | null>(null);
  const sessionRequest = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const location = useLocation();
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const destination = location.pathname === '/sign-in' ? returnTo : safeReturnTo(location.pathname + location.search + location.hash);
  const clear = useCallback(() => {
    sessionRequest.current?.abort();
    ++epoch.current; setActiveAccount(null); queryClient.clear(); currentAccount.current = null; setMe(null); setState('unauthenticated'); setError('');
  }, []);
  const refresh = useCallback(async () => {
    if (authBusy.current) return;
    const current = ++epoch.current;
    sessionRequest.current?.abort();
    const controller = new AbortController(); sessionRequest.current = controller;
    try {
      const account = await request<Me>('/v1/me', undefined, undefined, 'GET', controller.signal);
      if (epoch.current !== current) return;
      // A different account must never see the previous account's cache.
      if (currentAccount.current && currentAccount.current.user.id !== account.user.id) queryClient.clear();
      setActiveAccount(account.user.id); currentAccount.current = account; setMe(account); setState('authenticated'); setError('');
      channel.current?.postMessage({ type: 'identity', id: account.user.id });
    } catch (e) {
      if (epoch.current !== current) return;
      if (e instanceof RequestError && (e.code === 'unauthenticated' || e.code === 'account_changed')) clear();
      else { setState('unavailable'); setError('We could not reach your account. Keep this page open and try again.'); }
    }
  }, [clear]);
  useEffect(() => {
    const invalid = () => { clear(); channel.current?.postMessage({ type: 'signed-out' }); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('rawi-online-auth');
      channel.current.onmessage = event => {
        if (event.data?.type === 'identity') {
          if (currentAccount.current?.user.id !== event.data.id) { clear(); void refresh(); }
        } else clear();
      };
    }
    void refresh();
    window.addEventListener('rawi-account-invalid', invalid);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      ++epoch.current; setActiveAccount(null);
      sessionRequest.current?.abort();
      window.removeEventListener('rawi-account-invalid', invalid);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
      channel.current?.close();
    };
  }, [refresh, clear]);
  useEffect(() => {
    const preferences = me?.preferences.values;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', preferences?.theme === 'dark' || ((!preferences || preferences.theme === 'system') && media.matches));
    apply(); media.addEventListener('change', apply);
    document.documentElement.dataset.readingSize = preferences?.readingSize ?? 'normal';
    document.documentElement.dataset.motion = preferences?.motion ?? 'system';
    return () => media.removeEventListener('change', apply);
  }, [me?.preferences]);
  const signIn = async () => {
    authBusy.current = true; ++epoch.current; setBusy(true); setError('');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: destination, errorCallbackURL: `/sign-in?error=signin&returnTo=${encodeURIComponent(destination)}` });
      if (result.error) throw new Error('Google sign-in could not start. Please try again.');
    } catch { setError('Google sign-in did not finish. Please try again.'); }
    finally { authBusy.current = false; setBusy(false); }
  };
  const signOut = async () => {
    if (!confirmDiscard()) return;
    authBusy.current = true; ++epoch.current; setBusy(true); setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      clear(); channel.current?.postMessage({ type: 'signed-out' });
    } catch { setError('Sign-out did not complete. Your session may still be active. Try signing out again.'); }
    finally { authBusy.current = false; setBusy(false); }
  };
  if (location.pathname === '/online' || location.pathname.startsWith('/online/')) return <Navigate replace to={`${/^\/online\/course\/[^/]+$/.test(location.pathname) ? location.pathname.slice(7) + '/syllabus' : location.pathname.slice(7) || '/'}${location.search}${location.hash}`} />;
  if (state === 'unauthenticated' && location.pathname !== '/sign-in') return <Navigate replace to={`/sign-in?returnTo=${encodeURIComponent(destination)}`} />;
  return <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
    <header className="border-b px-gutter h-14 shrink-0 flex items-center gap-4">
      <Link to="/" className="font-semibold mr-auto"><Logo /></Link>
      {me && <details className="relative"><summary className="cursor-pointer rounded-md border px-3 py-2 text-sm">{me.user.name || 'Your account'}</summary><div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border bg-background p-4 shadow-lg space-y-3"><p className="font-medium">{me.user.name}</p><p className="break-words text-sm text-muted-foreground">{me.user.email}</p><Link className="block underline" to="/settings/profile">Account and profile</Link><Link className="block underline" to="/settings/preferences">Study preferences</Link><Button variant="outline" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</Button></div></details>}
    </header>
    <div className="flex min-h-0 flex-1">
      {me && me.preferences.values.onboardingCompleted && <aside className="hidden lg:flex w-60 shrink-0 flex-col overflow-y-auto border-r"><Navigation /></aside>}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {state === 'checking' && <p role="status" className="p-6">Opening your workspace…</p>}
        {!me && state !== 'checking' && <Page className="py-16" width="prose"><div className="rounded-xl border p-8 space-y-6"><PageHeader title={state === 'unavailable' ? 'We could not open your account' : 'Welcome to Rawi'} description="Your courses, practice and study plans, together in your personal workspace." />
          <p className="text-muted-foreground">Sign in to pick up where you left off, or start with an empty workspace and make it yours.</p>
          {(error || new URLSearchParams(location.search).has('error')) && <p role="alert">{error || 'Google sign-in was cancelled or did not finish. Please try again.'}</p>}
          <div className="flex flex-wrap gap-3">{state !== 'unavailable' && <Button disabled={busy} onClick={() => void signIn()}>{busy ? 'Connecting…' : 'Continue with Google'}</Button>}{state === 'unavailable' && <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Try again</Button>}</div>
        </div></Page>}
        {me && <AccountContext.Provider value={me}><DraftBoundary key={me.user.id}>
          {error && <div role="alert" className="border-b p-4">{error} <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Retry connection</Button></div>}
          {!me.preferences.values.onboardingCompleted ? <Onboarding onSaved={account => { currentAccount.current = account; setMe(account); }} /> : <>
          <details className="lg:hidden border-b"><summary className="p-3">Navigation</summary><Navigation /></details>
      <Routes>
        <Route path="/sign-in" element={<Navigate replace to={returnTo} />} />
        <Route path="/storage" element={<Navigate replace to="/settings" />} />
        <Route path="/history" element={<Progress />} />
        <Route path="/welcome" element={<Navigate replace to="/courses" />} />
        <Route path="/course/:id/syllabus" element={<CourseEditor key={location.pathname} />} />
        <Route path="/course/:id/settings" element={<CourseEditor key={location.pathname} />} />
        <Route path="/planner/availability" element={<Planner />} />
        <Route path="/settings/:section" element={<AccountSettings onProfile={user => setMe(previous => previous?.user.id === user.id ? { ...previous, user } : previous)} onSaved={preferences => setMe(previous => previous ? { ...previous, preferences } : previous)} />} />
        <Route path="/course/:id/progress/topic/:topicId" element={<Progress key={location.pathname} />} />
        <Route path="/" element={<Progress home />} />
        <Route path="/ai/:id" element={<AiOperation key={location.pathname} />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/data" element={<Navigate replace to="/settings" />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/course/:id/progress" element={<Progress key={location.pathname} />} />
        <Route path="/course/:id/overview" element={<Progress home key={location.pathname} />} />
        <Route path="/courses" element={<CourseLibrary />} />
        <Route path="/courses/new" element={<NewCourse />} />
        <Route path="/course/:id" element={<Progress home key={location.pathname} />} />
        <Route path="/course/:id/materials" element={<Materials key={location.pathname} />} />
        <Route path="/materials/:materialId" element={<MaterialReader key={location.pathname} />} />
        <Route path="/materials/:materialId/versions/:versionId" element={<MaterialReader key={location.pathname} />} />
        <Route path="/materials/:materialId/versions/:versionId/passages/:passageId" element={<MaterialReader key={location.pathname} />} />
        <Route path="/course/:id/tutor" element={<TutorLibrary key={location.pathname} />} />
        <Route path="/tutor/:id" element={<Tutor key={location.pathname} />} />
        <Route path="/course/:id/exams" element={<Exams key={location.pathname} />} />
        <Route path="/course/:id/practice" element={<Practice key={location.pathname} />} />
        <Route path="/sets/:id" element={<PracticeSet key={location.pathname} />} />
        <Route path="/runs/:id" element={<Run key={location.pathname} />} />
        <Route path="/attempts/:id" element={<AttemptReview key={location.pathname} />} />
        <Route path="/settings" element={<AccountSettings onProfile={user => setMe(previous => previous?.user.id === user.id ? { ...previous, user } : previous)} onSaved={preferences => setMe(previous => previous?.workspace.id === preferences.workspaceId ? { ...previous, preferences } : previous)} />} />
        <Route path="*" element={<Page className="py-10"><PageHeader title="Page not found" description="Open a course or your study workspace to continue." /><Button asChild><Link to="/courses">Back to courses</Link></Button></Page>} />
      </Routes>
          </>}
        </DraftBoundary></AccountContext.Provider>}
      </main>
    </div>
  </div>;
}
