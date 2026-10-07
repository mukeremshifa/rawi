import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConnectionStatus, StoragePage } from '@/offline/Recovery';
import { rememberAccount, offlineAccount, clearPrivate, lockDevice, pendingSignOut, markSignOutComplete, setDisconnected, deviceLocked, storageContents } from '@/offline/storage';
import { downloadRecovery } from './learning-hooks';
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
      if (!status.configured) { setActiveAccount(null); setMe(null); setError(`The backend is unavailable. ${status.missing.join(', ')}`); return; }
      if (pendingSignOut()) {
        const result = await authClient.signOut();
        if (result.error) throw new Error('Reconnect to finish signing out before opening an account.');
        markSignOutComplete();
      }
      const account = await request<Me>('/v1/me');
      if (epoch.current === current) {
        await rememberAccount(account).catch(() => setError('Device recovery is unavailable. Export unsent drafts before leaving.'));
        if (epoch.current !== current) return;
        setDisconnected(false); setActiveAccount(account.user.id); setMe(account);
        window.dispatchEvent(new Event('rawi-record-refresh'));
      }
    } catch (e) {
      if (epoch.current !== current) return;
      if (e instanceof OnlineError && e.code === 'network') {
        const cached = await offlineAccount().catch(() => null);
        if (epoch.current !== current) return;
        if (cached) { setActiveAccount(cached.user.id); setMe(cached); return; }
      }
      setActiveAccount(null); setMe(null);
      if (e instanceof OnlineError && e.code === 'unauthenticated') { lockDevice(); }
      if (!(e instanceof OnlineError && e.code === 'unauthenticated')) setError(errorMessage(e));
    } finally { if (epoch.current === current) setChecking(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const invalidate = () => { ++epoch.current; setActiveAccount(null); setMe(null); setChecking(false); };
    const storage = (event: StorageEvent) => { if (event.key === 'rawi.device-lock.v1' && event.newValue !== null) invalidate(); };
    const disconnected = () => setDisconnected(true);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); else setChecking(true); };
    window.addEventListener('rawi-account-invalid', invalidate);
    window.addEventListener('rawi-device-locked', invalidate);
    window.addEventListener('storage', storage);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', disconnected);
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
      window.removeEventListener('rawi-device-locked', invalidate);
      window.removeEventListener('storage', storage);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
      channel.current?.close();
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (me) void offlineAccount().then(account => { if (!account || deviceLocked()) { setActiveAccount(null); setMe(null); setError('Sign in again to renew access to cached content.'); } }); }, 30000);
    return () => clearInterval(timer);
  }, [me]);
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
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/courses', errorCallbackURL: '/?signin=failed' });
      if (result.error) throw new Error('Google sign-in could not start. Check the online configuration and try again.');
    } catch (e) { setError(errorMessage(e)); }
    finally { authBusy.current = false; setBusy(false); }
  };
  const signOut = async () => {
    const drafts = await storageContents().then(s => s.drafts).catch(() => []);
    if (drafts.length) {
      downloadRecovery('rawi-unsent-drafts.json', drafts);
      if (!window.confirm('A recovery copy was downloaded. Sign out and clear private content and drafts from this device?')) return;
    }
    authBusy.current = true;
    ++epoch.current; setActiveAccount(null); setMe(null); setChecking(false); setBusy(true); setError('');
    channel.current?.postMessage('account-changing');
    lockDevice(true);
    try {
      await clearPrivate();
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed. Retry before using another account.');
      channel.current?.postMessage('signed-out');
      markSignOutComplete();
    } catch (e) { setError(errorMessage(e)); }
    finally { authBusy.current = false; setBusy(false); }
  };
  if (location.pathname === '/online' || location.pathname.startsWith('/online/')) return <Navigate replace to={`${location.pathname.slice(7) || '/'}${location.search}${location.hash}`} />;
  return <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
    <header className="border-b px-gutter h-14 shrink-0 flex items-center gap-4">
      <Link to="/" className="font-semibold mr-auto"><Logo /></Link>
      {configured && <Button variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button>}
    </header>
    {me && <ConnectionStatus />}
    <div className="flex min-h-0 flex-1">
    {me && <aside className="hidden lg:flex w-60 shrink-0 flex-col overflow-y-auto border-r"><OnlineNavigation /></aside>}
    <main className="min-w-0 flex-1 overflow-y-auto">
    {me && <details className="lg:hidden border-b"><summary className="p-3">Navigation</summary><OnlineNavigation /></details>}
    {checking && <p role="status" className="p-6">Checking your account…</p>}
    {!checking && !me && <Page className="py-10" width="prose"><PageHeader title="Your learning workspace" description="Sign in with Google to open your saved personal learning workspace." />
      <p>New accounts start empty. Previous browser work can be recovered and reviewed from Workspace data after sign-in. Offline reading needs a previous online visit and an account check within 24 hours.</p>
      {(error || location.search.includes('signin=failed')) && <p role="alert">{error || 'Google sign-in did not finish. Try again.'}</p>}
      <div className="flex gap-3"><Button disabled={!configured || busy} onClick={() => void signIn()}>{busy ? 'Please wait…' : 'Continue with Google'}</Button><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Check again</Button></div>
    </Page>}
    {me && <Account.Provider value={me}><OnlineDraftBoundary key={me.user.id}><div hidden={checking}>
      <p className="px-6 pt-4 text-sm text-muted-foreground">{me.user.email} · {me.preferences.values.workspaceName}</p>
      <Routes>
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/history" element={<OnlineProgress />} />
        <Route path="/welcome" element={<Navigate replace to="/courses" />} />
        <Route path="/course/:id/syllabus" element={<CourseEditor key={location.pathname} />} />
        <Route path="/course/:id/settings" element={<CourseEditor key={location.pathname} />} />
        <Route path="/" element={<OnlineProgress home />} />
        <Route path="/ai/:id" element={<OnlineAiOperation key={location.pathname} />} />
        <Route path="/search" element={<OnlineSearch />} />
        <Route path="/notifications" element={<OnlineNotifications />} />
        <Route path="/data" element={<OnlineTransfer />} />
        <Route path="/planner" element={<OnlinePlanner />} />
        <Route path="/progress" element={<OnlineProgress />} />
        <Route path="/course/:id/progress" element={<OnlineProgress key={location.pathname} />} />
        <Route path="/course/:id/overview" element={<OnlineProgress home key={location.pathname} />} />
        <Route path="/courses" element={<CourseLibrary />} />
        <Route path="/courses/new" element={<NewOnlineCourse />} />
        <Route path="/course/:id" element={<CourseEditor key={location.pathname} />} />
        <Route path="/course/:id/materials" element={<OnlineMaterials key={location.pathname} />} />
        <Route path="/materials/:materialId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/materials/:materialId/versions/:versionId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/materials/:materialId/versions/:versionId/passages/:passageId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/course/:id/tutor" element={<OnlineTutorLibrary key={location.pathname} />} />
        <Route path="/tutor/:id" element={<OnlineTutor key={location.pathname} />} />
        <Route path="/course/:id/exams" element={<OnlineExams key={location.pathname} />} />
        <Route path="/course/:id/practice" element={<OnlinePractice key={location.pathname} />} />
        <Route path="/sets/:id" element={<OnlineSet key={location.pathname} />} />
        <Route path="/runs/:id" element={<OnlineRun key={location.pathname} />} />
        <Route path="/attempts/:id" element={<OnlineAttempt key={location.pathname} />} />
        <Route path="/settings" element={<PreferencesEditor onSaved={preferences => setMe(previous => previous?.workspace.id === preferences.workspaceId ? { ...previous, preferences } : previous)} />} />
        <Route path="*" element={<Page className="py-10"><PageHeader title="Page not found" description="Open a course or your study workspace to continue." /><Button asChild><Link to="/courses">Back to courses</Link></Button></Page>} />
      </Routes>
    </div></OnlineDraftBoundary></Account.Provider>}
    </main></div>
  </div>;
}
