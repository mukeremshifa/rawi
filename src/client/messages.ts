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
    diagnose: 'Answer if you can. "I don’t know yet" is a real answer.',
    practice: 'Hints are available here. Using them is fine - it is practice.',
    check: 'No hints before you answer. This one measures what you can do alone.',
  },

  actions: {
    submit: 'Submit answer',
    hint: 'Give me a hint',
    reveal: 'Show the answer',
    continue: 'Continue',
    toPractice: 'Practise this',
    toCheck: 'Try the check',
    finish: 'Finish',
    restart: 'Start again',
    retry: 'Try again',
  },

  feedback: {
    correct: 'Correct.',
    incorrect: 'Not quite.',
    independent: 'Recorded as independent: you answered without help.',
    assisted: 'Recorded as assisted, because help was used on this question.',
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
    network: 'Could not reach the lesson server. Your answer was not lost.',
    sessionLost:
      'This session is no longer on the server. Local demo sessions do not ' +
      'survive a server restart.',
  },

  loading: 'Working…',
} as const;
