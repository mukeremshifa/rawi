import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import type { Me } from '@shared/online';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/layout';
import { authClient, errorMessage, OnlineError, request, setActiveAccount } from './api';
import { CourseLibrary, CourseEditor, NewOnlineCourse, PreferencesEditor } from './pages';
import { OnlineMaterials, OnlineMaterialReader } from './Materials';

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
  return <div className="h-dvh overflow-auto bg-background text-foreground">
    <header className="border-b p-4 flex flex-wrap items-center gap-4">
      <Link to="/online" className="font-semibold">Rawi</Link><span className="rounded border px-2 py-1 text-xs">Online mode</span>
      <Link to="/online/courses">Courses</Link><Link to="/online/settings">Preferences</Link>
      <a href="/courses" className="ml-auto underline">Switch to local mode</a>
      {configured && <Button variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button>}
    </header>
    {checking && <p role="status" className="p-6">Checking your online account…</p>}
    {!checking && !me && <Page className="py-10" width="prose"><PageHeader title="Your online workspace" description="Sign in with Google to save courses, topics and preferences to your personal account." />
      <p>Local work remains available in local mode on this browser. Signing in does not upload or replace it. Import will be available in a later checkpoint.</p>
      {(error || location.search.includes('signin=failed')) && <p role="alert">{error || 'Google sign-in did not finish. Try again.'}</p>}
      <div className="flex gap-3"><Button disabled={!configured || busy} onClick={() => void signIn()}>{busy ? 'Please wait…' : 'Continue with Google'}</Button><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Check again</Button></div>
    </Page>}
    {me && <Account.Provider value={me}><div hidden={checking} key={me.user.id}>
      <p className="px-6 pt-4 text-sm text-muted-foreground">{me.user.email} · {me.preferences.values.workspaceName}</p>
      <Routes>
        <Route path="/online" element={<Page className="py-10"><PageHeader title="Your online workspace" description="Your courses and outlines are saved to your account." /><Button asChild><Link to="/online/courses">Open courses</Link></Button></Page>} />
        <Route path="/online/courses" element={<CourseLibrary />} />
        <Route path="/online/courses/new" element={<NewOnlineCourse />} />
        <Route path="/online/course/:id" element={<CourseEditor key={location.pathname} />} />
        <Route path="/online/course/:id/materials" element={<OnlineMaterials key={location.pathname} />} />
        <Route path="/online/materials/:materialId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/online/materials/:materialId/versions/:versionId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/online/materials/:materialId/versions/:versionId/passages/:passageId" element={<OnlineMaterialReader key={location.pathname} />} />
        <Route path="/online/settings" element={<PreferencesEditor onSaved={preferences => setMe(previous => previous?.workspace.id === preferences.workspaceId ? { ...previous, preferences } : previous)} />} />
        <Route path="*" element={<Page className="py-10"><PageHeader title="This area is not available online yet" description="Tutoring, practice, exams, planning and history are available in local mode. Online mode does not save learning activity on this device." /><Button asChild><Link to="/online/courses">Back to courses</Link></Button></Page>} />
      </Routes>
    </div></Account.Provider>}
  </div>;
}
