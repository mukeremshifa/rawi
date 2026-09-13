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
    'Demonstration data. Lesson content and tutor responses are fixed local ' +
    'fixtures, not a live AI tutor.',

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
    summary: 'What you showed',
  },

  modeNote: {
    diagnose: 'Answer if you can. \u201cI don\u2019t know yet\u201d is a real answer.',
    practice: 'Hints are available here. Using them is fine \u2014 it is practice.',
    check: 'No hints before you answer. This one measures what you can do alone.',
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
      'You\u2019ve used all available check questions in this session. ' +
      'Practise more, then start a new session for a fresh check.',
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
    nextReview: 'Next review due',
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
    note: 'Starting again clears all recorded progress for this session. This is not a real assessment reset \u2014 a full fixture restart also clears exposure history.',
  },
} as const;
