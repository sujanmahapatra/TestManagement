import JSZip from 'jszip';
import ExcelJS from 'exceljs';

/**
 * Plain text out of Word, PowerPoint and Excel files, so the agent can read
 * them. Claude reads PDFs and images natively but not Office formats, and a
 * text rendering keeps what matters for test design -- headings, paragraphs,
 * lists, table rows, slide text -- without a heavyweight converter.
 *
 * .docx and .pptx are zip archives of XML; .xlsx goes through ExcelJS, which
 * the Excel exporter already depends on.
 */

/** Text is capped well inside the model's context; a PRD is rarely this long. */
const MAX_CHARS = 300_000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });

/** Collapses runs of blank lines and trims each line's trailing space. */
const tidy = (text) =>
  text
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);

/** WordprocessingML -> text: paragraphs become lines, table cells are joined with " | ". */
function wordXmlToText(xml) {
  return xml
    // A cell holds paragraphs of its own; keep them on the row's line.
    .replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cell) => cell.replace(/<\/w:p>/g, ' '))
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:pStyle w:val="(Heading\d|Title)"\/>/g, '\n# ') // keep headings recognisable
    .replace(/<w:numPr\b[^>]*>/g, '- ') // list items
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '');
}

export async function docxToText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const body = zip.file('word/document.xml');
  if (!body) throw new Error('not a Word document');
  return tidy(decodeEntities(wordXmlToText(await body.async('string'))));
}

export async function pptxToText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, n: Number(path.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter((s) => s.n)
    .sort((a, b) => a.n - b.n);
  if (slides.length === 0) throw new Error('not a PowerPoint presentation');

  const parts = [];
  for (const { path, n } of slides) {
    const xml = await zip.file(path).async('string');
    const text = decodeEntities(xml.replace(/<\/a:p>/g, '\n').replace(/<a:br\/>/g, '\n').replace(/<[^>]+>/g, ''));
    parts.push(`## Slide ${n}\n${text}`);
  }
  return tidy(parts.join('\n\n'));
}

/** One CSV-like block per sheet; requirement trackers export to Excel a lot. */
export async function xlsxToText(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const parts = [];
  workbook.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = row.values.slice(1).map((v) => {
        if (v == null) return '';
        if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map((r) => r.text).join('') ?? '');
        return String(v);
      });
      rows.push(cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','));
    });
    if (rows.length) parts.push(`## Sheet: ${sheet.name}\n${rows.join('\n')}`);
  });
  if (parts.length === 0) throw new Error('the workbook has no data');
  return tidy(parts.join('\n\n'));
}

/**
 * PDF -> text, page by page. Claude reads PDFs natively; this is for
 * Anthropic-compatible providers (DeepSeek) that accept only text and images.
 */
export async function pdfToText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t, i) => `## Page ${i + 1}\n${t}`).join('\n\n');
  if (!pages.replace(/## Page \d+/g, '').trim()) throw new Error('the PDF has no text layer (is it a scan?)');
  return tidy(pages);
}

/** HTML (Jira rendered fields, Confluence storage format) -> readable text. */
export function htmlToText(html) {
  return tidy(
    decodeEntities(
      String(html ?? '')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n${'#'.repeat(Number(n))} `)
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|pre)>/gi, '\n')
        .replace(/<\/t[dh]>/gi, ' | ')
        .replace(/<[^>]+>/g, ''),
    ),
  );
}
