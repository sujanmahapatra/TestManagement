import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Platforms, test types and negative variants are data, not code, so a QA
 * lead can tune the generated boilerplate -- or add a platform -- without a
 * deploy of new JavaScript. Point GENERATION_CONFIG_PATH at your own file to
 * override the bundled defaults wholesale.
 */

const platformSchema = z.object({
  label: z.string().min(1),
  preconditions: z.array(z.string().min(1)).min(1),
  launchStep: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
  checks: z.array(z.string().min(1)).default([]),
});

const testTypeSchema = z.object({
  label: z.string().min(1),
  description: z.string().default(''),
  includePlatformChecks: z.boolean().default(true),
  impliesNegativeVariants: z.boolean().default(false),
  extraSteps: z.array(z.string().min(1)).default([]),
  assertions: z.array(z.string().min(1)).default([]),
});

const negativeVariantSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1),
  stepSuffix: z.string().min(1),
  assertions: z.array(z.string().min(1)).min(1),
});

const schema = z.object({
  platforms: z.record(platformSchema).refine((p) => Object.keys(p).length > 0, {
    message: 'at least one platform must be defined',
  }),
  testTypes: z.record(testTypeSchema).refine((t) => Object.keys(t).length > 0, {
    message: 'at least one test type must be defined',
  }),
  negativeVariants: z.array(negativeVariantSchema).min(1),
});

function load() {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = process.env.GENERATION_CONFIG_PATH
    ? resolve(process.env.GENERATION_CONFIG_PATH)
    : resolve(here, '../../config/generation.json');

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read generation config at ${path}: ${err.message}`);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid generation config (${path}):\n${lines.join('\n')}`);
  }
  return Object.freeze(result.data);
}

export const generationConfig = load();

export const PLATFORM_KEYS = Object.freeze(Object.keys(generationConfig.platforms));
export const TEST_TYPE_KEYS = Object.freeze(Object.keys(generationConfig.testTypes));

/** Shape the UI needs to populate its dropdowns. */
export const listPlatforms = () =>
  PLATFORM_KEYS.map((key) => ({
    key,
    label: generationConfig.platforms[key].label,
    environments: generationConfig.platforms[key].environments,
  }));

export const listTestTypes = () =>
  TEST_TYPE_KEYS.map((key) => ({
    key,
    label: generationConfig.testTypes[key].label,
    description: generationConfig.testTypes[key].description,
    impliesNegativeVariants: generationConfig.testTypes[key].impliesNegativeVariants,
  }));

export const listNegativeVariants = () =>
  generationConfig.negativeVariants.map(({ key, label }) => ({ key, label }));
