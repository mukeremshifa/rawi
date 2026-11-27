import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { Me } from '@shared/contracts/workspace';
import { authClient, RequestError, request, setActiveAccount } from '@/lib/api';
import { DraftBoundary, hasUnsavedEdits } from '@/lib/hooks';
import { Shell } from '@/app/Shell';
import { CheckingScreen, ConnectionBanner, SignInScreen, UnavailableScreen } from '@/app/AuthScreens';
import { NotFound } from '@/app/NotFound';
import { Page } from '@/components/layout';
import { LoadingState } from '@/components/states';
import { useConfirm } from '@/components/ui/alert-dialog';

import { CONSENT_VERSION } from '@shared/contracts/constants';
import { safeReturnTo } from '@/app/return-to';
import { UploadQueueProvider } from '@/features/materials/queue';
import { AccountContext } from '@/lib/account';
import { queryClient } from '@/lib/query';
// Each area of the product loads when it is first opened, Home included, so the shell arrives first.
// Consent and first-run setup are seen once, so they load only for an account that needs them.
const Onboarding = lazy(() => import('@/features/account/AccountSettings').then(m => ({ default: m.Onboarding })));
const Consent = lazy(() => import('@/features/account/Pilot').then(m => ({ default: m.Consent })));
const Home = lazy(() => import('@/features/home/Home').then(m => ({ default: m.Home })));
const CourseLibrary = lazy(() => import('@/features/courses/Courses').then(m => ({ default: m.CourseLibrary })));
const CourseOverview = lazy(() =>
  import('@/features/courses/CourseOverview').then(m => ({ default: m.CourseOverview })),
);
const CourseSettings = lazy(() =>
  import('@/features/courses/CourseSettings').then(m => ({ default: m.CourseSettings })),
);
const MaterialReader = lazy(() => import('@/features/materials/Reader').then(m => ({ default: m.MaterialReader })));
const Materials = lazy(() => import('@/features/materials/Library').then(m => ({ default: m.Materials })));
const Planner = lazy(() => import('@/features/planning/Planner').then(m => ({ default: m.Planner })));
const Progress = lazy(() => import('@/features/progress/Progress').then(m => ({ default: m.Progress })));
const AiOperation = lazy(() => import('@/features/ai/AiOperation').then(m => ({ default: m.AiOperation })));
const Agent = lazy(() => import('@/features/agent/Agent').then(m => ({ default: m.Agent })));
const Glossary = lazy(() => import('@/features/language/Glossary').then(m => ({ default: m.Glossary })));
const Exams = lazy(() => import('@/features/exams/Exams').then(m => ({ default: m.Exams })));
const Run = lazy(() => import('@/features/practice/Runner').then(m => ({ default: m.Run })));
const AttemptReview = lazy(() => import('@/features/practice/Attempt').then(m => ({ default: m.AttemptReview })));
const Practice = lazy(() => import('@/features/practice/PracticeHome').then(m => ({ default: m.Practice })));
const PracticeSet = lazy(() => import('@/features/practice/SetDetail').then(m => ({ default: m.PracticeSet })));
const Settings = lazy(() => import('@/features/account/Settings').then(m => ({ default: m.Settings })));
const Search = lazy(() => import('@/features/support/Support').then(m => ({ default: m.Search })));
const Notifications = lazy(() => import('@/features/support/Support').then(m => ({ default: m.Notifications })));
const TutorLibrary = lazy(() => import('@/features/tutor/Tutor').then(m => ({ default: m.TutorLibrary })));
const Tutor = lazy(() => import('@/features/tutor/Tutor').then(m => ({ default: m.Tutor })));
// The component gallery never ships: the import is dropped from production builds.
const Kit = import.meta.env.DEV ? lazy(() => import('@/features/dev/Kit')) : null;

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'unavailable'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which action the banner's Retry repeats: the connection check or sign-out.
  const [failed, setFailed] = useState<'connection' | 'sign-out'>('connection');
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0),
    authBusy = useRef(false);
  const currentAccount = useRef<Me | null>(null);
  const sessionRequest = useRef<AbortController | null>(null);
  const checkedAt = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const location = useLocation();
  const confirm = useConfirm();
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const destination =
    location.pathname === '/sign-in' ? returnTo : safeReturnTo(location.pathname + location.search + location.hash);
  const clear = useCallback(() => {
    sessionRequest.current?.abort();
    ++epoch.current;
    setActiveAccount(null);
    queryClient.clear();
    currentAccount.current = null;
    setMe(null);
    setState('unauthenticated');
    setError('');
  }, []);
  const refresh = useCallback(async () => {
    if (authBusy.current) return;
    const current = ++epoch.current;
    sessionRequest.current?.abort();
    const controller = new AbortController();
    sessionRequest.current = controller;
    try {
      const account = await request<Me>('/v1/me', undefined, undefined, 'GET', controller.signal);
      if (epoch.current !== current) return;
      // A different account must never see the previous account's cache.
      if (currentAccount.current && currentAccount.current.user.id !== account.user.id) queryClient.clear();
      setActiveAccount(account.user.id);
      checkedAt.current = Date.now();
      currentAccount.current = account;
      setMe(account);
      setState('authenticated');
      setError('');
      channel.current?.postMessage({ type: 'identity', id: account.user.id });
    } catch (e) {
      if (epoch.current !== current) return;
      if (e instanceof RequestError && (e.code === 'unauthenticated' || e.code === 'account_changed')) clear();
      else {
        setFailed('connection');
        setState('unavailable');
        setError('We could not reach your account. Keep this page open and try again.');
      }
    }
  }, [clear]);
  useEffect(() => {
    const invalid = () => {
      clear();
      channel.current?.postMessage({ type: 'signed-out' });
    };
    // Coming back to the tab checks the account again, at most once a minute. Focus and becoming
    // visible usually fire together, and another tab's sign-out arrives on the channel below at once.
    const returned = () => {
      if (Date.now() - checkedAt.current > 60_000) void refresh();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') returned();
    };
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('rawi-online-auth');
      channel.current.onmessage = event => {
        if (event.data?.type === 'identity') {
          if (currentAccount.current?.user.id !== event.data.id) {
            clear();
            void refresh();
          }
        } else clear();
      };
    }
    void refresh();
    window.addEventListener('rawi-account-invalid', invalid);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', visible);
    return () => {
      ++epoch.current;
      setActiveAccount(null);
      sessionRequest.current?.abort();
      window.removeEventListener('rawi-account-invalid', invalid);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', visible);
      channel.current?.close();
    };
  }, [refresh, clear]);
  // A first load that could not reach the server tries again by itself a few times, further apart each time.
  useEffect(() => {
    if (state !== 'unavailable' || me) {
      if (state !== 'checking' && attempt) setAttempt(0);
      return;
    }
    if (attempt >= 3) return;
    const timer = setTimeout(
      () => {
        setAttempt(n => n + 1);
        void refresh();
      },
      2000 * 2 ** attempt,
    );
    return () => clearTimeout(timer);
  }, [state, me, attempt, refresh]);
  useEffect(() => {
    const preferences = me?.preferences.values;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        preferences?.theme === 'dark' || ((!preferences || preferences.theme === 'system') && media.matches),
      );
    apply();
    media.addEventListener('change', apply);
    document.documentElement.dataset.readingSize = preferences?.readingSize ?? 'normal';
    document.documentElement.dataset.motion = preferences?.motion ?? 'system';
    return () => media.removeEventListener('change', apply);
  }, [me?.preferences]);
  const signIn = async () => {
    authBusy.current = true;
    ++epoch.current;
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: destination,
        errorCallbackURL: `/sign-in?error=signin&returnTo=${encodeURIComponent(destination)}`,
      });
      if (result.error) throw new Error('Google sign-in could not start. Please try again.');
    } catch {
      setError('Google sign-in did not finish. Please try again.');
    } finally {
      authBusy.current = false;
      setBusy(false);
    }
  };
  const signOut = async () => {
    if (
      hasUnsavedEdits() &&
      !(await confirm({
        title: 'Sign out without saving?',
        description: 'Your unsaved changes will be lost.',
        confirmLabel: 'Discard and sign out',
        cancelLabel: 'Keep editing',
        destructive: true,
      }))
    )
      return;
    authBusy.current = true;
    ++epoch.current;
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      clear();
      channel.current?.postMessage({ type: 'signed-out' });
    } catch {
      setFailed('sign-out');
      setError('Sign-out did not complete, so your session may still be active. Try signing out again.');
    } finally {
      authBusy.current = false;
      setBusy(false);
    }
  };
  if (location.pathname === '/online' || location.pathname.startsWith('/online/'))
    return <Navigate replace to={`${location.pathname.slice(7) || '/'}${location.search}${location.hash}`} />;
  if (state === 'unauthenticated' && location.pathname !== '/sign-in')
    return <Navigate replace to={`/sign-in?returnTo=${encodeURIComponent(destination)}`} />;
  const settings = (
    <Settings
      onProfile={user => setMe(previous => (previous?.user.id === user.id ? { ...previous, user } : previous))}
      onDeleted={() => {
        clear();
        channel.current?.postMessage({ type: 'signed-out' });
      }}
      onPreferences={preferences =>
        setMe(previous =>
          previous?.workspace.id === preferences.workspaceId ? { ...previous, preferences } : previous,
        )
      }
    />
  );
  const signInError =
    error ||
    (new URLSearchParams(location.search).has('error')
      ? 'Google sign-in was cancelled or did not finish. Please try again.'
      : '');
  if (state === 'checking' && !me) return <CheckingScreen />;
  if (!me)
    return state === 'unavailable' ? (
      <UnavailableScreen busy={busy} error={error} onRetry={() => void refresh()} />
    ) : (
      <SignInScreen busy={busy} error={signInError} onSignIn={() => void signIn()} />
    );
  return (
    <AccountContext.Provider value={me}>
      <DraftBoundary key={me.user.id}>
        <UploadQueueProvider>
          <Suspense fallback={<CheckingScreen />}>
            {me.preferences.consentVersion !== CONSENT_VERSION ? (
              <Consent
                onAgreed={account => {
                  currentAccount.current = account;
                  setMe(account);
                }}
                onSignOut={() => void signOut()}
              />
            ) : !me.preferences.values.onboardingCompleted ? (
              <Onboarding
                onSaved={account => {
                  currentAccount.current = account;
                  setMe(account);
                }}
              />
            ) : (
              <Shell
                onSignOut={() => void signOut()}
                signingOut={busy}
                banner={
                  error && (
                    <ConnectionBanner
                      message={error}
                      busy={busy}
                      onRetry={() => void (failed === 'sign-out' ? signOut() : refresh())}
                    />
                  )
                }
              >
                <Suspense
                  fallback={
                    <Page>
                      <LoadingState lines={4} />
                    </Page>
                  }
                >
                  <Routes>
                    {Kit && (
                      <Route
                        path="/dev/kit"
                        element={
                          <Suspense>
                            <Kit />
                          </Suspense>
                        }
                      />
                    )}
                    <Route path="/sign-in" element={<Navigate replace to={returnTo} />} />
                    <Route path="/storage" element={<Navigate replace to="/settings" />} />
                    <Route path="/history" element={<Progress />} />
                    <Route path="/welcome" element={<Navigate replace to="/courses" />} />
                    <Route path="/course/:id/syllabus" element={<CourseRedirect />} />
                    <Route path="/course/:id/settings" element={<CourseSettings key={location.pathname} />} />
                    <Route path="/planner/availability" element={<Navigate replace to="/planner?availability=1" />} />
                    <Route path="/settings/:section" element={settings} />
                    <Route path="/course/:id/progress/topic/:topicId" element={<TopicRedirect />} />
                    <Route path="/" element={<Home />} />
                    <Route path="/ai/:id" element={<AiOperation key={location.pathname} />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/data" element={<Navigate replace to="/settings" />} />
                    <Route path="/planner" element={<Planner />} />
                    <Route path="/agent" element={<Agent />} />
                    <Route path="/progress" element={<Progress />} />
                    <Route path="/course/:id/progress" element={<CourseRedirect />} />
                    <Route path="/course/:id/overview" element={<CourseRedirect />} />
                    <Route path="/courses" element={<CourseLibrary />} />
                    <Route path="/courses/new" element={<Navigate replace to="/courses?new=1" />} />
                    <Route path="/course/:id" element={<CourseOverview key={location.pathname} />} />
                    <Route path="/course/:id/materials" element={<Materials key={location.pathname} />} />
                    <Route path="/course/:id/glossary" element={<Glossary key={location.pathname} />} />
                    <Route path="/materials/:materialId" element={<MaterialReader key={location.pathname} />} />
                    <Route
                      path="/materials/:materialId/versions/:versionId"
                      element={<MaterialReader key={location.pathname} />}
                    />
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
                </Suspense>
              </Shell>
            )}
          </Suspense>
        </UploadQueueProvider>
      </DraftBoundary>
    </AccountContext.Provider>
  );
}

/** Course progress and the outline live in the course overview now. */
function CourseRedirect() {
  const { id } = useParams();
  return <Navigate replace to={`/course/${id}`} />;
}
function TopicRedirect() {
  const { id, topicId } = useParams();
  return <Navigate replace to={`/progress?course=${id}&topic=${topicId}`} />;
}
