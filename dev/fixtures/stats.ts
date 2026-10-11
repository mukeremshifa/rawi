import type { StudyCourse } from '../../src/shared/domain/types';
import type { FixtureMaterial } from './types';

/**
 * The seeded statistics course, unlike the history course in the ways that matter here: compact
 * worked examples with numbers and formulas rather than long extracts. It has no syllabus. The
 * course, its authors and its data are fictional, and the numbers in the worked examples are
 * consistent so a student can check them.
 */
export const STATS_COURSE_ID = 'course-stats';

export const STATS_COURSE: StudyCourse = {
  id: STATS_COURSE_ID,
  name: 'Statistical Inference for Social Research',
  description:
    'A problem-based second-year methods course. Weekly problem sets, two in-term quizzes and a practical exam. The emphasis is on interpreting estimates rather than deriving them.',
  createdAt: new Date('2026-10-07T08:00:00.000Z').toISOString(),
};


const ADDED = new Date(Date.parse('2026-10-07T08:00:00.000Z') - 1000 * 60 * 60 * 24 * 9).toISOString();

export const STATS_MATERIALS: FixtureMaterial[] = [
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
    sections: [
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
    sections: [
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
    sections: [
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
