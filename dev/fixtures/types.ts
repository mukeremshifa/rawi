import type { MaterialKind } from '../../src/shared/domain/types';

/**
 * Fixture shapes. A fixture material is authored as headed sections and
 * published through the Markdown adapter.
 */
export interface FixtureSection {
  id: string;
  heading: string;
  topicIds: string[];
  text: string;
}
export interface FixtureMaterial {
  id: string;
  courseId: string;
  title: string;
  kind: MaterialKind;
  origin: 'authored';
  attribution?: string;
  topicIds: string[];
  addedAt: string;
  sections: FixtureSection[];
}
