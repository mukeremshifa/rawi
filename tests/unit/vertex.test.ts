import { describe, expect, it } from 'vitest';

import {
  assessmentResponseSchema,
  askResponseSchema,
} from '../../src/server/assessment/schema.ts';
import { vertexEndpoint } from '../../src/server/ai/vertex.ts';

/**
 * The two things about the Vertex REST surface that are easy to get wrong and
 * expensive to discover: the host, and the schema dialect.
 *
 * Neither can be tested against the real API without spending money, so both
 * are asserted as properties of what this repo *sends*. That is the honest
 * limit of a free test, and it is the half that has actually broken people.
 */

const config = {
  project: 'my-project',
  model: 'gemini-3.6-flash',
  clientEmail: 'x@y.iam.gserviceaccount.com',
  privateKey: 'k',
  timeoutMs: 20_000,
};

describe('vertexEndpoint', () => {
  it('uses the unprefixed host for the global location', () => {
    expect(vertexEndpoint({ ...config, location: 'global' })).toBe(
      'https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-3.6-flash:generateContent',
    );
  });

  it('uses the region-prefixed host for a regional location', () => {
    // Host AND path change together. Changing only the path is a 404 that looks
    // like a wrong model name.
    expect(vertexEndpoint({ ...config, location: 'europe-west4' })).toBe(
      'https://europe-west4-aiplatform.googleapis.com/v1/projects/my-project/locations/europe-west4/publishers/google/models/gemini-3.6-flash:generateContent',
    );
  });
});

describe('the response schemas are in the OpenAPI subset Vertex accepts', () => {
  function walk(node: unknown, visit: (object: Record<string, unknown>) => void): void {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, visit);
      return;
    }
    if (node && typeof node === 'object') {
      visit(node as Record<string, unknown>);
      for (const value of Object.values(node)) walk(value, visit);
    }
  }

  const schemas = [assessmentResponseSchema, askResponseSchema];

  it('uses uppercase type names', () => {
    for (const schema of schemas) {
      walk(schema, (object) => {
        if (typeof object['type'] === 'string') {
          expect(object['type']).toBe((object['type'] as string).toUpperCase());
        }
      });
    }
  });

  it('never uses additionalProperties, which Vertex rejects outright', () => {
    for (const schema of schemas) {
      walk(schema, (object) => {
        expect(object).not.toHaveProperty('additionalProperties');
      });
    }
  });

  it('expresses nullability as `nullable`, not as an anyOf null branch', () => {
    for (const schema of schemas) {
      walk(schema, (object) => {
        expect(object).not.toHaveProperty('anyOf');
      });
    }
  });

  it('requires every property it declares', () => {
    // A model allowed to omit a field will omit the one it is least sure
    // about — which is the field the assessment most needed.
    walk(assessmentResponseSchema, (object) => {
      if (object['type'] === 'OBJECT' && object['properties']) {
        const properties = Object.keys(object['properties'] as object);
        const required = (object['required'] ?? []) as string[];
        expect([...required].sort()).toEqual([...properties].sort());
      }
    });
  });
});
