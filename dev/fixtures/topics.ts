import type { StudyCourse } from '../../src/shared/domain/types';

/**
 * The seeded history course. Everything in it is fictional, and says so on screen: the historians
 * named in the readings and their books are invented. It has no syllabus, so its topics come from
 * its materials.
 */
export const ATLANTIC_COURSE_ID = 'course-atlantic';

export const SEED_COURSE: StudyCourse = {
  id: ATLANTIC_COURSE_ID,
  name: 'The Atlantic World, 1500 to 1800',
  description:
    'A reading-heavy introductory survey of the Atlantic basin from first contact to the age of revolutions, taught through primary extracts and competing historiography.',
  createdAt: new Date('2026-10-07T08:00:00.000Z').toISOString(),
};
