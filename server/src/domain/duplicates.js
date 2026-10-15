/**
 * "Review duplicates": finds saved test cases that check the same thing in
 * different words, so a reviewer can keep one and remove the rest.
 *
 * Deterministic and free: two cases are compared by the words of their titles
 * and of their steps and expected results (Jaccard overlap, after dropping
 * common words and plural endings). Cases whose overlap passes the threshold
 * are linked, and linked cases form a group.
 */

const STOP_WORDS = new Set(
  (
    'a an the and or of to in on at for with by from as is are be been being was were it its this that these those ' +
    'can should must will shall may then than when while into onto upon after before during via per ' +
    'user users test case cases verify check ensure validate that via page screen app application ' +
    'happy path negative positive edge'
  ).split(' '),
);

/** Lower-case words with stop words and plural endings removed. */
export function wordsOf(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

const jaccard = (a, b) => {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
};

const bodyOf = (c) => [...(c.preconditions ?? []), ...(c.steps ?? []), ...(c.stepResults ?? []), ...(c.expectedResults ?? [])].join(' ');

/** How alike two cases are, 0..1: mostly the title, then the steps and results. */
export function similarity(a, b) {
  const title = jaccard(a.titleWords, b.titleWords);
  if (a.bodyWords.size === 0 || b.bodyWords.size === 0) return title;
  return 0.6 * title + 0.4 * jaccard(a.bodyWords, b.bodyWords);
}

/** More steps and results is more complete; on a tie the older (lower TC number) case wins. */
const keyNumber = (c) => Number(String(c.key ?? '').replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER;
const completeness = (c) => (c.steps?.length ?? 0) + (c.expectedResults?.length ?? 0) + (c.preconditions?.length ?? 0);
const better = (a, b) => completeness(b) - completeness(a) || keyNumber(a) - keyNumber(b);

/**
 * Groups of likely duplicates among `cases`, most alike first.
 *
 * @returns {{ id: string, similarity: number, keepId: string, caseIds: string[] }[]}
 */
export function findDuplicates(cases, { threshold = 0.55 } = {}) {
  const items = cases.map((c) => ({ case: c, titleWords: wordsOf(c.title), bodyWords: wordsOf(bodyOf(c)) }));

  // Union-find over every pair alike enough.
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const best = new Map(); // root -> highest pair similarity in the group
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = similarity(items[i], items[j]);
      if (s < threshold) continue;
      const [ri, rj] = [find(i), find(j)];
      const top = Math.max(s, best.get(ri) ?? 0, best.get(rj) ?? 0);
      parent[rj] = ri;
      best.set(ri, top);
    }
  }

  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item.case);
  });

  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => {
      const ordered = [...members].sort(better);
      return {
        id: ordered.map((c) => c.id).join('+'),
        similarity: Math.round((best.get(find(root)) ?? threshold) * 100) / 100,
        keepId: ordered[0].id,
        caseIds: ordered.map((c) => c.id),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Pairs worth a closer look, most alike first: a loose word overlap that
 * catches rewordings, for the AI to confirm or reject.
 *
 * @returns {{ a: object, b: object, similarity: number }[]}
 */
export function candidatePairs(cases, { threshold = 0.25, limit = 40 } = {}) {
  const items = cases.map((c) => ({ case: c, titleWords: wordsOf(c.title), bodyWords: wordsOf(bodyOf(c)) }));
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = similarity(items[i], items[j]);
      if (s >= threshold) pairs.push({ a: items[i].case, b: items[j].case, similarity: Math.round(s * 100) / 100 });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity).slice(0, limit);
}

/** Groups from confirmed pairs: linked cases form one group, the most complete case kept. */
export function groupPairs(pairs) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id);
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const byId = new Map();
  for (const p of pairs) {
    byId.set(p.a.id, p.a);
    byId.set(p.b.id, p.b);
    parent.set(find(p.b.id), find(p.a.id));
  }
  const groups = new Map();
  for (const p of pairs) {
    const root = find(p.a.id);
    if (!groups.has(root)) groups.set(root, { ids: new Set(), similarity: 0, reasons: [] });
    const g = groups.get(root);
    g.ids.add(p.a.id).add(p.b.id);
    g.similarity = Math.max(g.similarity, p.similarity);
    if (p.reason) g.reasons.push(p.reason);
  }
  return [...groups.values()]
    .map((g) => {
      const ordered = [...g.ids].map((id) => byId.get(id)).sort(better);
      return {
        id: ordered.map((c) => c.id).join('+'),
        similarity: g.similarity,
        keepId: ordered[0].id,
        caseIds: ordered.map((c) => c.id),
        reason: [...new Set(g.reasons)].join(' '),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}
