import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

// Covers where the agent's requirements come from besides typed text:
// Office files converted to text, link parsing for Jira, Confluence and
// Figma, and the Figma frame fetch against a stubbed fetch. Config is set
// before the first import because config.js validates it at import time.
process.env.DESTINATIONS = 'jira,confluence,excel';
process.env.CLIENT_ID = 'test-client-id';
process.env.CLIENT_SECRET = 'test-client-secret';
process.env.REDIRECT_URI = 'http://localhost:4000/auth/callback';
process.env.JIRA_BASE_URL = 'https://example.atlassian.net';
process.env.JIRA_PROJECT_KEY = 'QA';
process.env.CONFLUENCE_SPACE_KEY = 'QADOCS';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.FIGMA_TOKEN = 'figd_test';
process.env.LOG_LEVEL = 'silent';

const { docxToText, pptxToText, xlsxToText, htmlToText } = await import('../src/domain/officeText.js');
const { parseJiraKeys, parseConfluencePageId, parseFigmaUrl, fetchFigmaFrames, availableSources, figmaStructure } = await import(
  '../src/domain/agentSources.js'
);
const { runAgent, setAgentClient } = await import('../src/domain/testCaseAgent.js');
const { agentRequestSchema } = await import('../src/domain/testCase.js');
const { config } = await import('../src/config.js');

/* ---------------- Office files ---------------- */

async function makeDocx() {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<w:document><w:body>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Checkout</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Shoppers can apply one discount code &amp; see the new total.</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Expired codes show an error</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Code</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Discount</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('a Word document keeps its headings, paragraphs, list items and table rows', async () => {
  const text = await docxToText(await makeDocx());
  assert.match(text, /# Checkout/);
  assert.match(text, /apply one discount code & see the new total\./);
  assert.match(text, /- Expired codes show an error/);
  assert.match(text, /Code\s*\|\s*Discount/);
});

test('a presentation becomes text slide by slide, in slide order', async () => {
  const zip = new JSZip();
  zip.file('ppt/slides/slide10.xml', '<p:sld><a:p><a:r><a:t>Tenth</a:t></a:r></a:p></p:sld>');
  zip.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:r><a:t>Login flow</a:t></a:r></a:p><a:p><a:r><a:t>Two-factor step</a:t></a:r></a:p></p:sld>');
  const text = await pptxToText(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.ok(text.indexOf('## Slide 2') < text.indexOf('## Slide 10'));
  assert.match(text, /Login flow\nTwo-factor step/);
});

test('a workbook becomes one CSV block per sheet', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stories');
  sheet.addRow(['ID', 'Story']);
  sheet.addRow(['US-1', 'As a shopper, I apply a code']);
  const text = await xlsxToText(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.match(text, /## Sheet: Stories/);
  assert.match(text, /US-1,"As a shopper, I apply a code"/);
});

test('a file that is not really Office is refused', async () => {
  await assert.rejects(docxToText(Buffer.from('not a zip')));
});

test('HTML from Jira and Confluence reads as text', () => {
  const text = htmlToText('<h2>Rules</h2><ul><li>Max <b>3</b> attempts</li><li>Lock for 15&nbsp;min</li></ul><p>A &lt;b&gt; tag</p>');
  assert.match(text, /## Rules/);
  assert.match(text, /- Max 3 attempts\n- Lock for 15 min/);
  assert.match(text, /A <b> tag/);
});

test('the agent sends an attached Word document as a text document', async () => {
  const calls = [];
  setAgentClient({
    beta: {
      messages: {
        stream(params) {
          calls.push(params);
          return {
            on() { return this; },
            async finalMessage() {
              return { stop_reason: 'end_turn', model: 'm', usage: {}, parsed_output: { summary: '', assumptions: [], changeSummary: '', scenarios: [] } };
            },
          };
        },
      },
    },
  });
  const input = agentRequestSchema.parse({
    platform: 'web',
    files: [{
      name: 'prd.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: (await makeDocx()).toString('base64'),
    }],
  });
  await runAgent(input, () => {});
  const doc = calls[0].messages[0].content[0];
  assert.equal(doc.type, 'document');
  assert.equal(doc.source.type, 'text');
  assert.match(doc.source.data, /discount code/);
});

test('an unreadable Office file fails with a message naming it', async () => {
  const input = agentRequestSchema.parse({
    platform: 'web',
    files: [{ name: 'broken.pptx', mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data: 'AAAA' }],
  });
  await assert.rejects(runAgent(input, () => {}), /broken\.pptx could not be read/);
});

/* ---------------- link parsing ---------------- */

test('Jira keys come from keys, lists and issue links', () => {
  assert.deepEqual(parseJiraKeys('qa-12, QA-13 QA-12'), ['QA-12', 'QA-13']);
  assert.deepEqual(parseJiraKeys('https://acme.atlassian.net/browse/PAY-401'), ['PAY-401']);
  assert.deepEqual(parseJiraKeys('https://acme.atlassian.net/jira/software/projects/PAY/boards/1?selectedIssue=PAY-7'), ['PAY-7']);
  assert.deepEqual(parseJiraKeys('no key here'), []);
});

test('Confluence page ids come from links or bare ids', () => {
  assert.equal(parseConfluencePageId('https://acme.atlassian.net/wiki/spaces/QA/pages/123456/Checkout+PRD'), '123456');
  assert.equal(parseConfluencePageId('https://acme.atlassian.net/wiki/pages/viewpage.action?pageId=987'), '987');
  assert.equal(parseConfluencePageId('42'), '42');
  assert.equal(parseConfluencePageId('Checkout PRD'), null);
});

test('Figma links give the file key and the frame id', () => {
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/AbC123/Checkout?node-id=12-34&t=x'), { key: 'AbC123', nodeId: '12:34' });
  assert.deepEqual(parseFigmaUrl('https://www.figma.com/file/AbC123/Checkout'), { key: 'AbC123', nodeId: null });
  assert.equal(parseFigmaUrl('https://example.com/design/x'), null);
});

test('the server reports which link sources it can use', () => {
  assert.deepEqual(availableSources(), { jira: true, confluence: true, figma: true });
});

/* ---------------- Figma structure ---------------- */

test("a design's structure lists screens, text, component properties and interactions", () => {
  const login = {
    id: '1:1',
    type: 'FRAME',
    name: 'Login',
    children: [
      { id: '1:2', type: 'TEXT', name: 'Title', characters: 'Welcome back' },
      {
        id: '1:3',
        type: 'INSTANCE',
        name: 'Button',
        componentProperties: { 'Variant#12:0': { type: 'VARIANT', value: 'Primary' }, 'Disabled#3:1': { type: 'BOOLEAN', value: false } },
        interactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: '2:1', navigation: 'NAVIGATE' }] }],
      },
      { id: '1:4', type: 'TEXT', name: 'Hidden', characters: 'Secret', visible: false },
    ],
  };
  const home = { id: '2:1', type: 'FRAME', name: 'Home', children: [] };
  const text = figmaStructure('Chat app', [login, home]);
  assert.match(text, /## Screen: Login/);
  assert.match(text, /- Text "Title": Welcome back/);
  assert.match(text, /- Component Button \(Variant=Primary, Disabled=false\)/);
  assert.match(text, /on on click → navigate to "Home"|on click → navigate to "Home"/);
  assert.doesNotMatch(text, /Secret/);
  assert.match(text, /## Screen: Home/);
});

/* ---------------- Figma frame picker ---------------- */

test('a Figma link lists its frames with previews, and imports only the chosen ones', async (t) => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const page = {
    id: '1:2',
    type: 'CANVAS',
    children: [
      { id: '3:1', type: 'FRAME', name: 'Modals', absoluteBoundingBox: { width: 1440, height: 850 } },
      { id: '3:2', type: 'FRAME', name: 'Report', absoluteBoundingBox: { width: 1440, height: 900 } },
      { id: '3:3', type: 'TEXT', name: 'Note' },
    ],
  };
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    urls.push(u);
    const json = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (u.includes('/nodes?') && u.includes('depth=1')) return json({ name: 'Reports', nodes: { '1:2': { document: page } } });
    if (u.includes('/nodes?')) return json({ nodes: { '3:2': { document: { ...page.children[1], children: [] } } } });
    if (u.includes('/images/')) return json({ images: { '3:1': 'https://cdn.figma.test/1.png', '3:2': 'https://cdn.figma.test/2.png' } });
    return new Response(png, { status: 200 });
  });

  const { listFigmaFrames } = await import('../src/domain/agentSources.js');
  const list = await listFigmaFrames('https://www.figma.com/design/KEY1/Reports?node-id=1-2');
  assert.equal(list.fileName, 'Reports');
  assert.deepEqual(list.frames.map((f) => [f.name, f.width, f.height, Boolean(f.preview)]), [
    ['Modals', 1440, 850, true],
    ['Report', 1440, 900, true],
  ]);
  assert.match(urls.find((u) => u.includes('/images/')), /scale=0\.25/);

  const imported = await fetchFigmaFrames('https://www.figma.com/design/KEY1/Reports?node-id=1-2', ['3:2']);
  assert.equal(imported.label, 'Reports (1 frame)');
  assert.deepEqual(imported.attachments.map((a) => a.name), ['Figma – Reports – structure.txt', 'Figma – Report.png']);
});

/* ---------------- Figma fetch ---------------- */

test('a Figma page link renders the frames inside it as PNG attachments', async (t) => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    seen.push({ url: String(url), token: init?.headers?.['x-figma-token'] });
    const json = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (String(url).includes('/nodes?')) {
      return json({
        name: 'Checkout',
        nodes: { '1:2': { document: { id: '1:2', type: 'CANVAS', children: [
          { id: '3:1', type: 'FRAME', name: 'Cart' },
          { id: '3:2', type: 'TEXT', name: 'Note' },
          { id: '3:3', type: 'FRAME', name: 'Payment / Card' },
        ] } } },
      });
    }
    if (String(url).includes('/images/')) {
      return json({ images: { '3:1': 'https://cdn.figma.test/cart.png', '3:3': 'https://cdn.figma.test/pay.png' } });
    }
    return new Response(png, { status: 200 });
  });

  const result = await fetchFigmaFrames('https://www.figma.com/design/KEY1/Checkout?node-id=1-2');
  assert.equal(result.attachments.length, 2);
  assert.deepEqual(result.attachments.map((a) => a.name), ['Figma – Cart.png', 'Figma – Payment   Card.png']);
  assert.equal(result.attachments[0].mediaType, 'image/png');
  assert.equal(result.label, 'Checkout (2 frames)');
  assert.ok(seen.filter((s) => s.url.startsWith('https://api.figma.com')).every((s) => s.token === config.agent.figmaToken));
  assert.match(seen[1].url, /ids=3%3A1%2C3%3A3/);
});
