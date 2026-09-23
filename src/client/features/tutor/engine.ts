import type {
  SourceRef,
  TutorIntent,
  TutorMessage,
  TutorSession,
  TutorStage,
  TutorSuggestion,
} from '@shared/types.ts';
import {
  STAGE_ORDER,
  TUTOR_SCRIPT,
  UNRECOGNISED,
  classify,
  hitsMisconception,
  looksLikeAnswer,
  type ScriptTurn,
  type TopicScript,
} from '@shared/course/tutor-script.ts';

import { newId } from '@/lib/id';

/**
 * The tutor's turn-taking, over the authored script.
 *
 * ── What this decides ─────────────────────────────────────────────────────
 *
 * Given a session and a student turn, which authored response comes back. That
 * is genuinely all it does — there is no generation anywhere in this file, and
 * every string it returns was written by hand in `tutor-script.ts`.
 *
 * The decisions it makes, in order:
 *
 *   1. Did the student trip this topic's authored misconception? If so, the
 *      correction branch wins over everything, because catching the error is
 *      the most useful thing the tutor can do at that moment.
 *   2. Did they click a suggestion? Then the intent is known exactly.
 *   3. Did they type something? `classify()` has a go, and returns null rather
 *      than guessing.
 *   4. At the recall/reason/apply stages, does the typed text look like an
 *      *attempt at the question* rather than a request? If so it is treated as
 *      an answer and gets the "correct" branch.
 *   5. Nothing matched: say so, and offer what exists.
 *
 * Step 5 is the one that matters most for honesty. A scripted tutor that always
 * produces something plausible teaches the student to trust it, which is
 * exactly wrong when the thing is a lookup table.
 */

export interface TutorTurnResult {
  messages: TutorMessage[];
  stage: TutorStage;
  /** Set when this turn should launch practice. */
  launchPractice?: { topicIds: string[] };
  /** Set when this turn ended the session. */
  ended?: boolean;
}

function scriptFor(topicId: string): TopicScript | undefined {
  return TUTOR_SCRIPT[topicId];
}

export function hasScript(topicId: string): boolean {
  return topicId in TUTOR_SCRIPT;
}

function toMessage(
  turn: ScriptTurn,
  stage: TutorStage,
  fallbackSuggestions?: TutorSuggestion[],
): TutorMessage {
  return {
    id: newId('msg'),
    role: 'tutor',
    text: turn.text,
    stage,
    ...(turn.source ? { source: turn.source } : {}),
    ...(turn.suggestions ?? fallbackSuggestions
      ? { suggestions: turn.suggestions ?? fallbackSuggestions }
      : {}),
  };
}

export function studentMessage(text: string, stage: TutorStage): TutorMessage {
  return { id: newId('msg'), role: 'student', text, stage };
}

/** The suggestions offered when the tutor could not parse a turn. */
function fallbackSuggestions(script: TopicScript, stage: TutorStage): TutorSuggestion[] {
  const available = script.stages[stage];
  const intents = Object.keys(available).filter((k) => k !== 'open') as TutorIntent[];
  const labels: Partial<Record<TutorIntent, string>> = {
    explain: 'Explain it',
    simpler: 'Say that more simply',
    example: 'Give me an example',
    hint: 'Give me a hint',
    answer: 'Tell me the answer',
    why: 'Why does it matter?',
    check: 'Test me',
    practice: 'Launch practice',
    continue: 'Keep going',
    summary: 'Wrap up',
  };
  const out = intents
    .filter((i) => labels[i])
    .map((i) => ({ label: labels[i]!, intent: i }));
  // Always leave a way forward, even at a stage with no optional branches.
  if (out.length === 0) out.push({ label: 'Keep going', intent: 'continue' });
  return out;
}

/** Creates the opening turn of a new session. */
export function openSession(params: {
  courseId: string;
  topicId: string;
  source?: SourceRef;
  quote?: string;
  fromAttemptId?: string;
  fromQuestionId?: string;
}): TutorSession {
  const script = scriptFor(params.topicId);
  const now = new Date().toISOString();

  if (!script) {
    // A topic the student added themselves has no authored branches. Say so
    // rather than opening a session that will fail on the next turn.
    return {
      id: newId('ses'),
      courseId: params.courseId,
      topicId: params.topicId,
      messages: [
        {
          id: newId('msg'),
          role: 'tutor',
          stage: 'orient',
          meta: true,
          text: 'This prototype’s tutor is a set of authored responses, and there are none written for this topic — the script covers the six topics of the sample course only.\n\nNothing here can teach you this topic. Practice and exams still work on any topic that has authored questions behind it.',
        },
      ],
      stage: 'orient',
      startedAt: now,
      updatedAt: now,
      launchedAttemptIds: [],
      ...(params.source ? { source: params.source } : {}),
      ...(params.fromAttemptId ? { fromAttemptId: params.fromAttemptId } : {}),
      ...(params.fromQuestionId ? { fromQuestionId: params.fromQuestionId } : {}),
    };
  }

  const greeting = params.fromAttemptId
    ? script.fromMistake
    : params.source
      ? script.fromPassage
      : script.greeting;

  const messages: TutorMessage[] = [
    { id: newId('msg'), role: 'tutor', text: greeting, stage: 'orient' },
  ];

  if (params.quote) {
    messages.push({
      id: newId('msg'),
      role: 'tutor',
      stage: 'orient',
      text: `You highlighted:\n\n> ${params.quote}`,
      ...(params.source ? { source: params.source } : {}),
    });
  }

  messages.push(toMessage(script.stages.orient.open, 'orient'));

  return {
    id: newId('ses'),
    courseId: params.courseId,
    topicId: params.topicId,
    messages,
    stage: 'orient',
    startedAt: now,
    updatedAt: now,
    launchedAttemptIds: [],
    ...(params.source ? { source: params.source } : {}),
    ...(params.fromAttemptId ? { fromAttemptId: params.fromAttemptId } : {}),
    ...(params.fromQuestionId ? { fromQuestionId: params.fromQuestionId } : {}),
  };
}

/** Moves to the next stage in the arc, stopping at `reflect`. */
function advance(stage: TutorStage): TutorStage {
  const index = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)] ?? stage;
}

/**
 * Produces the tutor's response to one student turn.
 *
 * `intent` is set when the student clicked a suggestion; `text` when they
 * typed. Both are present when a suggestion is clicked, because the clicked
 * label is also shown in the transcript as the student's turn.
 */
export function respond(
  session: TutorSession,
  input: { text: string; intent?: TutorIntent },
): TutorTurnResult {
  const script = scriptFor(session.topicId);
  const stage = session.stage;

  if (!script) {
    return {
      stage,
      messages: [
        {
          id: newId('msg'),
          role: 'tutor',
          stage,
          meta: true,
          text: 'There are no authored responses for this topic, so there is nothing I can say about it. The sample course’s six topics are the ones the script covers.',
        },
      ],
    };
  }

  const stageScript = script.stages[stage];

  /* 1 — The misconception branch, which outranks everything. It only applies
     to typed text: a clicked suggestion is not the student's own wording. */
  if (!input.intent && hitsMisconception(script, input.text)) {
    return {
      stage,
      messages: [toMessage(script.misconception.correction, stage)],
    };
  }

  /* 2 & 3 — Work out the intent. */
  const intent = input.intent ?? classify(input.text);

  /* 4 — A substantive typed answer at a question-asking stage.
   *
   * ── Why this runs before the intent branches ──────────────────────────────
   *
   * `classify` is keyword matching, and a real answer to "what did it grant?"
   * often contains a keyword that looks like a request — "It granted the right
   * to tribute…" trips the `explain` pattern on the word "granted…the right".
   * At a stage where the tutor has just asked a question, a long declarative
   * sentence is far more likely to be the answer than a request to re-explain,
   * so it is treated as one.
   *
   * The guard is deliberately narrow: only at stages that ask questions, only
   * for typed text (never a clicked suggestion, whose intent is known exactly),
   * and only when `looksLikeAnswer` agrees — which rules out anything short or
   * ending in a question mark. */
  const answeringStage =
    stage === 'recall' || stage === 'reason' || stage === 'apply' || stage === 'understand';
  const explicitRequest =
    intent === 'hint' ||
    intent === 'answer' ||
    intent === 'simpler' ||
    intent === 'practice' ||
    intent === 'summary' ||
    intent === 'check';

  if (
    !input.intent &&
    answeringStage &&
    !explicitRequest &&
    looksLikeAnswer(input.text)
  ) {
    const next = script.correct.nextStage ?? advance(stage);
    return {
      stage: next,
      messages: [
        toMessage(script.correct, stage),
        toMessage(script.stages[next].open, next),
      ],
    };
  }

  if (intent === 'practice') {
    return {
      stage,
      messages: [
        {
          id: newId('msg'),
          role: 'tutor',
          stage,
          text: 'Good — practice is where this becomes usable. I have set up a short set on what we have been working on. It will be waiting in Practice afterwards, and whatever you score there feeds into your progress.',
        },
      ],
      launchPractice: { topicIds: script.practiceTopicIds },
    };
  }

  if (intent === 'summary') {
    return {
      stage: 'reflect',
      messages: [toMessage(script.stages.reflect.open, 'reflect')],
      ended: true,
    };
  }

  if (intent === 'continue') {
    const next = advance(stage);
    return { stage: next, messages: [toMessage(script.stages[next].open, next)] };
  }

  if (intent === 'check') {
    // "Test me" moves to the recall stage's question, or re-asks the current
    // stage's question if already past recall.
    const target: TutorStage = STAGE_ORDER.indexOf(stage) < 2 ? 'recall' : stage;
    return { stage: target, messages: [toMessage(script.stages[target].open, target)] };
  }

  /* An authored branch at this stage. */
  if (intent && intent in stageScript) {
    const turn = stageScript[intent]!;
    const next = turn.nextStage ?? stage;
    return { stage: next, messages: [toMessage(turn, stage)] };
  }

  /* The intent is real but this stage has no branch for it.
   *
   * Two fallbacks, in order, and the order matters. First look forward through
   * the arc for a stage that *does* author this intent — "give me an example"
   * at `orient` should find the example written at `understand` rather than
   * being refused. Failing that, if the student asked for the main content
   * ("explain", "why"), give them the next stage's opening turn, because the
   * opening turn *is* the explanation at every stage that has one.
   *
   * Only after both miss is the input genuinely unrecognised. Getting this
   * wrong is what made an authored suggestion button fall through to "I do not
   * have a branch for that", which is the worst of both worlds: a scripted
   * tutor refusing its own script. */
  if (intent) {
    const from = STAGE_ORDER.indexOf(stage);
    const forward = [...STAGE_ORDER.slice(from), ...STAGE_ORDER.slice(0, from)];

    for (const candidate of forward) {
      const branch = script.stages[candidate][intent];
      if (branch) {
        return {
          stage: branch.nextStage ?? candidate,
          messages: [toMessage(branch, candidate)],
        };
      }
    }

    if (intent === 'explain' || intent === 'why' || intent === 'example') {
      const next = advance(stage);
      if (next !== stage) {
        const turn = script.stages[next].open;
        return {
          stage: turn.nextStage ?? next,
          messages: [toMessage(turn, next)],
        };
      }
    }
  }

  /* 5 — Nothing matched. Say so. */
  return {
    stage,
    messages: [
      {
        id: newId('msg'),
        role: 'tutor',
        stage,
        meta: true,
        text: UNRECOGNISED,
        suggestions: fallbackSuggestions(script, stage),
      },
    ],
  };
}

/**
 * The end-of-session summary.
 *
 * Built from what actually happened — the stages reached, the branches used —
 * rather than from a template, so a session that stopped at `understand` does
 * not claim the student applied anything.
 */
export function summarise(session: TutorSession): {
  covered: string[];
  stageReached: TutorStage;
  nextStep: { label: string; to: string } | null;
} {
  const script = scriptFor(session.topicId);
  const stages = new Set(session.messages.map((m) => m.stage));
  const reached = STAGE_ORDER.filter((s) => stages.has(s));
  const stageReached = reached[reached.length - 1] ?? 'orient';

  const covered: string[] = [];
  if (stages.has('understand')) covered.push('Worked through the explanation');
  if (stages.has('recall')) covered.push('Tried to recall it without the text');
  if (stages.has('reason')) covered.push('Pushed on why, not just what');
  if (stages.has('apply')) covered.push('Applied it to something new');
  if (session.messages.some((m) => m.role === 'student')) {
    covered.push(
      `${session.messages.filter((m) => m.role === 'student').length} of your own turns`,
    );
  }

  const nextStep = script
    ? stageReached === 'reflect' || stageReached === 'apply'
      ? {
          label: 'Practise this now',
          to: `/practice/new?topic=${script.practiceTopicIds.join(',')}`,
        }
      : {
          label: 'Keep going in this session',
          to: `/tutor/${session.id}`,
        }
    : null;

  return { covered, stageReached, nextStep };
}
