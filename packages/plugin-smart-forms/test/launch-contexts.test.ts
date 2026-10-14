// launchContextsOf reads each root launchContext as Smart Forms reads it. The shapes are checked
// against the module, then against the pinned populate (test/reproduction/populate.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LaunchContext, launchContextsOf } from '../src/launch-contexts.js';
import { populate } from './reproduction/populate.js';
import { documentOf, expression, ext, questionnaire, sdc } from './support/sites.js';

type Json = Record<string, unknown>;

const LAUNCH_CONTEXT = `${sdc}launchContext`;

const launchContext = (...extension: unknown[]): Json => ({ url: LAUNCH_CONTEXT, extension });
const name = { url: 'name', valueCoding: { system: LAUNCH_CONTEXT, code: 'patient' } };
const type = { url: 'type', valueCode: 'Patient' };
const description = { url: 'description', valueString: 'The patient' };
const question = { linkId: 'a', type: 'string' };

const read = (resource: Json): readonly LaunchContext[] => launchContextsOf(documentOf(resource));

// A reading, with what it does not find left out.
interface Reading {
  readonly name?: string;
  readonly type?: string;
}

// One root launchContext of each shape, with how the module reads it.
const shapes: readonly {
  readonly title: string;
  readonly parts: readonly unknown[];
  readonly expected: {
    readonly byUrl: Reading;
    readonly byPosition: Reading;
    readonly input: boolean;
    readonly boundName?: string;
  };
}[] = [
  {
    title: 'name then type',
    parts: [name, type],
    expected: {
      byUrl: { name: 'patient', type: 'Patient' },
      byPosition: { name: 'patient', type: 'Patient' },
      input: true,
      boundName: 'patient',
    },
  },
  {
    title: 'type first',
    parts: [type, name],
    expected: {
      byUrl: { name: 'patient', type: 'Patient' },
      byPosition: {},
      input: true,
    },
  },
  {
    title: 'description before type',
    parts: [name, description, type],
    expected: {
      byUrl: { name: 'patient', type: 'Patient' },
      byPosition: { name: 'patient' },
      input: true,
    },
  },
  {
    title: 'name, type, then description',
    parts: [name, type, description],
    expected: {
      byUrl: { name: 'patient', type: 'Patient' },
      byPosition: { name: 'patient', type: 'Patient' },
      input: true,
      boundName: 'patient',
    },
  },
  {
    title: 'valueId and valueCoding.code both present',
    parts: [{ url: 'name', valueId: 'patient', valueCoding: { code: 'subject' } }, type],
    expected: {
      byUrl: { name: 'patient', type: 'Patient' },
      byPosition: { name: 'patient', type: 'Patient' },
      input: true,
      boundName: 'patient',
    },
  },
  {
    title: 'an empty valueId with a code',
    parts: [{ url: 'name', valueId: '', valueCoding: { code: 'patient' } }, type],
    expected: {
      byUrl: { type: 'Patient' },
      byPosition: { type: 'Patient' },
      input: true,
    },
  },
  {
    title: 'no name',
    parts: [type],
    expected: { byUrl: { type: 'Patient' }, byPosition: {}, input: false },
  },
  {
    title: 'no type',
    parts: [name],
    expected: { byUrl: { name: 'patient' }, byPosition: { name: 'patient' }, input: false },
  },
  {
    title: 'a non-object sub-extension first',
    parts: ['name', name, type],
    expected: {
      byUrl: { name: 'patient', type: 'Patient' },
      byPosition: {},
      input: true,
    },
  },
  {
    // Core declares a launchContext by its first name sub-extension, which here has no name.
    title: 'a launchContext core does not declare',
    parts: [{ url: 'x', valueId: 'patient' }, type, { url: 'name' }, { url: 'name', valueId: 'y' }],
    expected: {
      byUrl: { type: 'Patient' },
      byPosition: { name: 'patient', type: 'Patient' },
      input: true,
      boundName: 'patient',
    },
  },
];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('launchContextsOf', () => {
  it.each(shapes)('reads $title', ({ parts, expected }) => {
    expect(read(questionnaire({ extension: [launchContext(...parts)] }))).toEqual([
      { pointer: '/extension/0', index: 0, ...expected },
    ]);
  });

  it('reads every root launchContext, at its index, skipping other entries', () => {
    const contexts = read(
      questionnaire({
        extension: [
          'launchContext',
          { url: `${sdc}sourceQueries`, valueReference: { reference: '#b' } },
          launchContext(name, type),
          launchContext(
            { url: 'name', valueCoding: { code: 'user' } },
            { url: 'type', valueCode: 'Practitioner' },
          ),
        ],
      }),
    );
    expect(
      contexts.map(({ pointer, index, boundName }) => ({ pointer, index, boundName })),
    ).toEqual([
      { pointer: '/extension/2', index: 2, boundName: 'patient' },
      { pointer: '/extension/3', index: 3, boundName: 'user' },
    ]);
  });

  it('reads a launchContext of any shape', () => {
    expect(read(questionnaire({ extension: [{ url: LAUNCH_CONTEXT }] }))).toEqual([
      { pointer: '/extension/0', index: 0, byUrl: {}, byPosition: {}, input: false },
    ]);
  });

  it('ignores a launchContext on an item', () => {
    expect(
      read(questionnaire({ item: [{ ...question, extension: [launchContext(name, type)] }] })),
    ).toEqual([]);
  });

  it('ignores a launchContext in the root modifierExtension', () => {
    expect(read(questionnaire({ modifierExtension: [launchContext(name, type)] }))).toEqual([]);
  });
});

// Each shape against populate 4.7.1, with the launchContext as the form's only input: population
// runs exactly when it is an input, fetches nothing, and binds exactly the bound name.
describe('launchContextsOf against populate 4.7.1', () => {
  it.each(shapes)('agrees with populate on $title', async ({ parts }) => {
    const form = questionnaire({
      extension: [launchContext(...parts)],
      item: [
        {
          ...question,
          extension: [ext(`${sdc}initialExpression`, expression('text/fhirpath', "'x'"))],
        },
      ],
    });
    const [launch] = launchContextsOf(documentOf(form));
    const { success, urls, context } = await populate(form);
    expect(success).toBe(launch?.input);
    expect(urls).toEqual([]);
    // populatedContext also holds population's own %resource and %rootResource.
    const bound = Object.keys(context ?? {}).filter(
      (key) => key !== 'resource' && key !== 'rootResource',
    );
    expect(bound).toEqual(launch?.boundName === undefined ? [] : [launch.boundName]);
  });
});
