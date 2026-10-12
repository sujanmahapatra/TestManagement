import { z } from 'zod';

/**
 * Configuration is parsed and frozen once, at boot. A deployment with a
 * missing secret fails here rather than on the first user request.
 *
 * Destinations are opt-in: each block is validated only when that
 * destination is listed in DESTINATIONS, so a Jira-only deployment never has
 * to supply Azure DevOps credentials.
 */

/**
 * Parses an env var holding a JSON object of extra tracker fields. Invalid
 * JSON fails at boot with the variable named, rather than producing a 400
 * from the tracker on the first real request.
 */
const jsonObject = (name) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw || !raw.trim()) return {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not a JSON object');
        }
        return parsed;
      } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${name} must be a JSON object: ${err.message}` });
        return z.NEVER;
      }
    });

const csv = (raw) =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const atlassianSchema = z.object({
  clientId: z.string().min(1, 'CLIENT_ID is required for Jira or Confluence'),
  clientSecret: z.string().min(1, 'CLIENT_SECRET is required for Jira or Confluence'),
  redirectUri: z.string().url('REDIRECT_URI must be an absolute URL'),
  scopes: z.array(z.string()),
});

const jiraSchema = z.object({
  baseUrl: z.string().url('JIRA_BASE_URL must be an absolute URL'),
  projectKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, 'JIRA_PROJECT_KEY must be an uppercase project key'),
  issueType: z.string().min(1).default('Test'),
  platformField: z
    .string()
    .regex(/^customfield_\d+$/, 'JIRA_PLATFORM_FIELD must look like customfield_12345')
    .optional(),
  defaultLabels: z.array(z.string()).default([]),
  extraFields: jsonObject('JIRA_EXTRA_FIELDS'),
  // How a filed test case is linked to the story it was generated from.
  linkType: z.string().min(1).default('Relates'),
});

const confluenceSchema = z.object({
  baseUrl: z.string().url('CONFLUENCE_BASE_URL must be an absolute URL'),
  spaceKey: z.string().min(1, 'CONFLUENCE_SPACE_KEY is required'),
  parentPageId: z.string().regex(/^\d+$/, 'CONFLUENCE_PARENT_PAGE_ID must be numeric').optional(),
});

/** Azure DevOps and TFS share this shape; only the host and api-version differ. */
const workItemSchema = (prefix) =>
  z.object({
    baseUrl: z.string().url(`${prefix}_URL must be an absolute URL`),
    project: z.string().min(1, `${prefix}_PROJECT is required`),
    pat: z.string().min(1, `${prefix}_PAT is required`),
    workItemType: z.string().min(1).default('Test Case'),
    apiVersion: z.string().min(1),
    areaPath: z.string().optional(),
    iterationPath: z.string().optional(),
    extraFields: jsonObject(`${prefix}_EXTRA_FIELDS`),
  });

const excelSchema = z.object({
  sheetName: z.string().min(1).default('Test Case'),
});

export const DESTINATION_KEYS = ['jira', 'confluence', 'excel', 'ado', 'tfs'];

const schema = z.object({
  port: z.coerce.number().int().positive().default(4000),
  corsOrigin: z.string().min(1).default('http://localhost:5173'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  isProduction: z.boolean(),
  destinations: z.array(z.enum(DESTINATION_KEYS)).min(1, 'At least one destination must be enabled'),
  // A shared password in front of the app. Unset: open to anyone with the link.
  appPassword: z.string().min(8, 'APP_PASSWORD must be at least 8 characters').optional(),
  generator: z.object({
    strategy: z.enum(['template', 'llm']).default('template'),
    apiKey: z.string().optional(),
    model: z.string(),
    // Unset: Anthropic's API. An Anthropic-compatible endpoint such as
    // https://api.deepseek.com/anthropic sends the same requests elsewhere.
    baseUrl: z.string().url('ANTHROPIC_BASE_URL must be an absolute URL').optional(),
    // 'anthropic' uses Claude-only features (structured outputs, PDF documents,
    // refusal fallback); 'compatible' sticks to what compatible endpoints accept.
    // 'groq' uses Groq's OpenAI-style API (GROQ_API_KEY), which takes priority.
    provider: z.enum(['anthropic', 'compatible', 'groq']),
    groqApiKey: z.string().optional(),
    // A model on this machine (Ollama): no forced tool choice, which it does
    // not support, and a long timeout, since it may run on the CPU.
    local: z.boolean(),
  }),

  // The test case agent reads documents and images and is driven by Claude, so
  // it is available exactly when an API key is -- whatever GENERATOR says.
  agent: z.object({
    enabled: z.boolean(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
    // Output budget per run. Compatible endpoints often cap output lower than Claude.
    maxTokens: z.coerce.number().int().min(2000).max(128000),
    // A Figma personal access token (file content: read) lets the agent
    // render design frames as context. Optional.
    figmaToken: z.string().optional(),
  }),

  atlassian: atlassianSchema.optional(),
  // The simpler alternative to OAuth: an Atlassian account's email and API
  // token (id.atlassian.com -> Security -> API tokens). Works for Jira and
  // Confluence, needs no app registration or callback URL, and acts as that
  // one account for everyone using the tool.
  atlassianToken: z
    .object({
      email: z.string().email('ATLASSIAN_EMAIL must be the email of the Atlassian account'),
      apiToken: z.string().min(10, 'ATLASSIAN_API_TOKEN looks too short'),
    })
    .optional(),
  jira: jiraSchema.optional(),
  confluence: confluenceSchema.optional(),
  excel: excelSchema.optional(),
  ado: workItemSchema('ADO').optional(),
  tfs: workItemSchema('TFS').optional(),
})
  // LLM generation without a key would fail silently into the template
  // fallback on every request; fail at boot instead.
  .refine((c) => c.generator.strategy !== 'llm' || Boolean(c.generator.apiKey), {
    path: ['generator', 'apiKey'],
    message: 'ANTHROPIC_API_KEY is required when GENERATOR=llm',
  });

/**
 * Atlassian scopes depend on which Atlassian products are enabled -- asking
 * for Confluence scopes on a Jira-only deployment would make consent request
 * access the tool never uses.
 */
function atlassianScopes(destinations) {
  const scopes = ['offline_access']; // required to receive a refresh token
  if (destinations.includes('jira')) scopes.push('read:jira-work', 'write:jira-work');
  if (destinations.includes('confluence')) {
    // read:confluence-content.all lets the agent import a page as context.
    scopes.push('read:confluence-space.summary', 'write:confluence-content', 'read:confluence-content.all');
  }
  return scopes;
}

function load() {
  const destinations = csv(process.env.DESTINATIONS).length
    ? csv(process.env.DESTINATIONS)
    : ['jira'];

  const enabled = (key) => destinations.includes(key);
  const needsAtlassian = enabled('jira') || enabled('confluence');
  const apiToken = process.env.ATLASSIAN_API_TOKEN || process.env.JIRA_API_TOKEN || undefined;

  const result = schema.safeParse({
    port: process.env.PORT,
    corsOrigin: process.env.CORS_ORIGIN,
    logLevel: process.env.LOG_LEVEL,
    isProduction: process.env.NODE_ENV === 'production',
    appPassword: process.env.APP_PASSWORD || undefined,
    destinations,
    generator: (() => {
      const baseUrl = process.env.ANTHROPIC_BASE_URL || undefined;
      let host = '';
      try {
        host = baseUrl ? new URL(baseUrl).hostname : '';
      } catch {
        // Left to the schema, which reports the malformed URL by name.
      }
      const anthropic = !baseUrl || /(^|\.)anthropic\.com$/.test(host);
      const groqApiKey = process.env.GROQ_API_KEY || undefined;
      return {
        strategy: process.env.GENERATOR || 'template',
        apiKey: process.env.ANTHROPIC_API_KEY || undefined,
        groqApiKey,
        baseUrl,
        provider: groqApiKey ? 'groq' : anthropic ? 'anthropic' : 'compatible',
        local: !groqApiKey && /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)$/.test(host),
        model: groqApiKey
          ? process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
          : process.env.GENERATOR_MODEL || (anthropic ? 'claude-opus-5-5' : /deepseek/.test(baseUrl) ? 'deepseek-v4-pro' : 'claude-opus-5-5'),
      };
    })(),
    agent: {
      enabled: Boolean(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY),
      effort: process.env.AGENT_EFFORT || undefined,
      // Groq's free tier allows 8,000 tokens a minute, prompt included.
      maxTokens:
        process.env.AGENT_MAX_TOKENS ||
        (process.env.GROQ_API_KEY ? 6000 : process.env.ANTHROPIC_BASE_URL && !/anthropic\.com/.test(process.env.ANTHROPIC_BASE_URL) ? 32000 : 64000),
      figmaToken: process.env.FIGMA_TOKEN || undefined,
    },

    atlassianToken: apiToken ? { email: process.env.ATLASSIAN_EMAIL || process.env.JIRA_EMAIL, apiToken } : undefined,

    // OAuth is only needed when no API token is configured.
    atlassian: needsAtlassian && !apiToken
      ? {
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.CLIENT_SECRET,
          redirectUri: process.env.REDIRECT_URI,
          scopes: atlassianScopes(destinations),
        }
      : undefined,

    jira: enabled('jira')
      ? {
          baseUrl: process.env.JIRA_BASE_URL,
          projectKey: process.env.JIRA_PROJECT_KEY,
          issueType: process.env.JIRA_ISSUE_TYPE,
          platformField: process.env.JIRA_PLATFORM_FIELD || undefined,
          defaultLabels: csv(process.env.JIRA_DEFAULT_LABELS),
          extraFields: process.env.JIRA_EXTRA_FIELDS,
          linkType: process.env.JIRA_LINK_TYPE || undefined,
        }
      : undefined,

    confluence: enabled('confluence')
      ? {
          baseUrl: process.env.CONFLUENCE_BASE_URL || process.env.JIRA_BASE_URL,
          spaceKey: process.env.CONFLUENCE_SPACE_KEY,
          parentPageId: process.env.CONFLUENCE_PARENT_PAGE_ID || undefined,
        }
      : undefined,

    excel: enabled('excel') ? { sheetName: process.env.EXCEL_SHEET_NAME } : undefined,

    ado: enabled('ado')
      ? {
          baseUrl: process.env.ADO_ORG_URL,
          project: process.env.ADO_PROJECT,
          pat: process.env.ADO_PAT,
          workItemType: process.env.ADO_WORK_ITEM_TYPE,
          apiVersion: process.env.ADO_API_VERSION || '7.0',
          areaPath: process.env.ADO_AREA_PATH || undefined,
          iterationPath: process.env.ADO_ITERATION_PATH || undefined,
          extraFields: process.env.ADO_EXTRA_FIELDS,
        }
      : undefined,

    tfs: enabled('tfs')
      ? {
          baseUrl: process.env.TFS_COLLECTION_URL,
          project: process.env.TFS_PROJECT,
          pat: process.env.TFS_PAT,
          workItemType: process.env.TFS_WORK_ITEM_TYPE,
          // On-prem TFS predates the 7.x APIs; 5.1 is the safe floor.
          apiVersion: process.env.TFS_API_VERSION || '5.1',
          areaPath: process.env.TFS_AREA_PATH || undefined,
          iterationPath: process.env.TFS_ITERATION_PATH || undefined,
          extraFields: process.env.TFS_EXTRA_FIELDS,
        }
      : undefined,
  });

  if (!result.success) {
    // Report field paths and messages only. Printing the parsed input here
    // would write CLIENT_SECRET into the boot log.
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return Object.freeze(result.data);
}

export const config = load();
