import { config } from '../config.js';
import { DestinationError } from '../utils/errors.js';
import { jiraExporter } from './jiraExporter.js';
import { confluenceExporter } from './confluenceExporter.js';
import { excelExporter } from './excelExporter.js';
import { createWorkItemExporter } from './workItemExporter.js';

/**
 * The destination registry. Every exporter satisfies the same contract:
 *
 *   key           stable id used by the API and the UI dropdown
 *   label         display name
 *   kind          'issue' | 'page' | 'workitem' | 'file'
 *   auth          'atlassian' | 'pat' | 'none'
 *   describeTarget()            one line naming where the test case lands
 *   export(testCase, ctx)       performs the write, returns { kind, ref, url? }
 *   describeRequest(testCase)   what export would send for one case, for display
 *
 * Adding a destination means adding one module here and one env block in
 * config.js -- the generator, the service and the UI stay untouched. That is
 * the whole reason the generator emits a tracker-agnostic test case.
 */
const ALL = {
  jira: jiraExporter,
  confluence: confluenceExporter,
  excel: excelExporter,
  ado: createWorkItemExporter('ado', 'Azure DevOps'),
  tfs: createWorkItemExporter('tfs', 'TFS'),
};

/** Only destinations enabled in DESTINATIONS are reachable at runtime. */
const enabled = new Map(config.destinations.map((key) => [key, ALL[key]]));

export function getExporter(key) {
  const exporter = enabled.get(key);
  if (!exporter) {
    throw new DestinationError(
      `Destination "${key}" is not enabled. Available: ${[...enabled.keys()].join(', ')}.`,
    );
  }
  return exporter;
}

export const enabledKeys = () => [...enabled.keys()];

/** Shape the UI needs to populate the destination dropdown. */
export function listDestinations() {
  return [...enabled.values()].map((e) => ({
    key: e.key,
    label: e.label,
    kind: e.kind,
    auth: e.auth,
    target: e.describeTarget(),
  }));
}

/** True when any enabled destination needs the Atlassian OAuth session. */
export const needsAtlassianAuth = () =>
  [...enabled.values()].some((e) => e.auth === 'atlassian');
