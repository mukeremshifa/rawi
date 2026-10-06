import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import type { Me } from '@shared/online';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/layout';
import { authClient, errorMessage, OnlineError, request, setActiveAccount } from './api';
import { CourseLibrary, CourseEditor, NewOnlineCourse, PreferencesEditor } from './pages';
import { OnlineMaterials, OnlineMaterialReader } from './Materials';
import { OnlinePlanner, OnlineProgress } from './Planning';
import { OnlineAiOperation } from './Ai';
import { OnlineDraftBoundary } from './learning-hooks';
import { OnlineNavigation } from './Navigation';
import { Logo } from '@/components/Logo';
import { OnlineSearch, OnlineNotifications } from './Support';
import { OnlineTransfer } from './Transfer';
import { OnlineTutorLibrary, OnlineTutor } from './Tutor';
import { OnlineExams } from './Exams';
import { OnlinePractice, OnlineSet, OnlineRun, OnlineAttempt } from './Practice';

const Account = createContext<Me | null>(null);
export function useAccount() {
  const value = useContext(Account);
  if (!value) throw new Error('An online account is required');
  return value;
}
export function OnlineApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const authBusy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const location = useLocation();
  const refresh = useCallback(async () => {
    if (authBusy.current) return;
    const current = ++epoch.current;
    setChecking(true); setError('');
    try {
      const status = await request<{ configured: boolean; missing: string[] }>('/status');
      if (epoch.current !== current) return;
      setConfigured(status.configured);
      if (!status.configured) { setActiveAccount(null); setMe(null); setError(`Online mode is unavailable. ${status.missing.join(', ')}`); return; }
      const account = await request<Me>('/v1/me');
      if (epoch.current === current) { setActiveAccount(account.user.id); setMe(account); }
    } catch (e) {
      if (epoch.current !== current) return;
      setActiveAccount(null); setMe(null);
      if (!(e instanceof OnlineError && e.code === 'unauthenticated')) setError(errorMessage(e));
    } finally { if (epoch.current === current) setChecking(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const invalidate = () => { ++epoch.current; setActiveAccount(null); setMe(null); void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); else setChecking(true); };
    window.addEventListener('rawi-account-invalid', invalidate);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('rawi-online-auth');
      channel.current.onmessage = event => {
        if (event.data === 'account-changing') { ++epoch.current; setActiveAccount(null); setMe(null); setChecking(false); }
        else invalidate();
      };
    }
    return () => {
      ++epoch.current; setActiveAccount(null);
      window.removeEventListener('rawi-account-invalid', invalidate);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
      channel.current?.close();
    };
  }, [refresh]);
  useEffect(() => {
    const preferences = me?.preferences.values;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', preferences?.theme === 'dark' || ((!preferences || preferences.theme === 'system') && media.matches));
    apply(); media.addEventListener('change', apply);
    document.documentElement.dataset.readingSize = preferences?.readingSize ?? 'normal';
    document.documentElement.dataset.motion = preferences?.motion ?? 'system';
    return () => media.removeEventListener('change', apply);
  }, [me]);
  const signIn = async () => {
    authBusy.current = true;
    ++epoch.current; setActiveAccount(null); setMe(null); setBusy(true); setError('');
    channel.current?.postMessage('account-changing');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/online/courses', errorCallbackURL: '/online?signin=failed' });
      if (result.error) throw new Error('Google sign-in could not start. Check the online configuration and try again.');
    } catch (e) { setError(errorMessage(e)); }
    finally { authBusy.current = false; setBusy(false); }
  };
  const signOut = async () => {
    authBusy.current = true;
    ++epoch.current; setActiveAccount(null); setMe(null); setChecking(false); setBusy(true); setError('');
    channel.current?.postMessage('account-changing');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed. Retry before using another account.');
      channel.current?.postMessage('signed-out');
    } catch (e) { setError(errorMessage(e)); }
    finally { authBusy.current = false; setBusy(false); }
  };
  return <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
    <header className="border-b px-gutter h-14 shrink-0 flex items-center gap-4">
      <Link to="/online" className="font-semibold"><Logo /></Link><span className="rounded border px-2 py-1 text-xs">Online mode</span>
      <a href="/courses" className="ml-auto underline">Switch to local mode</a>
      {configured && <Button variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button>}
    </header>
    <div className="flex min-h-0 flex-1">
    {me && <aside className="hidden lg:flex w-60 shrink-0 flex-col overflow-y-auto border-r"><OnlineNavigation /></aside>}
    <main className="min-w-0 flex-1 overflow-y-auto">
    {me && <details className="lg:hidden border-b"><summary className="p-3">Navigation</summary><OnlineNavigation /></details>}
    {checking && <p role="status" className="p-6">Checking your online account…</p>}
    {!checking && !me && <Page className="py-10" width="prose"><PageHeader title="Your online workspace" description="Sign in with Google to open your saved personal learning workspace." />
      <p>Local work remains available in local mode on this browser. Signing in does not upload or replace it. Workspace data offers an explicit reviewed local import after sign-in.</p>
      {(error || location.search.includes('signin=failed')) && <p role="alert">{error || 'Google sign-in did not finish. Try again.'}</p>}
      <div className="flex gap-3"><Button disabled={!configured || busy} onClick={() => void signIn()}>{busy ? 'Please wait…' : 'Continue with Google'}</Button><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Check again</Button></div>
    </Page>}
    {me && <Account.Provider value={me}><OnlineDraftBoundary key={me.user.id}><div hidden={checking}>
      <p className="px-6 pt-4 text-sm text-muted-foreground">{me.user.email} · {me.preferences.values.workspaceName}</p>
      <Routes>
        <Route path="/online" element={<OnlineProgress home />} />
        <Route path="/online/ai/:id" element={<OnlineAiOperation key={location.pathname} />} />
        <Route path="/online/search" element={<OnlineSearch />} />
        <Route path="/online/notifications" element={<OnlineNotifications />} />
        <Route path="/online/data" element={<OnlineTransfer />} />
        <Route path="/online/planner" element={<OnlinePlanner />} />
        <Route path="/online/progress" element={<OnlineProgress />} />
        <Route path="/online/course/:id/progress" element={<OnlineProgress key={location.pathname} />} />
        <Route path="/online/course/:id/overview" element={<OnlineProgress home key={location.pathname} />} />
        <Route path="/online/courses" element={<CourseLibrary />} />
        <Route path="/online/courses/new" element={<NewOnlineCourse />} />
        <Route path="/online/course/:id" element={<CourseEditor key={location.pathname} />} />
        <Route path="/online/course/:id/materials" element={<OnlineMaterials key={location.pathname} />} />
        <Route path="/online/materials/:materialId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/online/materials/:materialId/versions/:versionId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/online/materials/:materialId/versions/:versionId/passages/:passageId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/online/course/:id/tutor" element={<OnlineTutorLibrary key={location.pathname} />} />
        <Route path="/online/tutor/:id" element={<OnlineTutor key={location.pathname} />} />
        <Route path="/online/course/:id/exams" element={<OnlineExams key={location.pathname} />} />
        <Route path="/online/course/:id/practice" element={<OnlinePractice key={location.pathname} />} />
        <Route path="/online/sets/:id" element={<OnlineSet key={location.pathname} />} />
        <Route path="/online/runs/:id" element={<OnlineRun key={location.pathname} />} />
        <Route path="/online/attempts/:id" element={<OnlineAttempt key={location.pathname} />} />
        <Route path="/online/settings" element={<PreferencesEditor onSaved={preferences => setMe(previous => previous?.workspace.id === preferences.workspaceId ? { ...previous, preferences } : previous)} />} />
        <Route path="*" element={<Page className="py-10"><PageHeader title="Page not found" description="Open a course or your study workspace to continue." /><Button asChild><Link to="/online/courses">Back to courses</Link></Button></Page>} />
      </Routes>
    </div></OnlineDraftBoundary></Account.Provider>}
    </main></div>
  </div>;
}
