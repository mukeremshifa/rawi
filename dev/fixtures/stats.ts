import type { Course, Material, Question, Topic } from '../../src/shared/domain/types';

/**
 * The second seeded course: "Statistical Inference for Social Research".
 *
 * ── Why a second course, and why this one ─────────────────────────────────
 *
 * Cross-course planning cannot be demonstrated with one course, and it cannot
 * honestly be demonstrated with the same course under a different name either:
 * a planner that balances two history courses is just a planner with twice as
 * many history topics. The interesting behaviour — competing deadlines, work
 * of genuinely different shapes, a week where reading and problem sets have to
 * share the same evenings — needs two courses that actually differ.
 *
 * So this one is deliberately unlike the Atlantic course in the ways that
 * matter to the product:
 *
 *   * its work is short and repetitive (problem sets) rather than long and
 *     continuous (essays), so the planner has genuinely different session
 *     lengths to fit;
 *   * its materials are compact worked examples rather than long extracts;
 *   * its assessments are frequent and low-stakes rather than one final, which
 *     is what gives the assessment list something to prioritise between.
 *
 * ── Everything here is fictional ──────────────────────────────────────────
 *
 * The course, its authors and its data sets are invented, exactly as in the
 * Atlantic course. The numbers in the worked examples are internally
 * consistent — a student can check them — but the studies they describe are
 * not real studies.
 */

export const STATS_COURSE_ID = 'course-stats';

export const STATS_COURSE: Course = {
  id: STATS_COURSE_ID,
  name: 'Statistical Inference for Social Research',
  description:
    'A problem-based second-year methods course. Weekly problem sets, two in-term quizzes and a practical exam. The emphasis is on interpreting estimates rather than deriving them.',
  goal: 'Read a result and say honestly what it does and does not support.',
  accent: 'teal',
  createdAt: new Date('2026-10-07T08:00:00.000Z').toISOString(),
};

export const STATS_TOPICS: Topic[] = [
  {
    id: 'stat-sampling',
    courseId: STATS_COURSE_ID,
    module: 'Week 1: Foundations',
    order: 0,
    title: 'Sampling and the target population',
    summary:
      'What a sample can stand for, how sampling frames fail, and why a large biased sample is worse than a small fair one.',
    priority: 'normal',
    relatedTopicIds: ['stat-intervals', 'stat-causal'],
  },
  {
    id: 'stat-describing',
    courseId: STATS_COURSE_ID,
    module: 'Week 2: Describing data',
    order: 1,
    title: 'Describing distributions',
    summary:
      'Centre, spread and shape, when a mean misleads, and what a standard deviation does and does not tell you.',
    priority: 'low',
    relatedTopicIds: ['stat-sampling', 'stat-intervals'],
  },
  {
    id: 'stat-intervals',
    courseId: STATS_COURSE_ID,
    module: 'Week 3: Estimation',
    order: 2,
    title: 'Standard errors and confidence intervals',
    summary:
      'What the interval is an interval of, how sample size moves it, and the interpretations that are commonly given and are wrong.',
    priority: 'high',
    relatedTopicIds: ['stat-testing', 'stat-sampling'],
  },
  {
    id: 'stat-testing',
    courseId: STATS_COURSE_ID,
    module: 'Week 4: Testing',
    order: 3,
    title: 'Hypothesis tests and p-values',
    summary:
      'The logic of the null, what a p-value is conditional on, and why significance is not importance.',
    priority: 'high',
    relatedTopicIds: ['stat-intervals', 'stat-multiple'],
  },
  {
    id: 'stat-multiple',
    courseId: STATS_COURSE_ID,
    module: 'Week 5: Practice and its failures',
    order: 4,
    title: 'Multiple comparisons and researcher degrees of freedom',
    summary:
      'What happens to error rates when many tests are run, and the analytic choices that inflate them without anyone lying.',
    priority: 'normal',
    relatedTopicIds: ['stat-testing', 'stat-causal'],
  },
  {
    id: 'stat-causal',
    courseId: STATS_COURSE_ID,
    module: 'Week 6: Causal claims',
    order: 5,
    title: 'From association to cause',
    summary:
      'Confounding, selection and the conditions under which an observational estimate can carry a causal reading.',
    priority: 'high',
    relatedTopicIds: ['stat-sampling', 'stat-multiple'],
  },
];

const ADDED = new Date(Date.parse('2026-10-07T08:00:00.000Z') - 1000 * 60 * 60 * 24 * 9).toISOString();

export const STATS_MATERIALS: Material[] = [
  {
    id: 'mat-stat-intervals',
    courseId: STATS_COURSE_ID,
    title: 'What the interval is an interval of',
    kind: 'lecture-notes',
    origin: 'authored',
    attribution:
      'Lecture notes, R. Adeyemi, *Inference for Social Research* (fictional, week 3)',
    topicIds: ['stat-intervals'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-stat-int-1',
        heading: 'The quantity that varies',
        topicIds: ['stat-intervals', 'stat-sampling'],
        text: `Begin with the thing that is actually random. The population mean is a fixed number: we do not know it, but it is not moving. What moves is the sample: draw a different 400 people and you get a different sample mean.

The standard error is a statement about that movement. It is the standard deviation of the sampling distribution of the estimate: roughly, how far a typical sample mean lands from the population mean. For a mean it falls as the square root of n, which has a consequence students consistently underestimate. Going from 100 respondents to 400 does not halve your uncertainty twice over. It halves it once. Going from 400 to 1600 halves it again. Precision is expensive, and it gets more expensive the more of it you already have.`,
      },
      {
        id: 'p-stat-int-2',
        heading: 'A worked example',
        topicIds: ['stat-intervals'],
        text: `A survey of 400 respondents reports mean weekly commuting time of 244 minutes, with a sample standard deviation of 100 minutes.

The standard error is 100 / √400 = 100 / 20 = 5 minutes. A 95% interval is approximately 244 ± 1.96 × 5, which is 244 ± 9.8, or about 234 to 254 minutes.

Now note what has been assumed to get there. That the 400 were drawn in a way that makes them stand for the population. That non-response did not select on commuting time, which, for a survey about commuting, is a real worry rather than a formal one. The arithmetic is the easy part and it is not where the estimate usually goes wrong.`,
      },
      {
        id: 'p-stat-int-3',
        heading: 'Three interpretations, two of them wrong',
        topicIds: ['stat-intervals', 'stat-testing'],
        text: `"There is a 95% probability the true mean lies between 234 and 254." This is the common reading and it is not what the interval says. Under this framework the true mean is fixed. It is either in that range or it is not, and no probability attaches to it.

"95% of commuters take between 234 and 254 minutes." This confuses the interval for the mean with the spread of individuals. With a standard deviation of 100 minutes, individual commutes vary enormously more than the interval suggests.

The defensible reading is about the procedure: if we repeated this sampling and this construction many times, about 95% of the intervals produced would contain the true mean. The confidence is in the method, not in this particular interval, which is less satisfying, and is what the mathematics supports.`,
      },
    ],
  },
  {
    id: 'mat-stat-testing',
    courseId: STATS_COURSE_ID,
    title: 'p-values, and what they are conditional on',
    kind: 'reading',
    origin: 'authored',
    attribution: 'Adapted from R. Adeyemi, *Inference for Social Research* (fictional, ch. 6)',
    topicIds: ['stat-testing', 'stat-multiple'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-stat-test-1',
        heading: 'The conditional that does the work',
        topicIds: ['stat-testing'],
        text: `A p-value is the probability of observing data at least as extreme as what was observed, *assuming the null hypothesis is true*. That final clause is the whole of the definition and it is the part that gets dropped.

Dropping it produces the standard error: reading p = 0.03 as "a 3% chance the null is true". It is not. It is a statement about how surprising this data would be in a world where the null holds, and it says nothing on its own about how likely that world is. A result that would be surprising under the null is also surprising under many alternatives, including uninteresting ones such as a broken measurement instrument.`,
      },
      {
        id: 'p-stat-test-2',
        heading: 'Significance is not size',
        topicIds: ['stat-testing', 'stat-intervals'],
        text: `With a large enough sample, an effect of no practical consequence will clear any significance threshold you like. A study of 90,000 users finds that a redesign raises mean session length from 4m 12s to 4m 15s, p < 0.001. The p-value is doing its job: three seconds is very unlikely to arise by chance in a sample that large. It is still three seconds.

The discipline is to report the estimate and its interval alongside the test, so the reader sees the size of the thing as well as the confidence that it is not zero. A paper that reports only significance has withheld the number the reader needed.`,
      },
      {
        id: 'p-stat-test-3',
        heading: 'Where the error rate actually goes',
        topicIds: ['stat-multiple'],
        text: `Run one test at α = 0.05 on a true null and you have a 5% chance of a false positive. Run twenty independent such tests and the probability of at least one false positive is 1 − 0.95²⁰, which is about 64%. Nobody has cheated. The arithmetic simply accumulates.

This is why the analysis plan matters more than the analysis. Twenty tests declared in advance can be corrected for. Twenty tests run informally, of which the one that reached significance is written up, cannot be, because the count that the correction needs is no longer known, not even to the researcher, who genuinely remembers trying "a few things".`,
      },
    ],
  },
  {
    id: 'mat-stat-causal',
    courseId: STATS_COURSE_ID,
    title: 'Worked problems: reading a causal claim',
    kind: 'reading',
    origin: 'authored',
    attribution: 'Problem set 6, *Inference for Social Research* (fictional)',
    topicIds: ['stat-causal', 'stat-sampling'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-stat-caus-1',
        heading: 'The confounder that is doing the work',
        topicIds: ['stat-causal'],
        text: `A study reports that students who attend optional revision sessions score 11 marks higher on average than those who do not, and concludes the sessions are effective.

Ask who attends. Students who elect to attend an optional session on a Friday afternoon differ from those who do not in ways that also predict marks: prior attainment, time available, how seriously they are taking the course. The 11 marks is a real difference between two groups. It is not an estimate of what the sessions did, because the groups were not comparable before the sessions happened.

This is selection into treatment, and it is the ordinary condition of observational social data rather than an exotic failure.`,
      },
      {
        id: 'p-stat-caus-2',
        heading: 'What would have to be true',
        topicIds: ['stat-causal', 'stat-testing'],
        text: `For the 11-mark difference to carry a causal reading, attendance would have to be unrelated to everything else that affects the outcome, which is exactly what randomisation buys and exactly what an optional session does not have.

Short of randomising, the honest moves are to adjust for the confounders you can measure and to say plainly which you cannot. Controlling for prior attainment narrows the gap. It does not close the argument, because motivation remains unmeasured and plausibly drives both attendance and marks.

The useful habit is to state the assumption the causal reading requires, in one sentence, and then ask whether you believe it. "This holds if attenders and non-attenders would have scored the same had neither attended." Written out, it is usually easier to judge than it was to assume.`,
      },
    ],
  },
];

/**
 * The stats question bank.
 *
 * Smaller than the Atlantic bank — 22 questions against 40 — and that is a
 * deliberate asymmetry rather than an unfinished one. The brief asks for one
 * course to stay the richest example. What this bank has to do is cover every
 * format, so that mixed quizzes, written work and a two-section exam all work
 * in either course, and carry enough per-topic depth that the planner has real
 * work to schedule.
 */
export const STATS_QUESTIONS: Question[] = [
  /* ── Sampling ─────────────────────────────────────────────────────────── */
  {
    id: 'q-stat-samp-fc-1',
    courseId: STATS_COURSE_ID,
    format: 'flashcard',
    topicId: 'stat-sampling',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Sampling frame',
    answer:
      'The list from which the sample is actually drawn. Bias enters when the frame and the target population differ: the estimate then stands for the frame, not the population.',
    explanation:
      'The distinction matters because frame problems are invisible in the arithmetic: nothing in the standard error notices that the wrong people were listed.',
  },
  {
    id: 'q-stat-samp-mc-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'stat-sampling',
    difficulty: 'reasoning',
    marks: 2,
    prompt:
      'An online poll of 50,000 self-selected respondents and a random sample of 600 give different estimates of support for a policy. Which is the better basis for an inference about the population, and why?',
    options: [
      'The 50,000, because the standard error is far smaller.',
      'The 600, because self-selection biases the large poll and sample size does not fix bias.',
      'The 50,000, because a larger sample is more representative by definition.',
      'Neither, because no estimate from a sample can support an inference.',
    ],
    correctIndices: [1],
    explanation:
      'Sample size shrinks variance, not bias. The large poll estimates support among people who chose to respond, and no amount of extra respondents of that kind moves it toward the population value.',
    source: { materialId: 'mat-stat-intervals', passageId: 'p-stat-int-2' },
  },
  {
    id: 'q-stat-samp-written-1',
    courseId: STATS_COURSE_ID,
    format: 'written-recall',
    topicId: 'stat-sampling',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'A commuting survey achieves a 22% response rate. Explain, in your own words, why the response rate alone does not tell you whether the estimate of mean commuting time is biased.',
    answer:
      'Bias depends on whether non-response is related to the outcome, not on how much of it there is.',
    rubric: [
      {
        id: 'r-stat-samp-1',
        label: 'Identifies that bias depends on the relationship between non-response and the outcome',
        marks: 3,
        keywords: ['related', 'relationship', 'correlated', 'depends', 'associated', 'selects on'],
        missedAdvice:
          'The central point is conditional: a low response rate is harmless if those missing are like those present, and serious if they are not.',
      },
      {
        id: 'r-stat-samp-2',
        label: 'Gives a concrete mechanism by which commuting time could select response',
        marks: 2,
        keywords: ['long commute', 'busy', 'time', 'commuters', 'less likely to respond', 'no time'],
        missedAdvice:
          'A worked mechanism makes the argument: people with the longest commutes have the least free time in which to complete a survey about commuting.',
      },
      {
        id: 'r-stat-samp-3',
        label: 'Notes that a high response rate does not by itself guarantee an unbiased estimate',
        marks: 1,
        keywords: ['not guarantee', 'still biased', 'high response', 'no guarantee', 'even if'],
        missedAdvice:
          'The converse is worth stating: 80% response still misleads if the missing 20% are systematically different.',
      },
    ],
    explanation:
      'Response rate bounds how much bias is possible but says nothing about how much there is. The question is always whether missingness is related to what you are measuring.',
  },

  /* ── Describing distributions ─────────────────────────────────────────── */
  {
    id: 'q-stat-desc-fc-1',
    courseId: STATS_COURSE_ID,
    format: 'flashcard',
    topicId: 'stat-describing',
    difficulty: 'recall',
    marks: 1,
    prompt: 'When does the median describe a distribution better than the mean?',
    answer:
      'When the distribution is skewed or has extreme values: income, wealth, waiting times. The mean follows the tail, and the median follows the typical case.',
    explanation:
      'Neither is "correct". They answer different questions, and the skew is what decides which question you meant.',
  },
  {
    id: 'q-stat-desc-mc-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'stat-describing',
    difficulty: 'recall',
    marks: 2,
    prompt:
      'A dataset of household incomes has mean £44,000 and median £31,000. What does this tell you about its shape?',
    options: [
      'It is right-skewed: a minority of high incomes pull the mean above the median.',
      'It is left-skewed: a minority of very low incomes pull the mean down.',
      'It is symmetric, and the difference is a rounding artefact.',
      'Nothing. The mean and median are not comparable.',
    ],
    correctIndices: [0],
    explanation:
      'A mean well above the median is the signature of a long right tail, which is the ordinary shape of an income distribution.',
  },
  {
    id: 'q-stat-desc-blank-1',
    courseId: STATS_COURSE_ID,
    format: 'fill-blank',
    topicId: 'stat-describing',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the sentence.',
    template:
      'The standard deviation describes the spread of ___ in the sample, while the standard ___ describes the spread of the estimate across repeated samples.',
    blanks: [
      ['individuals', 'observations', 'individual values', 'cases', 'data points'],
      ['error'],
    ],
    explanation:
      'Conflating these two is the most common error in reading a result: one is about people, the other is about estimates.',
    source: { materialId: 'mat-stat-intervals', passageId: 'p-stat-int-3' },
  },

  /* ── Intervals ────────────────────────────────────────────────────────── */
  {
    id: 'q-stat-int-fc-1',
    courseId: STATS_COURSE_ID,
    format: 'flashcard',
    topicId: 'stat-intervals',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Standard error of a sample mean',
    answer: 's / √n, the sample standard deviation divided by the square root of the sample size.',
    explanation:
      'The √n is the important part: quadrupling the sample halves the standard error, so precision gets steadily more expensive.',
    source: { materialId: 'mat-stat-intervals', passageId: 'p-stat-int-1' },
  },
  {
    id: 'q-stat-int-mc-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'stat-intervals',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'A sample of 400 gives a mean of 244 minutes with standard deviation 100. Approximately what is the 95% confidence interval for the mean?',
    options: ['244 ± 9.8 minutes', '244 ± 100 minutes', '244 ± 196 minutes', '244 ± 5 minutes'],
    correctIndices: [0],
    explanation:
      'SE = 100/√400 = 5, and 1.96 × 5 ≈ 9.8. The last option gives one standard error rather than the 95% multiple of it.',
    source: { materialId: 'mat-stat-intervals', passageId: 'p-stat-int-2' },
  },
  {
    id: 'q-stat-int-ms-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-select',
    topicId: 'stat-intervals',
    difficulty: 'stretch',
    marks: 4,
    prompt:
      'Select every statement that is a defensible reading of a 95% confidence interval of 234 to 254 minutes.',
    options: [
      'If this sampling and construction were repeated many times, about 95% of the intervals produced would contain the true mean.',
      'There is a 95% probability that the true mean lies between 234 and 254.',
      '95% of individual commuters take between 234 and 254 minutes.',
      'Values far outside this range are less compatible with the observed data than values inside it.',
    ],
    correctIndices: [0, 3],
    explanation:
      'The first is the frequentist definition. The fourth is a compatibility reading, which is defensible. The second attaches a probability to a fixed quantity. The third confuses the interval for the mean with the spread of individuals.',
    source: { materialId: 'mat-stat-intervals', passageId: 'p-stat-int-3' },
  },
  {
    id: 'q-stat-int-order-1',
    courseId: STATS_COURSE_ID,
    format: 'ordering',
    topicId: 'stat-intervals',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Put the steps of constructing a confidence interval for a mean into order.',
    sequence: [
      'Compute the sample mean.',
      'Compute the sample standard deviation.',
      'Divide the standard deviation by the square root of the sample size to get the standard error.',
      'Multiply the standard error by the critical value for the chosen confidence level.',
      'Add and subtract that margin from the sample mean.',
    ],
    explanation:
      'The order matters because each step consumes the previous one: the margin cannot be formed before the standard error exists.',
  },
  {
    id: 'q-stat-int-written-1',
    courseId: STATS_COURSE_ID,
    format: 'written-recall',
    topicId: 'stat-intervals',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'A colleague writes: "the 95% interval is 234 to 254, so there is a 95% chance the true mean is in that range." Explain what is wrong with this, and give a reading you would accept.',
    answer:
      'Under this framework the true mean is fixed, so no probability attaches to it. The 95% describes the long-run behaviour of the procedure.',
    rubric: [
      {
        id: 'r-stat-int-1',
        label: 'States that the population mean is treated as fixed, not random',
        marks: 2,
        keywords: ['fixed', 'not random', 'constant', 'either is or is not', 'parameter'],
        missedAdvice:
          'The error is located here: probability statements are about the estimate, and the parameter is not the thing that varies.',
      },
      {
        id: 'r-stat-int-2',
        label: 'Gives the repeated-sampling interpretation',
        marks: 3,
        keywords: ['repeated', 'long run', 'many samples', '95% of intervals', 'procedure', 'method'],
        missedAdvice:
          'The accepted reading is about the procedure: repeat the sampling and construction, and about 95% of the intervals contain the true value.',
      },
      {
        id: 'r-stat-int-3',
        label: 'Notes that the confidence is in the method rather than in this one interval',
        marks: 1,
        keywords: ['this interval', 'this particular', 'method not', 'confidence in the'],
        missedAdvice:
          'Worth saying explicitly: nothing distinguishes this interval as one of the 95% rather than one of the 5%.',
      },
    ],
    explanation:
      'This is the single most common misreading in applied work, and the corrected version is genuinely less satisfying, which is why it keeps being replaced by the wrong one.',
    source: { materialId: 'mat-stat-intervals', passageId: 'p-stat-int-3' },
  },

  /* ── Testing ──────────────────────────────────────────────────────────── */
  {
    id: 'q-stat-test-fc-1',
    courseId: STATS_COURSE_ID,
    format: 'flashcard',
    topicId: 'stat-testing',
    difficulty: 'recall',
    marks: 1,
    prompt: 'p-value',
    answer:
      'The probability of data at least as extreme as that observed, assuming the null hypothesis is true.',
    explanation:
      'The assumption clause is the definition. Without it the number becomes a claim about the null being true, which it is not.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-1' },
  },
  {
    id: 'q-stat-test-mc-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'stat-testing',
    difficulty: 'reasoning',
    marks: 3,
    prompt: 'A study reports p = 0.03. Which statement is correct?',
    options: [
      'There is a 3% probability that the null hypothesis is true.',
      'There is a 97% probability that the alternative hypothesis is true.',
      'If the null were true, data this extreme or more so would occur about 3% of the time.',
      'The effect is large enough to matter in practice.',
    ],
    correctIndices: [2],
    explanation:
      'The first two invert the conditional, and the fourth confuses significance with magnitude, which no p-value speaks to.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-1' },
  },
  {
    id: 'q-stat-test-match-1',
    courseId: STATS_COURSE_ID,
    format: 'matching',
    topicId: 'stat-testing',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Match each term to what it describes.',
    pairs: [
      { left: 'Type I error', right: 'Rejecting a null hypothesis that is in fact true' },
      { left: 'Type II error', right: 'Failing to reject a null hypothesis that is in fact false' },
      { left: 'Power', right: 'The probability of detecting an effect that is really there' },
      { left: 'Effect size', right: 'How large the difference is, independent of the sample size' },
    ],
    explanation:
      'Power and effect size are the two that get left out of reporting, and they are the two a reader needs to judge a null result.',
  },
  {
    id: 'q-stat-test-blank-1',
    courseId: STATS_COURSE_ID,
    format: 'fill-blank',
    topicId: 'stat-testing',
    difficulty: 'reasoning',
    marks: 2,
    prompt: 'Complete the sentence.',
    template:
      'With a very large sample, an effect of trivial practical size can still be statistically ___, which is why an estimate and its ___ should be reported alongside the test.',
    blanks: [
      ['significant'],
      ['interval', 'confidence interval', 'uncertainty', 'ci', 'standard error'],
    ],
    explanation:
      'Significance answers "is it distinguishable from zero", and the interval answers "how big, and how sure", which is usually the question that was asked.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-2' },
  },
  {
    id: 'q-stat-test-source-1',
    courseId: STATS_COURSE_ID,
    format: 'source-analysis',
    topicId: 'stat-testing',
    difficulty: 'stretch',
    marks: 8,
    prompt:
      'Read the press summary above. Identify what the result supports, what it does not, and what you would need to see before accepting the headline claim.',
    extract: `PRESS SUMMARY. "Redesign boosts engagement", internal communications, fictional.

"Our new interface significantly increases engagement (p < 0.001, n = 90,000). Mean session length rose from 4 minutes 12 seconds to 4 minutes 15 seconds. We recommend rolling the redesign out to all users."`,
    answer:
      'The test supports a non-zero difference. It does not support "boosts engagement" in any sense a reader would take from the headline.',
    rubric: [
      {
        id: 'r-stat-test-s1',
        label: 'Identifies the gap between statistical significance and practical size',
        marks: 3,
        keywords: ['three seconds', '3 seconds', 'practical', 'trivial', 'small', 'magnitude', 'tiny'],
        missedAdvice:
          'The whole result is three seconds. With n = 90,000 that clears any threshold, and the threshold was never the interesting question.',
      },
      {
        id: 'r-stat-test-s2',
        label: 'Notes the missing interval or measure of uncertainty around the difference',
        marks: 2,
        keywords: ['interval', 'confidence', 'uncertainty', 'standard error', 'range'],
        missedAdvice:
          'The summary gives a p-value and two means and no interval, so the reader cannot see how precisely the three seconds is known.',
      },
      {
        id: 'r-stat-test-s3',
        label: 'Questions whether session length measures the outcome that was claimed',
        marks: 2,
        keywords: ['engagement', 'proxy', 'measure', 'operationalis', 'operationaliz', 'construct', 'confused'],
        missedAdvice:
          'Session length is a proxy for engagement, and a longer session can equally mean the interface is harder to use.',
      },
      {
        id: 'r-stat-test-s4',
        label: 'Asks how the comparison was run, or whether other outcomes were tested',
        marks: 1,
        keywords: ['randomis', 'randomiz', 'how many', 'other outcomes', 'pre-register', 'preregister', 'a/b', 'allocated'],
        missedAdvice:
          'Worth asking whether users were randomised and how many other outcomes were examined before this one was written up.',
      },
    ],
    explanation:
      'This is the archetype of a defensible test supporting an indefensible headline. Every individual number is correct.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-2' },
  },

  /* ── Multiple comparisons ─────────────────────────────────────────────── */
  {
    id: 'q-stat-mult-fc-1',
    courseId: STATS_COURSE_ID,
    format: 'flashcard',
    topicId: 'stat-multiple',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Researcher degrees of freedom',
    answer:
      'The analytic choices, which cases to exclude, which covariates to include, where to cut a continuous variable, that are made after seeing the data and can be made in the direction that helps.',
    explanation:
      'The term is useful because it does not require anyone to be dishonest. The choices feel reasonable one at a time.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-3' },
  },
  {
    id: 'q-stat-mult-mc-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'stat-multiple',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Twenty independent tests are run at α = 0.05, and all twenty nulls are true. Approximately what is the probability of at least one significant result?',
    options: ['5%', 'about 26%', 'about 64%', '100%'],
    correctIndices: [2],
    explanation:
      '1 − 0.95²⁰ ≈ 0.64. The per-test rate is unchanged. It is the family-wise rate that has climbed.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-3' },
  },
  {
    id: 'q-stat-mult-written-1',
    courseId: STATS_COURSE_ID,
    format: 'written-recall',
    topicId: 'stat-multiple',
    difficulty: 'stretch',
    marks: 5,
    prompt:
      'Explain why pre-registering an analysis plan addresses a problem that a statistical correction alone cannot.',
    answer:
      'A correction needs to know how many tests were run, and informal exploration destroys that count.',
    rubric: [
      {
        id: 'r-stat-mult-1',
        label: 'Identifies that corrections depend on knowing the number of tests',
        marks: 2,
        keywords: ['how many', 'number of tests', 'count', 'depends on knowing', 'unknown'],
        missedAdvice:
          'A Bonferroni correction divides by the number of comparisons, which has to be known before it can be divided by.',
      },
      {
        id: 'r-stat-mult-2',
        label: 'Explains that undeclared exploration makes that count unrecoverable',
        marks: 2,
        keywords: ['exploration', 'informal', 'not recorded', 'unrecoverable', 'do not remember', 'tried a few', 'undeclared'],
        missedAdvice:
          'The count is lost in practice, including to the researcher, who recalls "trying a few things" rather than a number.',
      },
      {
        id: 'r-stat-mult-3',
        label: 'Notes that pre-registration fixes the choices before the data are seen',
        marks: 1,
        keywords: ['in advance', 'before', 'ahead of', 'fixed', 'commit'],
        missedAdvice:
          'The mechanism is timing: choices made before the data cannot be made in the direction the data rewards.',
      },
    ],
    explanation:
      'The point is that this is a bookkeeping problem before it is a statistical one.',
    source: { materialId: 'mat-stat-testing', passageId: 'p-stat-test-3' },
  },

  /* ── Causal ───────────────────────────────────────────────────────────── */
  {
    id: 'q-stat-caus-fc-1',
    courseId: STATS_COURSE_ID,
    format: 'flashcard',
    topicId: 'stat-causal',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Confounder',
    answer:
      'A variable that influences both the supposed cause and the outcome, producing an association between them that is not causal.',
    explanation:
      'The definition has two arrows in it, and both are required: a variable affecting only the outcome is not a confounder.',
  },
  {
    id: 'q-stat-caus-mc-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'stat-causal',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Students attending optional revision sessions score 11 marks higher. What is the strongest objection to reading this as the effect of the sessions?',
    options: [
      'The sample is too small to support any inference.',
      'Attendance was chosen by students, so attenders and non-attenders likely differed before the sessions.',
      'Marks are an ordinal measure and cannot be averaged.',
      'The difference was not tested for statistical significance.',
    ],
    correctIndices: [1],
    explanation:
      'Selection into treatment is the objection. The others are either not supported by what we are told or are much weaker.',
    source: { materialId: 'mat-stat-causal', passageId: 'p-stat-caus-1' },
  },
  {
    id: 'q-stat-caus-ms-1',
    courseId: STATS_COURSE_ID,
    format: 'multiple-select',
    topicId: 'stat-causal',
    difficulty: 'stretch',
    marks: 4,
    prompt:
      'Select every step that would strengthen a causal reading of the revision-session result.',
    options: [
      'Randomly assigning students to be offered the sessions.',
      'Adjusting for prior attainment and stating which confounders remain unmeasured.',
      'Increasing the sample from 300 to 3,000 students without changing the design.',
      'Comparing outcomes before and after the sessions within the same students, with a control group.',
    ],
    correctIndices: [0, 1, 3],
    explanation:
      'A bigger sample sharpens a biased estimate without moving it toward the truth. The other three each address comparability.',
    source: { materialId: 'mat-stat-causal', passageId: 'p-stat-caus-2' },
  },
  {
    id: 'q-stat-caus-essay-1',
    courseId: STATS_COURSE_ID,
    format: 'essay',
    topicId: 'stat-causal',
    difficulty: 'stretch',
    marks: 12,
    prompt:
      '"An observational estimate can never support a causal claim." Discuss, with reference to what such a claim would require and to the conditions under which researchers accept one.',
    extract: `For reference, from the week 6 problem set:

"Short of randomising, the honest moves are to adjust for the confounders you can measure and to say plainly which you cannot. Controlling for prior attainment narrows the gap. It does not close the argument, because motivation remains unmeasured and plausibly drives both attendance and marks."`,
    answer:
      'The strong claim is too strong: observational estimates carry causal readings under assumptions, and the work is in stating and defending those assumptions.',
    rubric: [
      {
        id: 'r-stat-caus-e1',
        label: 'Takes a position on the quoted claim rather than only describing the problem',
        marks: 2,
        keywords: ['too strong', 'overstate', 'i argue', 'this essay', 'the claim is', 'defensible', 'goes too far'],
        missedAdvice:
          'The question quotes a position and asks you to discuss it. An answer that only explains confounding has not engaged with it.',
      },
      {
        id: 'r-stat-caus-e2',
        label: 'Explains what randomisation buys, in terms of comparability',
        marks: 3,
        keywords: ['randomis', 'randomiz', 'comparable', 'balance', 'expectation', 'on average the same'],
        missedAdvice:
          'Randomisation makes the groups comparable in expectation on everything, measured or not, which is precisely what selection destroys.',
      },
      {
        id: 'r-stat-caus-e3',
        label: 'Names the assumptions under which an observational estimate is read causally',
        marks: 3,
        keywords: ['assumption', 'no unmeasured', 'conditional', 'ignorab', 'exchangeab', 'all confounders', 'given the covariates'],
        missedAdvice:
          'The standard assumption is that treatment is as good as random once the measured covariates are accounted for, worth naming and worth doubting.',
      },
      {
        id: 'r-stat-caus-e4',
        label: 'Uses a concrete example to test the argument',
        marks: 2,
        keywords: ['revision', 'attendance', 'smoking', 'example', 'for instance', 'suppose', 'consider'],
        missedAdvice:
          'A worked case keeps the discussion from becoming abstract, and the revision sessions or any well-known observational finding will do.',
      },
      {
        id: 'r-stat-caus-e5',
        label: 'Acknowledges the cost of the strong position: that it would discard most social research',
        marks: 2,
        keywords: ['never randomis', 'cannot randomis', 'unethical', 'impractical', 'most research', 'would discard', 'no causal claims'],
        missedAdvice:
          'The strong claim has a consequence: a great deal of what we take ourselves to know, in epidemiology above all, is observational.',
      },
    ],
    explanation:
      'The strongest answers refuse both extremes: observational work is not proof, and treating it as worthless would discard most of what is known about smoking, diet and education.',
    source: { materialId: 'mat-stat-causal', passageId: 'p-stat-caus-2' },
  },
];
