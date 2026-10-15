import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Thumbs up / down on a generation, so the team can see which requirements
 * the agent handles badly. One JSON line per rating, appended -- nothing is
 * rewritten, so concurrent ratings cannot clobber each other.
 */

const DEFAULT_PATH = fileURLToPath(new URL('../../data/feedback.jsonl', import.meta.url));
const filePath = () => process.env.FEEDBACK_PATH || DEFAULT_PATH;

/** Saves one rating with when it was given and which model wrote the cases. */
export async function saveFeedback(entry, { model }) {
  const record = { at: new Date().toISOString(), model, ...entry };
  await mkdir(dirname(filePath()), { recursive: true });
  await appendFile(filePath(), `${JSON.stringify(record)}\n`);
  return record;
}

/** Totals, and the most recent thumbs-down with what the reviewer said. */
export async function feedbackSummary({ recent = 20 } = {}) {
  let lines = [];
  try {
    lines = (await readFile(filePath(), 'utf8')).split('\n').filter(Boolean);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const entries = lines.flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  return {
    up: entries.filter((e) => e.rating === 'up').length,
    down: entries.filter((e) => e.rating === 'down').length,
    recentDown: entries
      .filter((e) => e.rating === 'down')
      .slice(-recent)
      .reverse()
      .map(({ at, prompt, comment, cases }) => ({ at, prompt, comment, cases })),
  };
}
