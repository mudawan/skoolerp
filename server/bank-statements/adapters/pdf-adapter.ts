import { AdapterError, type ParsedStatement, type StatementAdapter, type StatementInput } from '../types';
import { parseLayout, layoutConfidence, type LayoutCell, type LayoutLine } from './pdf-layout';

const isPdf = (b: Buffer) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-';

interface RawItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Groups positioned text fragments into visual lines, and fragments on a line into cells. */
export function itemsToLines(pages: RawItem[][]): LayoutLine[] {
  const out: LayoutLine[] = [];
  pages.forEach((items, pageIdx) => {
    const sorted = items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: RawItem[][] = [];
    for (const it of sorted) {
      const g = groups[groups.length - 1];
      const tol = Math.max(2, it.h * 0.45);
      if (g && Math.abs(g[0].y - it.y) <= tol) g.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      g.sort((a, b) => a.x - b.x);
      const cells: LayoutCell[] = [];
      for (const it of g) {
        const last = cells[cells.length - 1];
        const gap = last ? it.x - last.x1 : Infinity;
        // Words inside one column sit ~0.25em apart; separate columns sit well over half an em apart.
        const threshold = Math.max(4, it.h * 0.6);
        if (last && gap < threshold) {
          last.text = `${last.text}${gap > 0.8 ? ' ' : ''}${it.str.trim()}`;
          last.x1 = Math.max(last.x1, it.x + it.w);
        } else {
          cells.push({ x0: it.x, x1: it.x + it.w, text: it.str.trim() });
        }
      }
      out.push({ page: pageIdx + 1, y: g[0].y, cells });
    }
  });
  return out;
}

export async function extractLayout(buffer: Buffer): Promise<LayoutLine[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc: any;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err: any) {
    if (err?.name === 'PasswordException') {
      throw new AdapterError('The PDF is password-protected. Remove the password and upload it again.');
    }
    throw new AdapterError(`The PDF could not be read (${err?.message || 'corrupt file'}).`);
  }
  const pages: RawItem[][] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((i: any) => typeof i.str === 'string')
          .map((i: any) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) || 8 }))
      );
    }
  } finally {
    await doc.destroy?.();
  }
  return itemsToLines(pages);
}

const cache = new WeakMap<Buffer, Promise<LayoutLine[]>>();
const layoutOf = (buf: Buffer) => {
  let p = cache.get(buf);
  if (!p) {
    p = extractLayout(buf);
    cache.set(buf, p);
  }
  return p;
};

export const genericPdfAdapter: StatementAdapter = {
  id: 'generic-pdf',
  version: '1.0.0',
  label: 'Generic text-PDF statement',
  formats: ['pdf'],
  async detect(input: StatementInput): Promise<number> {
    if (!isPdf(input.buffer)) return 0;
    try {
      return layoutConfidence(await layoutOf(input.buffer));
    } catch {
      return 0.1;
    }
  },
  async parse(input: StatementInput): Promise<ParsedStatement> {
    if (!isPdf(input.buffer)) throw new AdapterError('This file is not a PDF.');
    return parseLayout(await layoutOf(input.buffer), this.id, this.version);
  },
};
