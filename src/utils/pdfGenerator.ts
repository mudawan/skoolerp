import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { FeeVoucher, InstituteProfile, BankAccount, Student, SchoolClass, FeeTemplate, ParticularKind, VoucherItem } from '../types';
import { formatCurrency, formatMonthName, getAppliedFineAmount } from './feeMath';

export interface PdfExportContext {
  institute: InstituteProfile;
  bankAccounts: BankAccount[];
  students: Student[];
  classes: SchoolClass[];
  templates?: FeeTemplate[];
  roundingMultiple?: number;
}

export interface PdfExportOptions {
  mode: 'single_pdf' | 'zip_pdfs';
}

const imageCache = new Map<string, string>();

/**
 * Preload and convert an image URL to a high-quality PNG data URL for jsPDF embedding
 */
export async function preloadImageForPdf(url?: string): Promise<string | null> {
  if (!url || typeof window === 'undefined') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (imageCache.has(trimmed)) return imageCache.get(trimmed)!;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(img.naturalWidth || img.width || 128, 64);
        canvas.height = Math.max(img.naturalHeight || img.height || 128, 64);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          imageCache.set(trimmed, dataUrl);
          resolve(dataUrl);
          return;
        }
      } catch (err) {
        console.warn('Canvas conversion failed for PDF logo:', err);
      }
      resolve(trimmed);
    };
    img.onerror = () => {
      console.warn('Image preloading failed for PDF logo:', trimmed);
      resolve(null);
    };
    img.src = trimmed;
  });
}

/**
 * Render RTL text (such as Urdu or Arabic) to a high-DPI PNG data URL using native browser canvas text shaping.
 * This guarantees proper Nastaliq/Arabic ligature connections, right-to-left orientation, and zero glyph corruption in jsPDF.
 */
function renderRtlTextToImage(
  text: string,
  widthMm: number,
  options?: {
    fontSizePt?: number;
    textColor?: string;
  }
): { dataUrl: string; widthMm: number; heightMm: number } | null {
  if (!text || typeof document === 'undefined') return null;

  const dpr = 4; // 4x supersampling for crisp vector-like print quality
  const pxPerMm = 3.7795275591; // Standard 96 DPI to mm
  const canvasWidthPx = Math.max(10, Math.round(widthMm * pxPerMm * dpr));

  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return null;

  const fontSizePx = (options?.fontSizePt || 6.8) * 1.333 * dpr;
  const fontFamily =
    "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', 'Segoe UI', Tahoma, sans-serif";
  const fontStyle = `600 ${fontSizePx}px ${fontFamily}`;
  tempCtx.font = fontStyle;
  tempCtx.direction = 'rtl';

  // Measure and wrap words to avoid any clipping
  const maxLineAvailablePx = (widthMm * pxPerMm - 2) * dpr;
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const metrics = tempCtx.measureText(candidate);
    if (metrics.width > maxLineAvailablePx && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  const lineHeightPx = fontSizePx * 1.65;
  const verticalPaddingPx = 1.5 * dpr;
  const totalCanvasHeightPx = Math.max(10, Math.round(lines.length * lineHeightPx + verticalPaddingPx * 2));
  const heightMm = totalCanvasHeightPx / (pxPerMm * dpr);

  // Main drawing canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidthPx;
  canvas.height = totalCanvasHeightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.font = fontStyle;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options?.textColor || '#334155'; // slate-700

  const drawX = canvasWidthPx - 2 * dpr;
  lines.forEach((line, idx) => {
    const y = verticalPaddingPx + (idx + 0.5) * lineHeightPx;
    ctx.fillText(line, drawX, y);
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthMm,
    heightMm,
  };
}

/**
 * Render 3 copies (BANK COPY, INSTITUTE COPY, STUDENT COPY) of a fee voucher onto a single page of jsPDF document.
 */
function renderVoucherToPdfPage(
  doc: jsPDF,
  voucher: FeeVoucher,
  context: PdfExportContext
) {
  const student = context.students.find((s) => s.id === voucher.studentId);
  const schoolClass = context.classes.find((c) => c.id === voucher.classId);
  const activeBank =
    context.bankAccounts.find((b) => b.active && b.isDefault) ||
    context.bankAccounts.find((b) => b.active);

  const copies = [
    { title: 'BANK COPY', tagR: 30, tagG: 58, tagB: 138 },      // Dark blue
    { title: 'INSTITUTE COPY', tagR: 15, tagG: 118, tagB: 110 }, // Dark teal
    { title: 'STUDENT COPY', tagR: 30, tagG: 41, tagB: 59 },     // Dark slate
  ];

  const colWidth = 88;
  const colGap = 8;
  const leftMargin = 8;
  const topY = 8;

  copies.forEach((copy, colIdx) => {
    const colX = leftMargin + colIdx * (colWidth + colGap);

    // Outer card border
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.4);
    doc.rect(colX, topY, colWidth, 194, 'D');

    // Copy Tag Badge Header
    doc.setFillColor(copy.tagR, copy.tagG, copy.tagB);
    doc.rect(colX + 2, topY + 2, 34, 6, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(copy.title, colX + 4, topY + 6);

    // Voucher Number (top right of copy)
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.text(voucher.voucherNo, colX + colWidth - 3, topY + 6, { align: 'right' });

    // Institute Header & Logo
    const addressStr = context.institute.address || '';
    const truncatedAddress = addressStr.length > 48 ? addressStr.substring(0, 46) + '...' : addressStr;
    const logoUrl = context.institute.logoUrl;
    const hasLogo = Boolean(logoUrl && logoUrl.trim().length > 0);

    if (hasLogo) {
      try {
        const format = logoUrl.startsWith('data:image/jpeg') || logoUrl.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
        doc.addImage(logoUrl, format, colX + 3, topY + 9.5, 12, 12);
      } catch (e) {
        console.warn('Could not draw logo in voucher PDF copy:', e);
      }

      // Draw text shifted to make room for logo
      const textCenterX = colX + 16 + (colWidth - 18) / 2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const instName = (context.institute.name || 'INSTITUTE').toUpperCase();
      const truncatedName = instName.length > 30 ? instName.substring(0, 28) + '..' : instName;
      doc.text(truncatedName, textCenterX, topY + 13.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(truncatedAddress, textCenterX, topY + 17.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(15, 118, 110); // teal-800
      doc.text(`FEE VOUCHER • ${formatMonthName(voucher.month).toUpperCase()}`, textCenterX, topY + 21.5, {
        align: 'center',
      });
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text((context.institute.name || 'INSTITUTE').toUpperCase(), colX + colWidth / 2, topY + 14, {
        align: 'center',
      });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(truncatedAddress, colX + colWidth / 2, topY + 18, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 118, 110); // teal-800
      doc.text(`FEE VOUCHER • ${formatMonthName(voucher.month).toUpperCase()}`, colX + colWidth / 2, topY + 22, {
        align: 'center',
      });
    }

    // Divider Line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(colX + 3, topY + 24, colX + colWidth - 3, topY + 24);

    // Student Details Grid (Moved up directly under institute header)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(colX + 3, topY + 26, 82, 17, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);

    // Col 1 of Student Grid
    doc.text('Student Name:', colX + 5, topY + 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const stuName = (student?.name || 'Unknown').length > 20 ? (student?.name || 'Unknown').substring(0, 18) + '..' : (student?.name || 'Unknown');
    doc.text(stuName, colX + 5, topY + 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('Class:', colX + 5, topY + 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(schoolClass?.name || 'N/A', colX + 5, topY + 42);

    // Col 2 of Student Grid
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('Registration No.:', colX + 44, topY + 30);
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(student?.regNo || 'N/A', colX + 44, topY + 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('Father Name:', colX + 44, topY + 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const fatherName = (student?.fatherName || 'N/A').length > 20 ? (student?.fatherName || 'N/A').substring(0, 18) + '..' : (student?.fatherName || 'N/A');
    doc.text(fatherName, colX + 44, topY + 42);

    // Date Bar: Issue Date on Left, Due Date on Right
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(251, 191, 36);  // amber-400
    doc.rect(colX + 3, topY + 45, 82, 6, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(120, 53, 15); // amber-900
    doc.text(`Issue Date: ${voucher.issueDate}`, colX + 5, topY + 49.2);
    doc.text(`Due Date: ${voucher.dueDate}`, colX + colWidth - 5, topY + 49.2, { align: 'right' });

    // Particulars Table Header ("Particulars" on left, "Amount (Rs.)" on right)
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225);
    doc.rect(colX + 3, topY + 53, 82, 5.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.text('Particulars', colX + 5, topY + 56.8);
    doc.text('Amount (Rs.)', colX + colWidth - 5, topY + 56.8, { align: 'right' });

    // Itemized Particulars Rows (all line items ordered strictly as defined in Settings module)
    const standardOrder: { kind: ParticularKind; defaultLabel: string }[] = [
      { kind: 'Tuition', defaultLabel: 'Tuition Fee' },
      { kind: 'Flex1', defaultLabel: 'Admission Fee' },
      { kind: 'Flex2', defaultLabel: 'Registration Fee' },
      { kind: 'Transport', defaultLabel: 'Transport Fee' },
      { kind: 'Fine', defaultLabel: 'Fine' },
      { kind: 'Flex3', defaultLabel: 'Exam Fee' },
      { kind: 'Flex4', defaultLabel: 'Other' },
      { kind: 'PreviousBalance', defaultLabel: 'Previous Balance' },
      { kind: 'Discount', defaultLabel: 'Discount in Fee' },
    ];

    const globalTemplates = (context.templates || [])
      .filter((t) => !t.studentId && !t.classId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const classTemplates = (context.templates || []).filter(
      (t) => !t.studentId && t.classId === voucher.classId && (!t.month || t.month === voucher.month)
    );
    const studentTemplates = (context.templates || []).filter(
      (t) => t.studentId === student?.id && (!t.month || t.month === voucher.month)
    );

    // Build ordered list following globalTemplates sortOrder, ensuring strictly unique kinds
    const sortMap = new Map<ParticularKind, number>();
    globalTemplates.forEach((t) => sortMap.set(t.kind, t.sortOrder));
    classTemplates.forEach((t) => {
      if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
    });
    studentTemplates.forEach((t) => {
      if (t.sortOrder !== undefined) sortMap.set(t.kind, t.sortOrder);
    });

    const orderedKinds: { kind: ParticularKind; defaultLabel: string }[] = standardOrder
      .slice()
      .sort((a, b) => {
        const orderA = sortMap.get(a.kind) ?? 99;
        const orderB = sortMap.get(b.kind) ?? 99;
        return orderA - orderB;
      });

    const itemsToRender: VoucherItem[] = orderedKinds.map((ordered) => {
      const existing = voucher.particulars.find((p) => p.kind === ordered.kind);
      const studentOverride = studentTemplates.find((t) => t.kind === ordered.kind);
      const classOverride = classTemplates.find((t) => t.kind === ordered.kind);
      const globalTpl = globalTemplates.find((t) => t.kind === ordered.kind);
      let label = studentOverride?.label || classOverride?.label || globalTpl?.label || (existing ? existing.label : ordered.defaultLabel);
      // Ensure Tuition Fee does not have (Class ...) appended
      if (ordered.kind === 'Tuition') {
        label = label.replace(/\s*\(Class[^)]*\)/gi, '').trim() || 'Tuition Fee';
      } else if (ordered.kind === 'Transport') {
        label = studentOverride?.label || classOverride?.label || globalTpl?.label || 'Transport Fee';
      }
      return {
        kind: ordered.kind,
        label,
        amount: existing ? existing.amount : 0,
      };
    });

    let itemY = topY + 62.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);

    itemsToRender.forEach((item) => {
      doc.setTextColor(30, 41, 59);
      const labelStr = item.label.length > 28 ? item.label.substring(0, 26) + '..' : item.label;
      doc.text(labelStr, colX + 5, itemY);

      if (item.amount < 0) {
        doc.setTextColor(4, 120, 87); // emerald-700
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(item.amount), colX + colWidth - 5, itemY, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      // Light dotted line under row
      doc.setDrawColor(241, 245, 249);
      doc.line(colX + 3, itemY + 1.2, colX + colWidth - 3, itemY + 1.2);

      itemY += 4.8;
    });

    // Net Due Amount Line (Lightened sophisticated theme with border)
    const netDueY = itemY + 1.5;
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(colX + 3, netDueY, 82, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59); // slate-800
    const effectiveRoundingMultiple = voucher.roundingMultiple ?? context.roundingMultiple ?? 10;
    doc.text(
      effectiveRoundingMultiple > 1
        ? `NET DUE AMOUNT (ROUNDED TO ${effectiveRoundingMultiple}):`
        : 'NET DUE AMOUNT:',
      colX + 5,
      netDueY + 4.5
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 118, 110); // teal-700
    doc.text(formatCurrency(voucher.netDue), colX + colWidth - 5, netDueY + 4.5, { align: 'right' });

    // Payable After Due Date Line
    const payableAfterDueDate = voucher.netDue + getAppliedFineAmount(voucher, effectiveRoundingMultiple);
    const afterDueY = netDueY + 7.2;
    doc.setFillColor(254, 242, 242); // rose-50
    doc.setDrawColor(254, 205, 211); // rose-200
    doc.rect(colX + 3, afterDueY, 82, 6, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(159, 18, 57); // rose-900
    doc.text('PAYABLE AFTER DUE DATE:', colX + 5, afterDueY + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(190, 18, 60); // rose-700
    doc.text(formatCurrency(payableAfterDueDate), colX + colWidth - 5, afterDueY + 4.2, { align: 'right' });

    // Bank Details Box (with Left-to-Right English & Right-to-Left Urdu Instructions)
    const bankY = afterDueY + 7.8;
    const ltrInst = activeBank ? (activeBank.instructionsLtr || activeBank.instructionsLine1 || '').trim() : '';
    const rtlInst = activeBank ? (activeBank.instructionsRtl || activeBank.instructionsLine2 || '').trim() : '';

    // Calculate wrapped English lines (prevent clipping)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    const ltrLines: string[] = ltrInst ? doc.splitTextToSize(ltrInst, 78) : [];
    const ltrHeightMm = ltrLines.length * 3.2;

    // Render Urdu (RTL) via high-DPI canvas to properly connect Arabic/Urdu ligatures and avoid corrupted glyphs
    const renderedUrdu = rtlInst
      ? renderRtlTextToImage(rtlInst, 78, { fontSizePt: 6.8, textColor: '#334155' })
      : null;
    const rtlHeightMm = renderedUrdu ? renderedUrdu.heightMm : 0;

    // Dynamic bank card box height
    let boxHeight = 11.5;
    const hasInstructions = ltrLines.length > 0 || renderedUrdu !== null;
    if (hasInstructions) {
      boxHeight += 1.5; // space for divider line
      if (ltrLines.length > 0) {
        boxHeight += ltrHeightMm + 1.0;
      }
      if (renderedUrdu) {
        boxHeight += rtlHeightMm + 1.2;
      }
    }

    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240);
    doc.rect(colX + 3, bankY, 82, boxHeight, 'FD');

    if (activeBank) {
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(activeBank.bankName, colX + 5, bankY + 4.5);

      doc.setFont('courier', 'bold');
      doc.setFontSize(7);
      doc.text(`A/C: ${activeBank.accountNumber}`, colX + colWidth - 5, bankY + 4.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      const titleStr = activeBank.title.length > 38 ? activeBank.title.substring(0, 36) + '...' : activeBank.title;
      doc.text(`Title: ${titleStr}`, colX + 5, bankY + 8.8);

      if (activeBank.branchCode) {
        doc.text(`Branch: ${activeBank.branchCode}`, colX + colWidth - 5, bankY + 8.8, { align: 'right' });
      }

      if (hasInstructions) {
        // Divider inside box
        doc.setDrawColor(226, 232, 240);
        doc.line(colX + 5, bankY + 10.5, colX + colWidth - 5, bankY + 10.5);

        let currentInstY = bankY + 13.8;

        // 1. Left-to-Right Instructions (English) - Full wrap without any clipping
        if (ltrLines.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.8);
          doc.setTextColor(71, 85, 105); // slate-600
          ltrLines.forEach((line: string, idx: number) => {
            doc.text(line, colX + 5, currentInstY + idx * 3.2);
          });
          currentInstY += ltrHeightMm + 1.2;
        }

        // 2. Right-to-Left Instructions (Urdu) - High DPI Canvas Rasterization with authentic Nastaliq shaping
        if (renderedUrdu) {
          doc.addImage(
            renderedUrdu.dataUrl,
            'PNG',
            colX + 5,
            currentInstY - 1.2,
            78,
            renderedUrdu.heightMm
          );
        }
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Payment can be made at the institute accounts office', colX + colWidth / 2, bankY + 7.5, {
        align: 'center',
      });
    }

    // Signatures
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.setDrawColor(203, 213, 225);

    doc.line(colX + 5, topY + 186, colX + 32, topY + 186);
    doc.text('Bank Stamp', colX + 18, topY + 189.5, { align: 'center' });

    doc.line(colX + 53, topY + 186, colX + 80, topY + 186);
    doc.text('Accounts Office', colX + 66, topY + 189.5, { align: 'center' });
  });
}

/**
 * Generate a single jsPDF instance for a single voucher
 */
export function buildVoucherPdf(voucher: FeeVoucher, context: PdfExportContext): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  renderVoucherToPdfPage(doc, voucher, context);
  return doc;
}

/**
 * Export a single fee voucher as a PDF file
 */
export async function exportSingleFeeVoucherPdf(
  voucher: FeeVoucher,
  context: PdfExportContext,
  filename?: string
) {
  if (context.institute.logoUrl && !context.institute.logoUrl.startsWith('data:image/')) {
    const loadedLogo = await preloadImageForPdf(context.institute.logoUrl);
    if (loadedLogo) {
      context = { ...context, institute: { ...context.institute, logoUrl: loadedLogo } };
    }
  }

  const doc = buildVoucherPdf(voucher, context);
  const student = context.students.find((s) => s.id === voucher.studentId);
  const studentNameClean = (student?.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanVoucherNo = voucher.voucherNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalFilename = filename || `Fee_Voucher_${cleanVoucherNo}_${studentNameClean}.pdf`;
  doc.save(finalFilename);
}

/**
 * Print a single fee voucher directly via clean PDF stream (matching the Print Ledger implementation)
 */
export async function printFeeVoucherPdf(
  voucher: FeeVoucher,
  context: PdfExportContext
) {
  if (context.institute.logoUrl && !context.institute.logoUrl.startsWith('data:image/')) {
    const loadedLogo = await preloadImageForPdf(context.institute.logoUrl);
    if (loadedLogo) {
      context = { ...context, institute: { ...context.institute, logoUrl: loadedLogo } };
    }
  }

  const doc = buildVoucherPdf(voucher, context);
  doc.autoPrint();
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  // Hidden print iframe
  const iframe = document.createElement('iframe');
  iframe.id = `pdf-voucher-print-iframe-${Date.now()}`;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe printing was blocked, opening PDF in new window:', e);
      window.open(blobUrl, '_blank');
    }
  };

  // Revoke object URL after delay
  setTimeout(() => {
    try {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 120000);
}

/**
 * Export selected vouchers as a single combined multi-page PDF document
 */
export async function exportSingleCombinedPdf(
  vouchers: FeeVoucher[],
  context: PdfExportContext,
  filename = 'Fee_Vouchers.pdf'
) {
  if (vouchers.length === 0) return;

  if (context.institute.logoUrl && !context.institute.logoUrl.startsWith('data:image/')) {
    const loadedLogo = await preloadImageForPdf(context.institute.logoUrl);
    if (loadedLogo) {
      context = { ...context, institute: { ...context.institute, logoUrl: loadedLogo } };
    }
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  vouchers.forEach((v, index) => {
    if (index > 0) {
      doc.addPage('a4', 'landscape');
    }
    renderVoucherToPdfPage(doc, v, context);
  });

  doc.save(filename);
}

/**
 * Export selected vouchers as individual PDFs inside a ZIP archive
 */
export async function exportZipIndividualPdfs(
  vouchers: FeeVoucher[],
  context: PdfExportContext,
  zipFilename = 'Fee_Vouchers_Archive.zip'
) {
  if (vouchers.length === 0) return;

  if (context.institute.logoUrl && !context.institute.logoUrl.startsWith('data:image/')) {
    const loadedLogo = await preloadImageForPdf(context.institute.logoUrl);
    if (loadedLogo) {
      context = { ...context, institute: { ...context.institute, logoUrl: loadedLogo } };
    }
  }

  const zip = new JSZip();

  vouchers.forEach((v) => {
    const student = context.students.find((s) => s.id === v.studentId);
    const studentNameClean = (student?.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfDoc = buildVoucherPdf(v, context);

    const pdfArrayBuffer = pdfDoc.output('arraybuffer');
    const singlePdfName = `Voucher_${v.voucherNo}_${studentNameClean}.pdf`;
    zip.file(singlePdfName, pdfArrayBuffer);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // Trigger browser download
  const downloadUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

export interface StudentLedgerPdfEntry {
  serialNo: number;
  month: string;
  monthLabel: string;
  voucherNo: string;
  collectionDate: string;
  txnNo: string;
  paymentMode: string;
  total: number;
  deposit: number;
  balance: number;
  status: string;
}

/**
 * Build the jsPDF document instance for the Student Fee Collections & Billing Ledger
 */
export function generateStudentFeeLedgerDoc(
  student: Student,
  studentClass: SchoolClass | undefined,
  entries: StudentLedgerPdfEntry[],
  context: PdfExportContext
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // 1. Institute Header & Logo
  const logoUrl = context.institute.logoUrl;
  const hasLogo = Boolean(logoUrl && logoUrl.trim().length > 0);

  if (hasLogo) {
    try {
      const format = logoUrl.startsWith('data:image/jpeg') || logoUrl.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(logoUrl, format, margin, y, 14, 14);
    } catch (e) {
      console.warn('Could not render logo in Ledger PDF:', e);
    }
  }

  const textStartX = hasLogo ? margin + 18 : margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text((context.institute.name || 'INSTITUTE NAME').toUpperCase(), textStartX, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const subDetails = [
    context.institute.address,
    context.institute.phone ? `Phone: ${context.institute.phone}` : '',
    context.institute.email ? `Email: ${context.institute.email}` : '',
    context.institute.regNo ? `Reg #: ${context.institute.regNo}` : '',
  ]
    .filter(Boolean)
    .join('  •  ');
  doc.text(subDetails, textStartX, y + 9.5);
  y += 16;

  // 2. Document Title Banner
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.rect(margin, y, contentWidth, 8.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('STUDENT FEE COLLECTIONS & BILLING LEDGER STATEMENT', margin + 3, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const printedDateStr = `Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  doc.text(printedDateStr, pageWidth - margin - 3, y + 5.5, { align: 'right' });
  y += 12.5;

  // 3. Student Information Card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.rect(margin, y, contentWidth, 24, 'FD');

  // Row 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Student Name:', margin + 4, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(student.name, margin + 26, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Registration #:', margin + 95, y + 5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 118, 110);
  doc.text(student.regNo, margin + 117, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Class / Section:', margin + 145, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(studentClass?.name || 'N/A', margin + 167, y + 5);

  // Row 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Father Name:', margin + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.fatherName || 'N/A', margin + 26, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Contact Phone:', margin + 95, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.fatherPhone || 'N/A', margin + 117, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Status:', margin + 145, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(student.status === 'Active' ? 16 : 185, student.status === 'Active' ? 185 : 28, student.status === 'Active' ? 129 : 28);
  doc.text(student.status, margin + 167, y + 11);

  // Row 3
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Discount / Mo:', margin + 4, y + 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.monthlyDiscount > 0 ? formatCurrency(student.monthlyDiscount) : 'None', margin + 26, y + 17);

  y += 27;

  // 4. Financial Summary Cards
  const totalBilled = entries.reduce((sum, e) => sum + e.total, 0);
  const totalDeposited = entries.reduce((sum, e) => sum + e.deposit, 0);
  const totalBalance = entries.reduce((sum, e) => sum + e.balance, 0);
  const collectionPct = totalBilled > 0 ? Math.round((totalDeposited / totalBilled) * 100) : 0;
  const overdueMonthsCount = entries.filter((e) => e.balance > 0).length;

  const cardWidth = (contentWidth - 12) / 5;
  const cards = [
    { label: 'TOTAL BILLED', val: formatCurrency(totalBilled), sub: `${entries.length} Cycles`, color: [15, 23, 42] },
    { label: 'TOTAL DEPOSITED', val: formatCurrency(totalDeposited), sub: 'Collected Fee', color: [4, 120, 87] },
    { label: 'CURRENT BALANCE', val: formatCurrency(totalBalance), sub: totalBalance > 0 ? 'Outstanding' : 'Settled', color: totalBalance > 0 ? [225, 29, 72] : [4, 120, 87] },
    { label: 'RECOVERY RATE', val: `${collectionPct}%`, sub: 'Settlement Ratio', color: [15, 118, 110] },
    {
      label: 'UNPAID MONTHS',
      val: `${overdueMonthsCount} Month${overdueMonthsCount !== 1 ? 's' : ''}`,
      sub: overdueMonthsCount > 0 ? 'Non-Zero Due' : 'All Clear',
      color: overdueMonthsCount > 0 ? [225, 29, 72] : [4, 120, 87],
    },
  ];

  cards.forEach((c, idx) => {
    const cx = margin + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(cx, y, cardWidth, 15, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label, cx + 2.5, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    doc.text(c.val, cx + 2.5, y + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text(c.sub, cx + 2.5, y + 13);
  });

  y += 20;

  // 5. Table Header
  const colDefs = [
    { title: 'SR #', width: 12, align: 'center' },
    { title: 'FEE MONTH', width: 28, align: 'left' },
    { title: 'VOUCHER #', width: 26, align: 'left' },
    { title: 'DATE', width: 22, align: 'left' },
    { title: 'PAYMENT MODE', width: 28, align: 'left' },
    { title: 'TOTAL (RS)', width: 23, align: 'right' },
    { title: 'DEPOSIT (RS)', width: 23, align: 'right' },
    { title: 'BALANCE (RS)', width: 24, align: 'right' },
  ];

  const drawTableHeader = (curY: number) => {
    doc.setFillColor(71, 85, 105); // slate-600 (lighter header)
    doc.rect(margin, curY, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    let curX = margin;
    colDefs.forEach((col) => {
      if (col.align === 'right') {
        doc.text(col.title, curX + col.width - 2, curY + 4.5, { align: 'right' });
      } else if (col.align === 'center') {
        doc.text(col.title, curX + col.width / 2, curY + 4.5, { align: 'center' });
      } else {
        doc.text(col.title, curX + 2, curY + 4.5);
      }
      curX += col.width;
    });
  };

  drawTableHeader(y);
  y += 7;

  // 6. Table Rows
  entries.forEach((e, idx) => {
    if (y > pageHeight - 35) {
      doc.addPage('a4', 'portrait');
      y = margin;
      drawTableHeader(y);
      y += 7;
    }

    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 6.5, 'F');

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 6.5, margin + contentWidth, y + 6.5);

    let curX = margin;

    // Col 1: Serial #
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(e.serialNo), curX + colDefs[0].width / 2, y + 4.5, { align: 'center' });
    curX += colDefs[0].width;

    // Col 2: Fee Month
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(e.monthLabel, curX + 2, y + 4.5);
    curX += colDefs[1].width;

    // Col 3: Voucher #
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110);
    doc.text(e.voucherNo, curX + 2, y + 4.5);
    curX += colDefs[2].width;

    // Col 4: Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(e.collectionDate, curX + 2, y + 4.5);
    curX += colDefs[3].width;

    // Col 5: Payment Mode
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const modeStr = e.deposit > 0 ? (e.paymentMode || 'Paid') : 'Pending';
    doc.text(modeStr, curX + 2, y + 4.5);
    curX += colDefs[4].width;

    // Col 6: Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(e.total), curX + colDefs[5].width - 2, y + 4.5, { align: 'right' });
    curX += colDefs[5].width;

    // Col 7: Deposit
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(4, 120, 87);
    doc.text(e.deposit > 0 ? formatCurrency(e.deposit) : '—', curX + colDefs[6].width - 2, y + 4.5, { align: 'right' });
    curX += colDefs[6].width;

    // Col 8: Balance
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(e.balance > 0 ? 225 : 4, e.balance > 0 ? 29 : 120, e.balance > 0 ? 72 : 87);
    doc.text(formatCurrency(e.balance), curX + colDefs[7].width - 2, y + 4.5, { align: 'right' });

    y += 6.5;
  });

  // Table Totals Footer
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, margin + contentWidth, y);
  doc.line(margin, y + 7, margin + contentWidth, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL STATEMENT BALANCE:', margin + 4, y + 4.5);

  const totalColX = margin + colDefs[0].width + colDefs[1].width + colDefs[2].width + colDefs[3].width + colDefs[4].width;
  doc.text(formatCurrency(totalBilled), totalColX + colDefs[5].width - 2, y + 4.5, { align: 'right' });

  doc.setTextColor(4, 120, 87);
  doc.text(formatCurrency(totalDeposited), totalColX + colDefs[5].width + colDefs[6].width - 2, y + 4.5, { align: 'right' });

  doc.setTextColor(totalBalance > 0 ? 225 : 4, totalBalance > 0 ? 29 : 120, totalBalance > 0 ? 72 : 87);
  doc.text(formatCurrency(totalBalance), margin + contentWidth - 2, y + 4.5, { align: 'right' });

  y += 18;

  // 7. Signature & Verification Stamps
  if (y > pageHeight - 30) {
    doc.addPage('a4', 'portrait');
    y = margin + 15;
  }

  const sigWidth = 50;
  // Left: Prepared By
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(margin + 10, y + 8, margin + 10 + sigWidth, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Prepared / Verified By', margin + 10 + sigWidth / 2, y + 12, { align: 'center' });

  // Right: Accounts Officer
  const rightSigX = pageWidth - margin - sigWidth - 10;
  doc.line(rightSigX, y + 8, rightSigX + sigWidth, y + 8);
  doc.text('Authorized Signatory / Stamp', rightSigX + sigWidth / 2, y + 12, { align: 'center' });

  // Bottom Notice
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'This is a system-generated official fee collections and billing ledger statement. Any discrepancies should be reported to the accounts department.',
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );

  return doc;
}

/**
 * Generate and download an official Student Fee Collections & Billing Ledger PDF Statement
 */
export async function exportStudentFeeLedgerPdf(
  student: Student,
  studentClass: SchoolClass | undefined,
  entries: StudentLedgerPdfEntry[],
  context: PdfExportContext,
  filename?: string
) {
  if (context.institute.logoUrl && !context.institute.logoUrl.startsWith('data:image/')) {
    const loadedLogo = await preloadImageForPdf(context.institute.logoUrl);
    if (loadedLogo) {
      context = { ...context, institute: { ...context.institute, logoUrl: loadedLogo } };
    }
  }

  const doc = generateStudentFeeLedgerDoc(student, studentClass, entries, context);
  const cleanRegNo = student.regNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalFilename = filename || `Fee_Collections_${cleanRegNo}.pdf`;
  doc.save(finalFilename);
}

/**
 * Print the official Student Fee Collections & Billing Ledger PDF Statement
 */
export async function printStudentFeeLedgerPdf(
  student: Student,
  studentClass: SchoolClass | undefined,
  entries: StudentLedgerPdfEntry[],
  context: PdfExportContext
) {
  if (context.institute.logoUrl && !context.institute.logoUrl.startsWith('data:image/')) {
    const loadedLogo = await preloadImageForPdf(context.institute.logoUrl);
    if (loadedLogo) {
      context = { ...context, institute: { ...context.institute, logoUrl: loadedLogo } };
    }
  }

  const doc = generateStudentFeeLedgerDoc(student, studentClass, entries, context);
  doc.autoPrint();
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  // Hidden print iframe
  const iframe = document.createElement('iframe');
  iframe.id = `pdf-print-iframe-${Date.now()}`;
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe printing was blocked, opening PDF in new window:', e);
      window.open(blobUrl, '_blank');
    }
  };

  // Revoke object URL after delay
  setTimeout(() => {
    try {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 120000);
}

