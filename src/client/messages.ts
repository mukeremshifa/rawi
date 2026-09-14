/**
 * All learner-facing English text.
 *
 * Kept out of the components so a later Arabic locale is a new file rather than
 * a rewrite (PRODUCT.md: "Keep text in message files and use CSS logical
 * properties so later Arabic/RTL work is feasible"). Translation quality needs
 * its own review; this is only the structural groundwork.
 */
export const messages = {
  appName: 'Rawi',
  tagline: 'Understand the concept. Solve the next problem yourself.',

  fixtureBanner:
    'Pilot preparation build. This original lesson is provisional and still ' +
    'awaiting subject-reviewer sign-off. Tutor mode is set by the server.',

  start: {
    heading: 'Start a lesson',
    body: 'One short problem first, so the lesson can start where you are.',
    action: 'Start lesson',
  },

  stage: {
    diagnose: 'First attempt',
    learn: 'Explanation',
    practice: 'Practice',
    check: 'Independent check',
    review: 'Delayed review',
    summary: 'What you showed',
  },

  modeNote: {
    diagnose: 'Answer if you can. \u201cI don\u2019t know yet\u201d is a real answer.',
    practice: 'Hints are available here. Using them is fine \u2014 it is practice.',
    check: 'No hints before you answer. This one measures what you can do alone.',
    review: 'This is a fresh delayed check. No hints before you answer.',
  },

  actions: {
    submit: 'Submit answer',
    hint: 'Give me a hint',
    reveal: 'Show the answer',
    getHelp: 'Get help with this question',
    continue: 'Continue',
    toPractice: 'Practise this',
    toCheck: 'Try the check',
    finish: 'Finish',
    restart: 'Start again (demo reset)',
    retry: 'Retry',
    retryRefresh: 'Reload current state',
    home: 'Back to home',
  },

  feedback: {
    correct: 'Correct.',
    incorrect: 'Not quite.',
    /** R02B: shown only when the answer was unaided AND correct. */
    independent: 'Recorded as independent: you answered without help.',
    /** R02B: shown when help was used, regardless of correctness. */
    helpUsed: 'Recorded as assisted: help was used on this question.',
    /** R02B: wrong and unaided — not the same as assisted. */
    incorrectUnaided: 'Not recorded as independent: the answer was wrong.',
    alreadySubmitted: 'Already submitted. Your first answer is the one recorded.',
  },

  hints: {
    heading: 'Hints',
    noneLeft: 'No more hints for this question.',
    usingHintWarning:
      'A hint means this answer will be recorded as assisted, not independent.',
  },

  reveal: {
    heading: 'Answer',
    warning:
      'Showing the answer records this question as assisted. You will get a ' +
      'different check later.',
  },

  check: {
    /** Shown before the learner chooses to get help. */
    getHelpWarning:
      'Getting help will convert this question to practice. You\u2019ll get a ' +
      'different question for your independent check.',
    /** Shown when the check item has been converted to help. */
    converted:
      'This question is now practice. A fresh check question is ready when ' +
      'you move on.',
    /** Shown when all check bank items have been used. */
    bankExhausted:
      'You\u2019ve used all available reviewed check questions. Practise more; ' +
      'a new session will not present a seen question as fresh.',
    /** Shown after getting help and replacement item arrives. */
    newItemReady: 'A replacement check question has been selected.',
  },

  evidence: {
    heading: 'Your evidence',
    state: {
      'not-checked': 'Not checked yet',
      practicing: 'Practising',
      'independent-once': 'Solved independently once',
      'retained-on-review': 'Retained on review',
    },
    attemptsHeading: 'Attempts',
    noAttempts: 'No attempts recorded yet.',
    independentBadge: 'independent',
    assistedBadge: 'assisted',
    wrongUnaidedBadge: 'wrong, no help used',
    nextReview: 'Next review due (UTC date)',
    reviewNote:
      'Come back on that date for a delayed check. Delayed checks are the ' +
      'evidence that understanding lasted.',
  },

  source: {
    heading: 'From the course notes',
    permission: 'Permission',
    version: 'Version',
  },

  error: {
    heading: 'Something went wrong',
    network: 'Could not reach the lesson server. Your answer was not lost — try again when you\u2019re back online.',
    persistenceUnavailable:
      'Saved progress is temporarily unavailable. This action was not confirmed; retry when the service is back.',
    sessionLost:
      'This session is no longer on the server. Local demo sessions do not ' +
      'survive a server restart. Start a new session to continue.',
    /** R02B: refresh succeeded and the view is confirmed current. */
    staleRefreshed:
      'The lesson has moved on since that action was sent. The current state is shown below.',
    /** R02B: refresh was attempted but the server could not be reached. */
    staleRefreshFailed:
      'That action was out of date, and the current state could not be loaded (server unreachable). ' +
      'Your recorded progress is safe. Retry when you\u2019re back online.',
    /** R02B: stale action but session already gone. */
    staleSessionGone:
      'That action was out of date and the session is no longer on the server. ' +
      'Local demo sessions do not survive a server restart. Start a new session to continue.',
    /** R02B: item was replaced between when request was built and when it arrived. */
    itemReplaced:
      'A newer check question replaced this one before your action arrived. The current question is shown below.',
    itemReplacedRefreshFailed:
      'A newer check question replaced this one, and the current state could not be loaded. ' +
      'Retry when you\u2019re back online.',
  },

  loading: 'Working\u2026',

  demoReset: {
    label: 'Demo reset',
    note: 'Starting again creates a new session. Configured accounts keep item exposure across sessions; a full local fixture restart does not.',
  },

  auth: {
    heading: 'Sign in to Rawi',
    body: 'This private pilot uses Google sign-in. Only enrolled learners can start a lesson.',
    signIn: 'Continue with Google',
    signOut: 'Sign out',
    restoring: 'Restoring your session\u2026',
    notEnrolledHeading: 'Invitation required',
    notEnrolledBody: 'This account is signed in but is not enrolled in the private pilot.',
    setupHeading: 'Sign-in setup is incomplete',
    setupBody: 'The public authentication configuration is missing. The operator must finish provider setup before sign-in can begin.',
    unavailableHeading: 'Sign-in is unavailable',
    unavailableBody: 'Rawi could not restore the authentication service. Try again when the service is available.',
    signInFailed: 'Google sign-in could not start. The provider may still need to be configured.',
    signOutFailed: 'Rawi could not complete sign-out. Try again.',
  },

  resume: {
    continueHeading: 'Continue where you left off',
    continueLabel: 'Continue session',
    continueAction: 'Continue',
    lastSeen: 'Last activity',
    reviewDueHeading: 'Review due',
    reviewDueLabel: 'Sessions with a review due',
    reviewAction: 'Review — due',
  },

  tutor: {
    heading: 'Ask Rawi',
    prompt: 'What is still unclear?',
    ask: 'Ask for an explanation',
    asking: 'Preparing an explanation…',
    sources: 'Sources',
    fixture: 'deterministic fixture',
    checkLocked: 'Tutor help is paused while an unanswered independent check is active. Submit it or choose the help option first.',
    budgetReached: 'The tutor budget limit has been reached. The reviewed lesson and saved work remain available.',
    timeout: 'The tutor took too long to respond. Your question is preserved above; try again with a new request.',
    unavailable: 'The tutor is temporarily unavailable. The course explanation remains available.',
  },

  pilot: {
    heading: 'Private pilot information',
    course: 'Supported unit',
    unreviewed: 'Content is original but still awaiting a competent subject reviewer.',
    retention: 'Configured retention: {days} days. Export or delete your data at any time.',
    operatorMissing: 'Operator name/contact and legal review are not configured yet; real learner enrollment must wait.',
  },

  operations: {
    heading: 'Support and your data',
    reportLabel: 'Report a content, technical, or privacy problem',
    report: 'Send report',
    reported: 'Report saved for the pilot operator.',
    failed: 'That operation could not be confirmed. Nothing has been reported or deleted; try again.',
    export: 'Export my data',
    delete: 'Delete my Rawi data',
    deleteConfirm: 'Delete all saved Rawi learning data, sources, issues, and usage records? This cannot be undone.',
    sources: 'Personal sources (readiness feature)',
    sourceLimits: 'Pasted text only, up to 50,000 characters. PDF extraction is not enabled in the zero-cost Worker build.',
    sourceTitle: 'Source title',
    sourceText: 'Paste text',
    permissionAck: 'By adding this text you confirm you have permission to use it for your own study.',
    preview: 'Extraction preview',
    addSource: 'Save approved text',
  },
} as const;
