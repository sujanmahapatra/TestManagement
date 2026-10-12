import { config } from '../config.js';
import { atlassianTarget, usesApiToken } from '../clients/atlassian.js';
import { isConnected } from '../clients/atlassianAuth.js';

/**
 * Checks the Jira link end to end -- sign-in, project, issue type, link type
 * -- and says in plain words what to fix, so a problem shows up before an
 * export fails rather than during it.
 */

const TIMEOUT_MS = 15_000;

async function get(target, path) {
  const res = await fetch(`${target.jiraApi}${path}`, {
    headers: { authorization: target.auth, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/**
 * @returns {Promise<{ configured: boolean, ok: boolean, message: string, mode?: string, site?: string,
 *   account?: string, project?: { key, name }, issueType?: string, issueTypes?: string[], needsAuth?: boolean }>}
 */
export async function checkJira(sessionId) {
  if (!config.jira && config.pausedDestinations?.includes('jira')) {
    return {
      configured: false,
      ok: false,
      paused: true,
      message: 'Jira is switched on but not signed in yet. Add ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN (on Render: your service, then Environment), along with JIRA_BASE_URL and JIRA_PROJECT_KEY.',
    };
  }
  if (!config.jira) {
    return { configured: false, ok: false, message: 'Jira is not switched on. Add jira to DESTINATIONS in server/.env.' };
  }
  const mode = usesApiToken() ? 'api-token' : 'oauth';
  const base = { configured: true, mode, site: config.jira.baseUrl, project: { key: config.jira.projectKey } };
  if (mode === 'oauth' && !isConnected(sessionId)) {
    return { ...base, ok: false, needsAuth: true, message: 'Connect Atlassian to use Jira.' };
  }

  let target;
  try {
    target = await atlassianTarget('jira', sessionId);
    const me = await get(target, '/myself');
    if (me.status === 401 || me.status === 403) {
      return {
        ...base,
        ok: false,
        message:
          mode === 'api-token'
            ? 'Jira rejected the sign-in. Check ATLASSIAN_EMAIL is the account email and ATLASSIAN_API_TOKEN is a current API token, and that JIRA_BASE_URL is your site (https://yoursite.atlassian.net).'
            : 'The Atlassian session has expired. Connect again.',
        needsAuth: mode === 'oauth',
      };
    }
    if (me.status === 404) return { ...base, ok: false, message: `No Jira site answers at ${config.jira.baseUrl}. Check JIRA_BASE_URL.` };
    if (me.status !== 200) return { ...base, ok: false, message: `Jira answered ${me.status} when signing in. Try again shortly.` };
    const account = me.body?.displayName ?? me.body?.emailAddress ?? 'your account';

    const project = await get(target, `/project/${encodeURIComponent(config.jira.projectKey)}`);
    if (project.status === 404 || project.status === 403) {
      return {
        ...base,
        account,
        ok: false,
        message: `Project ${config.jira.projectKey} was not found, or ${account} cannot see it. Check JIRA_PROJECT_KEY (the prefix of its issue keys, e.g. QA in QA-12).`,
      };
    }
    if (project.status !== 200) return { ...base, account, ok: false, message: `Jira answered ${project.status} for project ${config.jira.projectKey}.` };

    const types = await get(target, `/issue/createmeta/${encodeURIComponent(config.jira.projectKey)}/issuetypes`);
    const issueTypes = (types.body?.issueTypes ?? types.body?.values ?? []).map((t) => t.name).filter(Boolean);
    const issueType = issueTypes.find((t) => t.toLowerCase() === config.jira.issueType.toLowerCase());
    const projectInfo = { key: project.body.key, name: project.body.name };
    if (issueTypes.length && !issueType) {
      return {
        ...base,
        account,
        project: projectInfo,
        issueTypes,
        ok: false,
        message: `Project ${projectInfo.key} has no "${config.jira.issueType}" issue type. Set JIRA_ISSUE_TYPE to one of: ${issueTypes.join(', ')}.`,
      };
    }

    const linkTypes = await get(target, '/issueLinkType');
    const names = (linkTypes.body?.issueLinkTypes ?? []).map((t) => t.name);
    const linkOk = !names.length || names.some((n) => n.toLowerCase() === config.jira.linkType.toLowerCase());

    return {
      ...base,
      account,
      project: projectInfo,
      issueType: issueType ?? config.jira.issueType,
      issueTypes,
      ok: true,
      message: linkOk
        ? `Connected as ${account} to ${projectInfo.name} (${projectInfo.key}). Test cases are filed as ${issueType ?? config.jira.issueType} issues.`
        : `Connected as ${account} to ${projectInfo.key}, but the "${config.jira.linkType}" link type does not exist, so cases will not be linked to their stories. Set JIRA_LINK_TYPE to one of: ${names.join(', ')}.`,
    };
  } catch (err) {
    if (err?.code === 'not_connected' || err?.code === 'reauth_required') {
      return { ...base, ok: false, needsAuth: true, message: err.message };
    }
    return { ...base, ok: false, message: `Could not reach Jira at ${config.jira.baseUrl}: ${err.message}` };
  }
}
