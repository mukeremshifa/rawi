import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { Me } from '@shared/contracts/workspace';
import { authClient, RequestError, request, setActiveAccount } from '@/lib/api';
import { CourseLibrary } from '@/features/courses/Courses';
import { CourseEditor } from '@/features/courses/Syllabus';
import { MaterialReader } from '@/features/materials/Reader';
import { Materials } from '@/features/materials/Library';
import { Planner } from '@/features/planning/Planning';
import { Home } from '@/features/home/Home';
import { CourseOverview } from '@/features/courses/CourseOverview';
import { Progress } from '@/features/progress/Progress';
import { AiOperation } from '@/features/ai/AiOperation';
import { DraftBoundary, hasUnsavedEdits } from '@/lib/hooks';
import { Shell } from '@/app/Shell';
import { CheckingScreen, ConnectionBanner, SignInScreen, UnavailableScreen } from '@/app/AuthScreens';
import { NotFound } from '@/app/NotFound';
import { useConfirm } from '@/components/ui/alert-dialog';
import { Search, Notifications } from '@/features/support/Support';
import { TutorLibrary, Tutor } from '@/features/tutor/Tutor';
import { Exams } from '@/features/exams/Exams';
import { Run, AttemptReview } from '@/features/practice/Practice';
import { Practice } from '@/features/practice/PracticeHome';
import { PracticeSet } from '@/features/practice/SetDetail';

import { Onboarding } from '@/features/account/AccountSettings';
import { Settings } from '@/features/account/Settings';
import { safeReturnTo } from '@/app/return-to';
import { AccountContext } from '@/lib/account';
import { queryClient } from '@/lib/query';
// The component gallery never ships: the import is dropped from production builds.
const Kit = import.meta.env.DEV ? lazy(() => import('@/features/dev/Kit')) : null;

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'unavailable'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which action the banner's Retry repeats: the connection check or sign-out.
  const [failed, setFailed] = useState<'connection' | 'sign-out'>('connection');
  const epoch = useRef(0), authBusy = useRef(false);
  const currentAccount = useRef<Me | null>(null);
  const sessionRequest = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const location = useLocation();
  const confirm = useConfirm();
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
      else { setFailed('connection'); setState('unavailable'); setError('We could not reach your account. Keep this page open and try again.'); }
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
    if (hasUnsavedEdits() && !await confirm({ title: 'Sign out without saving?', description: 'Your unsaved changes will be lost.', confirmLabel: 'Discard and sign out', cancelLabel: 'Keep editing', destructive: true })) return;
    authBusy.current = true; ++epoch.current; setBusy(true); setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      clear(); channel.current?.postMessage({ type: 'signed-out' });
    } catch { setFailed('sign-out'); setError('Sign-out did not complete, so your session may still be active. Try signing out again.'); }
    finally { authBusy.current = false; setBusy(false); }
  };
  if (location.pathname === '/online' || location.pathname.startsWith('/online/')) return <Navigate replace to={`${/^\/online\/course\/[^/]+$/.test(location.pathname) ? location.pathname.slice(7) + '/syllabus' : location.pathname.slice(7) || '/'}${location.search}${location.hash}`} />;
  if (state === 'unauthenticated' && location.pathname !== '/sign-in') return <Navigate replace to={`/sign-in?returnTo=${encodeURIComponent(destination)}`} />;
  const settings = <Settings onProfile={user => setMe(previous => previous?.user.id === user.id ? { ...previous, user } : previous)} onPreferences={preferences => setMe(previous => previous?.workspace.id === preferences.workspaceId ? { ...previous, preferences } : previous)} />;
  const signInError = error || (new URLSearchParams(location.search).has('error') ? 'Google sign-in was cancelled or did not finish. Please try again.' : '');
  if (state === 'checking' && !me) return <CheckingScreen />;
  if (!me) return state === 'unavailable'
    ? <UnavailableScreen busy={busy} error={error} onRetry={() => void refresh()} />
    : <SignInScreen busy={busy} error={signInError} onSignIn={() => void signIn()} />;
  return <AccountContext.Provider value={me}><DraftBoundary key={me.user.id}>
    {!me.preferences.values.onboardingCompleted ? <Onboarding onSaved={account => { currentAccount.current = account; setMe(account); }} /> :
    <Shell onSignOut={() => void signOut()} signingOut={busy} banner={error && <ConnectionBanner message={error} busy={busy} onRetry={() => void (failed === 'sign-out' ? signOut() : refresh())} />}>
      <Routes>
        {Kit && <Route path="/dev/kit" element={<Suspense><Kit /></Suspense>} />}
        <Route path="/sign-in" element={<Navigate replace to={returnTo} />} />
        <Route path="/storage" element={<Navigate replace to="/settings" />} />
        <Route path="/history" element={<Progress />} />
        <Route path="/welcome" element={<Navigate replace to="/courses" />} />
        <Route path="/course/:id/syllabus" element={<CourseEditor key={location.pathname} />} />
        <Route path="/course/:id/settings" element={<CourseEditor key={location.pathname} />} />
        <Route path="/planner/availability" element={<Planner />} />
        <Route path="/settings/:section" element={settings} />
        <Route path="/course/:id/progress/topic/:topicId" element={<TopicRedirect />} />
        <Route path="/" element={<Home />} />
        <Route path="/ai/:id" element={<AiOperation key={location.pathname} />} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/data" element={<Navigate replace to="/settings" />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/course/:id/progress" element={<CourseRedirect />} />
        <Route path="/course/:id/overview" element={<CourseRedirect />} />
        <Route path="/courses" element={<CourseLibrary />} />
        <Route path="/courses/new" element={<Navigate replace to="/courses?new=1" />} />
        <Route path="/course/:id" element={<CourseOverview key={location.pathname} />} />
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
        <Route path="/settings" element={settings} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>}
  </DraftBoundary></AccountContext.Provider>;
}

/** Course progress lives in the course overview now. */
function CourseRedirect() {
  const { id } = useParams();
  return <Navigate replace to={`/course/${id}`} />;
}
function TopicRedirect() {
  const { id, topicId } = useParams();
  return <Navigate replace to={`/progress?course=${id}&topic=${topicId}`} />;
}
