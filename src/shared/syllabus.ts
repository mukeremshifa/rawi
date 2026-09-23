/**
 * Reading an outline out of a syllabus.
 *
 * ── What this is, and what it refuses to pretend ──────────────────────────
 *
 * There is no model here. This is a line-by-line pattern match over pasted
 * text: it looks for the shapes syllabi actually use — "Week 3: Estimation",
 * "Unit II — Conquest", "3. Mercantilism" — and turns the ones it recognises
 * into proposed topics. Everything it produces is shown to the student for
 * review before anything is created, and the UI says plainly that this is
 * pattern matching rather than comprehension.
 *
 * The honesty constraint is what shapes the design. A model-flavoured
 * "extraction" that silently invented plausible topics from unstructured prose
 * would demo better and would be a lie, so:
 *
 *   * the **sample syllabus** has a scripted, rich result, and is labelled as
 *     a sample;
 *   * **arbitrary text** gets this transparent line matcher, and the review
 *     screen states which rule matched each line;
 *   * text that matches nothing produces **no topics** and says so, offering
 *     the manual outline builder instead of a guess.
 *
 * ── Why confidence is reported per topic ──────────────────────────────────
 *
 * A line that said "Week 4: Hypothesis testing" is a much safer proposal than
 * a line that was merely capitalised and short. Carrying that distinction to
 * the review screen lets a student skim the confident ones and actually read
 * the uncertain ones, which is the difference between reviewing a proposal and
 * rubber-stamping it.
 */

export type ProposalConfidence = 'high' | 'low';

export interface ProposedTopic {
  /** A client-side key, not the eventual topic id. */
  key: string;
  title: string;
  summary: string;
  module: string | null;
  confidence: ProposalConfidence;
  /** Which rule matched, shown on the review screen. */
  matchedBy: string;
  /** The source line, so a student can check the reading against the text. */
  sourceLine: string;
}

export interface SyllabusReading {
  topics: ProposedTopic[];
  /** Lines the reader could not interpret, for the "what was skipped" list. */
  skipped: string[];
  /** A sentence describing what happened, shown above the proposal. */
  summary: string;
  /** True when this came from the labelled sample rather than from a match. */
  fromSample: boolean;
}

/* ── The patterns ─────────────────────────────────────────────────────── */

interface Rule {
  name: string;
  test: RegExp;
  confidence: ProposalConfidence;
}

/**
 * The line shapes this recognises, most specific first.
 *
 * Order matters: "Week 3: Estimation" matches both the week rule and the
 * generic numbered rule, and the week rule is the one that carries a module,
 * so it has to win.
 */
const RULES: Rule[] = [
  {
    name: 'a week or session heading',
    test: /^\s*(week|session|class|lecture|seminar)\s*([0-9]{1,2}|[ivxlc]+)\s*[:.–—-]\s*(.+)$/i,
    confidence: 'high',
  },
  {
    name: 'a unit, module or part heading',
    test: /^\s*(unit|module|part|block|theme|topic)\s*([0-9]{1,2}|[ivxlc]+)\s*[:.–—-]\s*(.+)$/i,
    confidence: 'high',
  },
  {
    name: 'a numbered list item',
    test: /^\s*([0-9]{1,2})\s*[).–—-]\s+(.{4,120})$/,
    confidence: 'high',
  },
  {
    name: 'a bulleted list item',
    test: /^\s*[-*•·]\s+(.{4,120})$/,
    confidence: 'low',
  },
];

/** Lines that are structure rather than content, and are never topics. */
const NOISE =
  /^\s*(syllabus|course outline|contents|overview|reading list|assessment|assessments|grading|office hours|prerequisites?|textbooks?|required reading|policies|schedule|instructor|contact|email|aims?|objectives?|learning outcomes?)\s*:?\s*$/i;

/** A trailing "(2 weeks)", page range or date, which is not part of a title. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*[—–-]\s*(pp?\.|pages?|ch(apter)?s?\.?)\s*[0-9].*$/i, '')
    .replace(/\s*[.;,]\s*$/, '')
    .trim();
}

/** Roman or arabic, normalised for the module label. */
function moduleLabel(kind: string, number: string): string {
  const word = kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
  return `${word} ${number.toUpperCase()}`;
}

/**
 * Reads pasted syllabus text into a proposed outline.
 *
 * Deliberately conservative. A line it cannot place goes in `skipped` rather
 * than becoming a low-quality topic, because the review screen can show a
 * student what was ignored and let them add it by hand — which is honest — in
 * a way that quietly inventing topics from prose is not.
 */
export function readSyllabus(text: string): SyllabusReading {
  const lines = text.split(/\r?\n/);
  const topics: ProposedTopic[] = [];
  const skipped: string[] = [];

  /** The most recent module heading, inherited by the items under it. */
  let currentModule: string | null = null;
  let index = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (NOISE.test(line)) continue;

    /* A bare module heading with nothing after the colon sets the context for
       the numbered or bulleted lines that follow it. */
    const bareModule = /^\s*(week|unit|module|part|session|block)\s*([0-9]{1,2}|[ivxlc]+)\s*:?\s*$/i.exec(
      line,
    );
    if (bareModule?.[1] && bareModule[2]) {
      currentModule = moduleLabel(bareModule[1], bareModule[2]);
      continue;
    }

    let matched = false;

    for (const rule of RULES) {
      const match = rule.test.exec(line);
      if (!match) continue;

      let title: string;
      let module: string | null = currentModule;

      if (rule.name === 'a week or session heading' || rule.name === 'a unit, module or part heading') {
        const kind = match[1];
        const number = match[2];
        title = cleanTitle(match[3] ?? '');
        if (kind && number) {
          module = moduleLabel(kind, number);
          currentModule = module;
        }
      } else if (rule.name === 'a numbered list item') {
        title = cleanTitle(match[2] ?? '');
      } else {
        title = cleanTitle(match[1] ?? '');
      }

      if (title.length < 3) break;

      topics.push({
        key: `proposed-${index++}`,
        title,
        summary: '',
        module,
        confidence: rule.confidence,
        matchedBy: rule.name,
        sourceLine: line,
      });
      matched = true;
      break;
    }

    if (!matched && line.length > 3 && line.length < 200) {
      skipped.push(line);
    }
  }

  const high = topics.filter((t) => t.confidence === 'high').length;

  const summary =
    topics.length === 0
      ? 'No lines in this text matched a recognised outline shape, so nothing has been proposed. You can build the outline yourself below, which is the normal path for a syllabus written as prose.'
      : `Matched ${topics.length} ${
          topics.length === 1 ? 'line' : 'lines'
        } that look like outline entries${
          high < topics.length
            ? `, ${high} of them confidently. Check the less certain ones before confirming.`
            : '.'
        } This is line-by-line pattern matching, not comprehension. Nothing here has read your syllabus.`;

  return { topics, skipped: skipped.slice(0, 20), summary, fromSample: false };
}

/* ── The sample ───────────────────────────────────────────────────────── */

/**
 * A sample syllabus, and the rich result it produces.
 *
 * The text is real input — running it through `readSyllabus` genuinely produces
 * the outline below, which a student can verify by pasting it into the box
 * themselves. What the sample adds is *summaries*, which the matcher cannot
 * produce and does not pretend to: they are authored alongside the sample and
 * exist to show what a well-filled-in outline looks like.
 *
 * The screen labels this "sample" wherever it is offered, so the richer result
 * is never mistaken for what arbitrary text will do.
 */
export const SAMPLE_SYLLABUS = `PHIL 214 — Minds, Machines and Meaning
Autumn term syllabus

Assessment
Two essays (30% each) and a final examination (40%).

Course outline

Week 1: What a mind is supposed to be
Week 2: Dualism and its discontents
Week 3: Functionalism and multiple realisability
Week 4 — The Chinese Room and its critics
Week 5: Consciousness and the explanatory gap
Week 6 — Machine understanding: can a system mean anything?

Required reading
Selected papers, distributed weekly.`;

const SAMPLE_SUMMARIES: Record<string, string> = {
  'What a mind is supposed to be':
    'The explananda: intentionality, consciousness, rationality, and why a theory of mind is answerable to all three.',
  'Dualism and its discontents':
    'Substance and property dualism, the interaction problem, and why the causal closure of the physical is the standard objection.',
  'Functionalism and multiple realisability':
    'Mental states as causal roles, the argument from multiple realisability, and what functionalism leaves out.',
  'The Chinese Room and its critics':
    'Searle’s argument, the systems and robot replies, and what the thought experiment does and does not establish.',
  'Consciousness and the explanatory gap':
    'The hard problem, the knowledge argument, and the distinction between explaining function and explaining experience.',
  'Machine understanding: can a system mean anything?':
    'Symbol grounding, derived versus original intentionality, and how the question has changed with large statistical models.',
};

/**
 * The sample's reading: the genuine match, enriched with authored summaries.
 *
 * Built by running the real matcher rather than by hand-writing the result, so
 * a change to the rules that would break real input breaks the sample too
 * rather than leaving a demo that works while the feature does not.
 */
export function readSampleSyllabus(): SyllabusReading {
  const base = readSyllabus(SAMPLE_SYLLABUS);
  return {
    ...base,
    fromSample: true,
    topics: base.topics.map((topic) => ({
      ...topic,
      summary: SAMPLE_SUMMARIES[topic.title] ?? '',
    })),
    summary: `This is the labelled sample syllabus. The ${base.topics.length} topics below came from the same line matcher your own text would go through. The one-line descriptions are authored for the sample, because nothing here can write a summary of a topic it has only seen the title of.`,
  };
}

/* ── Manual outlines ──────────────────────────────────────────────────── */

/** A blank week-by-week outline, for building one without a syllabus. */
export function blankOutline(weeks: number): ProposedTopic[] {
  return Array.from({ length: weeks }, (_, i) => ({
    key: `proposed-blank-${i}`,
    title: '',
    summary: '',
    module: `Week ${i + 1}`,
    confidence: 'high' as const,
    matchedBy: 'added by you',
    sourceLine: '',
  }));
}
