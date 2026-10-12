import { LIMITS } from './limits.js';

/**
 * Turns a document someone already has -- a test plan, a requirements spec,
 * a backlog export, an existing suite -- into the same
 * `{ name, description, expectedResult }` notes a user would otherwise type
 * one at a time. Each extracted requirement then goes through the ordinary
 * generator, so nothing downstream knows where the note came from.
 *
 * Deterministic and dependency-free, like the template generator: plain
 * text, Markdown, Gherkin and CSV in; no network call, no model. Binary
 * formats (.docx, .pdf, .xlsx) are out of scope -- export or paste as text.
 */

export const SOURCE_LIMITS = { content: 100_000, requirements: 50 };

export const REQUIREMENT_SOURCES = Object.freeze({
  testPlan: {
    label: 'Test plan document',
    hint: 'One requirement per section. Planning sections such as Scope, Schedule or Risks are skipped; a "Features to be tested" list yields one per item.',
  },
  requirements: {
    label: 'Requirements document',
    hint: 'One requirement per ID-prefixed line (REQ-12, FR-3.1) or, without IDs, per "shall" / "must" statement.',
  },
  backlog: {
    label: 'Backlog / issue tracker',
    hint: 'A Jira or Azure DevOps CSV export, or pasted stories (PROJ-123 … / As a … I want …) with acceptance criteria.',
  },
  testSuite: {
    label: 'Existing test suite / acceptance criteria',
    hint: 'Gherkin feature files (Scenario / Given / When / Then), a test-case CSV export, or ID-prefixed acceptance criteria.',
  },
});

export const SOURCE_KEYS = Object.freeze(Object.keys(REQUIREMENT_SOURCES));

export const listRequirementSources = () =>
  SOURCE_KEYS.map((key) => ({ key, ...REQUIREMENT_SOURCES[key] }));

/* ---------------- shared text helpers ---------------- */

/** "REQ-12", "FR-3.1", "PROJ-123", "TC_04", "[US-7]" at the start of a line. */
const ID_LINE = /^\s*(?:[-*•]\s*)?\[?([A-Z][A-Z0-9]{0,9}[-_]?\d+(?:\.\d+)*)\]?\s*[:.)\-–—]?\s+(.+)$/;
const MD_HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
/** "2.1 Login" or "2.1. Login" -- at least two levels, so "1. Enter email" stays a step. */
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)+)\.?\s+([A-Z][^.!?]{1,80})$/;
const BULLET = /^\s*(?:[-*•+]|\d+[.)])\s+(.+)$/;

/** A label that switches the lines after it from "what to do" to "what should happen". */
const EXPECTED_MARKER =
  /^\s*(?:[-*•]\s*)?(?:\*\*)?(expected(?:\s+results?|\s+outcome|\s+behaviou?r)?|acceptance\s+criteri(?:a|on)|pass\s+criteria|success\s+criteria|verification|outcome)(?:\*\*)?\s*[:\-–]\s*(.*)$/i;
const DESCRIPTION_MARKER =
  /^\s*(?:[-*•]\s*)?(?:\*\*)?(description|steps|test\s+steps|procedure|details|actions?)(?:\*\*)?\s*[:\-–]\s*(.*)$/i;

const normalise = (content) => content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

const stripBullet = (line) => line.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, '').trim();

const stripMarkdown = (text) =>
  text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1').trim();

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

const firstSentence = (text) => text.split(/(?<=[.!?])\s+/)[0];

const join = (lines) => lines.map((l) => stripMarkdown(stripBullet(l))).filter(Boolean).join('\n');

/**
 * Builds a requirement that always satisfies the note bounds in
 * `testCase.js`, so an import never produces something the generate call
 * would then reject. Missing parts fall back to the parts that exist.
 */
function toRequirement({ ref = null, title = '', description = '', expected = '' }) {
  const name = stripMarkdown(title).replace(/[:\s]+$/, '') || firstSentence(description);
  if (!name) return null;

  const body = description.trim() || name;
  const outcome = expected.trim() || `The behaviour described in "${clip(name, 200)}" is observed`;

  const req = {
    ref,
    name: clip(name, LIMITS.name.max - (ref ? ref.length + 1 : 0)),
    description: clip(body, LIMITS.description.max),
    expectedResult: clip(outcome, LIMITS.expectedResult.max),
  };

  // Pad rather than drop: a terse "Logout" section is still a requirement.
  if (req.name.length < LIMITS.name.min) req.name = `Verify ${req.name}`;
  if (req.description.length < LIMITS.description.min) req.description = `Exercise ${req.description}.`;
  if (req.expectedResult.length < LIMITS.expectedResult.min) req.expectedResult = `${req.expectedResult} succeeds`;
  return req.name.length >= LIMITS.name.min ? req : null;
}

/**
 * Splits a section body into the action lines and the expected-result lines.
 * Everything after an "Expected:" / "Acceptance criteria:" label -- or a
 * Gherkin-style "Then" -- counts as expected, until a "Steps:" label
 * switches back.
 */
function splitBody(lines) {
  const description = [];
  const expected = [];
  let target = description;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const exp = line.match(EXPECTED_MARKER);
    if (exp) {
      target = expected;
      if (exp[2].trim()) target.push(exp[2]);
      continue;
    }
    const desc = line.match(DESCRIPTION_MARKER);
    if (desc) {
      target = description;
      if (desc[2].trim()) target.push(desc[2]);
      continue;
    }
    if (/^\s*(?:[-*•]\s*)?then\s+/i.test(line)) {
      target = expected;
      target.push(line.replace(/^\s*(?:[-*•]\s*)?then\s+/i, ''));
      continue;
    }
    target.push(line);
  }
  return { description: join(description), expected: join(expected) };
}

/**
 * Cuts the document at every line `startOf` recognises. Text before the
 * first start is preamble and dropped; with no starts at all, blank-line
 * separated paragraphs are the fallback units.
 */
function segment(lines, startOf) {
  const sections = [];
  let current = null;

  for (const line of lines) {
    const start = startOf(line);
    if (start) {
      current = { ...start, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections;
}

function paragraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').filter((l) => l.trim()))
    .filter((block) => block.length > 0)
    .map(([head, ...body]) => {
      const id = head.match(ID_LINE);
      return id ? { ref: id[1], title: id[2], body } : { title: stripBullet(head), body };
    });
}

const fromSections = (sections) =>
  sections.map(({ ref, title, body }) => toRequirement({ ref, title, ...splitBody(body) }));

const idStart = (line) => {
  const m = line.match(ID_LINE);
  return m && { ref: m[1], title: m[2] };
};

const headingStart = (line) => {
  const md = line.match(MD_HEADING);
  // "### 4.1 Pay with a saved card" -- the section number is not part of the name.
  if (md) return { level: md[1].length, title: md[2].replace(/^\d+(?:\.\d+)*\.?\s+/, '') };
  const num = line.match(NUMBERED_HEADING);
  return num && { level: num[1].split('.').length, title: num[2] };
};

/* ---------------- CSV (tracker and test-management exports) ---------------- */

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Header aliases, most specific first. First matching column wins. */
const COLUMNS = {
  ref: ['issue key', 'key', 'id', 'work item id', 'requirement id', 'req id', 'test id', 'test case id', 'story id'],
  name: ['summary', 'title', 'name', 'test case name', 'test case', 'scenario', 'requirement', 'user story', 'story'],
  description: ['description', 'steps', 'test steps', 'step', 'action', 'details', 'requirement text'],
  expected: [
    'expected result', 'expected results', 'expected', 'expected outcome',
    'acceptance criteria', 'acceptance criterion', 'pass criteria',
  ],
};

const headerKey = (h) => h.trim().toLowerCase().replace(/[_\s]+/g, ' ').replace(/^microsoft\.vsts\.common\./, '');

function detectCsv(text) {
  const header = text.split('\n', 1)[0];
  const delimiter = [',', ';', '\t'].sort((a, b) => header.split(b).length - header.split(a).length)[0];
  if (header.split(delimiter).length < 2) return null;

  const names = header.split(delimiter).map((h) => headerKey(h.replace(/^"|"$/g, '')));
  const known = names.some((n) => COLUMNS.name.includes(n));
  return known ? delimiter : null;
}

function fromCsv(text, delimiter) {
  const [header, ...rows] = parseCsv(text, delimiter);
  const names = header.map(headerKey);
  const col = (aliases) => {
    for (const alias of aliases) {
      const i = names.indexOf(alias);
      if (i !== -1) return i;
    }
    return -1;
  };
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, aliases]) => [k, col(aliases)]));
  const cell = (row, key) => (idx[key] === -1 ? '' : (row[idx[key]] ?? '').trim());

  return rows.map((row) => {
    // A description cell may itself carry "Acceptance criteria:" sections.
    const fromCell = splitBody(cell(row, 'description').split('\n'));
    const expected = cell(row, 'expected');
    return toRequirement({
      ref: cell(row, 'ref') || null,
      title: cell(row, 'name'),
      description: fromCell.description,
      expected: expected ? join(expected.split('\n')) : fromCell.expected,
    });
  });
}

/* ---------------- per-source text parsers ---------------- */

/** Planning sections a test plan has that are not themselves testable. */
const PLAN_BOILERPLATE =
  /^(?:\d+(?:\.\d+)*\.?\s+)?(table of contents|contents|introduction|purpose|overview|background|objectives?|scope|in scope|out of scope|features not to be tested|items not to be tested|approach|strategy|test strategy|test approach|schedule|timeline|milestones|resources|staffing|roles?(?: and responsibilities)?|responsibilities|risks?(?: and (?:mitigations?|contingencies))?|assumptions|dependencies|constraints|environment|environments|test environment|tools|deliverables|test deliverables|entry criteria|exit criteria|suspension(?: and resumption)? criteria|resumption criteria|references|glossary|definitions|approvals?|sign-?off|revision history|document history|change log|test plan)$/i;

const LISTS_ITEMS = /\b(features? to be tested|test items?|test scenarios?|test cases?|scenarios?|requirements?|features?|in-scope items?)\b/i;

function fromTestPlan(lines) {
  const sections = segment(lines, (line) => idStart(line) ?? headingStart(line));
  const out = [];

  for (const section of sections) {
    if (!section.ref && PLAN_BOILERPLATE.test(stripMarkdown(section.title))) continue;

    const content = section.body.filter((l) => l.trim());
    if (content.length === 0) continue; // a parent heading whose children carry the detail

    // "Features to be tested" style sections: every bullet is its own item.
    const bullets = content.filter((l) => BULLET.test(l));
    if (!section.ref && LISTS_ITEMS.test(section.title) && bullets.length === content.length) {
      for (const b of bullets) {
        const text = stripMarkdown(stripBullet(b));
        const id = text.match(ID_LINE);
        out.push(toRequirement({ ref: id?.[1] ?? null, title: firstSentence(id?.[2] ?? text), description: id?.[2] ?? text }));
      }
      continue;
    }
    out.push(toRequirement({ ref: section.ref ?? null, title: section.title, ...splitBody(section.body) }));
  }
  return out;
}

const SHALL = /\b(shall|must|should|will|is required to|needs to)\b/i;

function fromRequirementsDoc(lines, text) {
  // Headings in a spec are chapter titles ("3.1 Authentication"); the IDs
  // underneath are the requirements, and a heading ends the one before it.
  const sections = segment(lines, (line) => idStart(line) ?? (headingStart(line) ? { skip: true } : null));
  const withIds = sections.filter((s) => !s.skip);
  if (withIds.length > 0) {
    return withIds.map(({ ref, title, body }) => {
      const { description, expected } = splitBody(body);
      return toRequirement({
        ref,
        title: firstSentence(title),
        description: [title, description].filter(Boolean).join('\n'),
        expected: expected || `The system behaves as required by ${ref}: ${title}`,
      });
    });
  }

  // No IDs: every normative sentence is a requirement.
  return text
    .split('\n')
    .filter((l) => l.trim() && !headingStart(l))
    .flatMap((l) => stripBullet(l).split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((s) => stripMarkdown(s))
    .filter((s) => SHALL.test(s) && s.length > 12)
    .map((s) =>
      toRequirement({ title: s, description: s, expected: `The system behaves as required: ${s.replace(/[.!?]$/, '')}` }),
    );
}

const STORY_START = /^\s*(?:[-*•]\s*)?as an?\s+/i;

function fromBacklog(lines, text) {
  const sections = segment(lines, (line) => {
    const id = idStart(line);
    if (id) return id;
    const h = headingStart(line);
    if (h) return { title: h.title };
    return null;
  });

  // Pasted stories without keys or headings: a story per "As a …" paragraph.
  const units = sections.length > 0 ? sections : paragraphs(text);
  return units.map(({ ref, title, body }) => {
    const { description, expected } = splitBody(body);
    // "PROJ-1 As a shopper I want…" -- the story itself is the description,
    // and its "I want" clause is the most useful short name.
    const story = STORY_START.test(title) ? title : '';
    const want = story.match(/\bI (?:want|need|can)\s+(?:to\s+)?(.+?)(?:,?\s+so that\b|$)/i)?.[1];
    return toRequirement({
      ref: ref ?? null,
      title: want ? want.charAt(0).toUpperCase() + want.slice(1) : title,
      description: [story, description].filter(Boolean).join('\n'),
      expected,
    });
  });
}

/* ---------------- Gherkin ---------------- */

const GHERKIN_SCENARIO = /^\s*(Scenario(?: Outline| Template)?|Example):\s*(.+)$/i;
const GHERKIN_STEP = /^\s*(Given|When|Then|And|But|\*)\s+(.+)$/i;

/** Gherkin "Given" lines are setup -- phrased as steps that establish it. */
const asSetup = (text) => `Ensure ${text.charAt(0).toLowerCase()}${text.slice(1)}`;

function fromGherkin(lines) {
  const background = [];
  const scenarios = [];
  let current = null;
  let inBackground = false;
  let tags = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('@')) {
      tags = trimmed.split(/\s+/);
      continue;
    }
    if (/^Background:/i.test(trimmed)) {
      inBackground = true;
      current = null;
      continue;
    }
    const sc = trimmed.match(GHERKIN_SCENARIO);
    if (sc) {
      inBackground = false;
      const ref = tags.map((t) => t.slice(1)).find((t) => /^[A-Z][A-Z0-9]*[-_]\d+$/.test(t)) ?? null;
      current = { ref, title: sc[2], given: [], when: [], then: [], examples: null };
      scenarios.push(current);
      tags = [];
      continue;
    }
    if (/^Examples:/i.test(trimmed) && current) {
      current.examples = [];
      continue;
    }
    if (trimmed.startsWith('|') && current?.examples) {
      current.examples.push(trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      continue;
    }

    const step = trimmed.match(GHERKIN_STEP);
    if (!step) continue;
    const [, keyword, text] = step;
    if (inBackground) {
      background.push(asSetup(text));
      continue;
    }
    if (!current) continue;
    const kw = keyword.toLowerCase();
    // And / But / * continue whichever clause came before them.
    current.phase = kw === 'given' || kw === 'when' || kw === 'then' ? kw : current.phase ?? 'when';
    current[current.phase].push(current.phase === 'given' ? asSetup(text) : text);
  }

  return scenarios.flatMap((sc) => {
    const build = (row, suffix) => {
      const fill = (s) => (row ? s.replace(/<([^>]+)>/g, (m, k) => row[k] ?? m) : s);
      return toRequirement({
        ref: sc.ref,
        title: fill(sc.title) + suffix,
        description: [...background, ...sc.given, ...sc.when].map(fill).join('\n'),
        expected: sc.then.map(fill).join('\n'),
      });
    };

    // A Scenario Outline becomes one requirement per Examples row.
    if (sc.examples?.length > 1) {
      const [header, ...rows] = sc.examples;
      return rows.map((values) => {
        const row = Object.fromEntries(header.map((h, i) => [h, values[i] ?? '']));
        return build(row, ` [${header.map((h) => `${h}=${row[h]}`).join(', ')}]`);
      });
    }
    return [build(null, '')];
  });
}

function fromTestSuite(lines, text) {
  if (lines.some((l) => GHERKIN_SCENARIO.test(l))) return fromGherkin(lines);

  const sections = segment(lines, (line) => {
    const id = idStart(line);
    if (id) return id;
    const labelled = line.match(/^\s*(?:test\s*case|tc|scenario)\s*[:\-–]\s*(.+)$/i);
    if (labelled) return { title: labelled[1] };
    const h = headingStart(line);
    return h ? { title: h.title } : null;
  });
  return fromSections(sections.length > 0 ? sections : paragraphs(text));
}

/* ---------------- entry point ---------------- */

const PARSERS = {
  testPlan: (lines, text) => {
    const found = fromTestPlan(lines);
    return found.length > 0 ? found : fromSections(paragraphs(text));
  },
  requirements: fromRequirementsDoc,
  backlog: fromBacklog,
  testSuite: fromTestSuite,
};

/**
 * @param {string} sourceType one of SOURCE_KEYS
 * @param {string} content    the document as text
 * @returns {{ requirements: object[], format: 'csv'|'gherkin'|'text', truncated: boolean }}
 */
export function parseRequirements(sourceType, content) {
  const parse = PARSERS[sourceType];
  if (!parse) throw new Error(`Unknown requirement source: ${sourceType}`);

  const text = normalise(content);
  const delimiter = detectCsv(text);
  const lines = text.split('\n');

  let format = 'text';
  let found;
  if (delimiter) {
    format = 'csv';
    found = fromCsv(text, delimiter);
  } else {
    if (sourceType === 'testSuite' && lines.some((l) => GHERKIN_SCENARIO.test(l))) format = 'gherkin';
    found = parse(lines, text);
  }

  // Duplicate refs or titles would file the same thing twice.
  const seen = new Set();
  const unique = found.filter((r) => {
    if (!r) return false;
    const key = `${r.ref ?? ''}|${r.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    format,
    requirements: unique.slice(0, SOURCE_LIMITS.requirements),
    truncated: unique.length > SOURCE_LIMITS.requirements,
  };
}

/** The test-case name for a requirement: its ref leads, for traceability. */
export const requirementTitle = ({ ref, name }) => (ref ? `${ref} ${name}` : name);
