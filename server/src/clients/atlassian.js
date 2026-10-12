import { config } from '../config.js';
import { getAccessToken } from './atlassianAuth.js';

/**
 * Where to send Jira and Confluence requests, and how to sign them -- one
 * place, so the exporters and the requirement import do not care whether the
 * deployment uses an API token or the per-browser OAuth session.
 *
 *   API token (ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN): Basic auth straight to
 *   the site, e.g. https://acme.atlassian.net/rest/api/3. One account for all.
 *
 *   OAuth 2.0 (3LO): a bearer token via api.atlassian.com/ex/{product}/{cloudId},
 *   per browser session, after consent.
 */

const API_HOST = 'https://api.atlassian.com';

export const usesApiToken = () => Boolean(config.atlassianToken);

const site = (url) => String(url).replace(/\/$/, '');

/**
 * @param {'jira' | 'confluence'} product
 * @returns {Promise<{ jiraApi?: string, wiki?: string, auth: string }>}
 *   `jiraApi` is the REST v3 root; `wiki` is the Confluence root, under which
 *   both `/rest/api` and `/api/v2` live. `auth` is the Authorization header.
 */
export async function atlassianTarget(product, sessionId) {
  if (usesApiToken()) {
    const { email, apiToken } = config.atlassianToken;
    const auth = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    if (product === 'jira') return { jiraApi: `${site(config.jira.baseUrl)}/rest/api/3`, auth };
    return { wiki: `${site(config.confluence.baseUrl)}/wiki`, auth };
  }
  const { accessToken, cloudIds } = await getAccessToken(sessionId);
  const auth = `Bearer ${accessToken}`;
  if (product === 'jira') return { jiraApi: `${API_HOST}/ex/jira/${cloudIds.jira}/rest/api/3`, auth };
  return { wiki: `${API_HOST}/ex/confluence/${cloudIds.confluence}/wiki`, auth };
}
