import type { MaterialKind, Question } from '../../src/shared/domain/types';

/**
 * Fixture shapes. A fixture material is authored as headed sections and
 * published through the Markdown adapter. Sources name a section, and the
 * seed resolves each one to the block ids of its published version by
 * matching the section heading.
 */
export interface FixtureSection { id: string; heading: string; topicIds: string[]; text: string }
export interface FixtureMaterial {
  id: string; courseId: string; title: string; kind: MaterialKind; origin: 'authored';
  attribution?: string; topicIds: string[]; addedAt: string; sections: FixtureSection[];
}
export type FixtureSource = { materialId: string; sectionId: string };
export type FixtureQuestion = Omit<Question, 'source'> & { source?: FixtureSource };
