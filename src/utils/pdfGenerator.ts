import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { FeeVoucher, InstituteProfile, Student, Class, BankAccount, PaymentTransaction } from '../types';
import { formatCurrency } from './feeMath';

export interface OutstandingArrearsPdfRow {
  regNo: string;
  studentName: string;
  fatherName: string;
  className: string;
  contactPhone: string;
  arrearsAmount: number;
  lastPaymentDate?: string;
  unpaidMonthsCount: number;
}

export interface FeeCollectionReportPdfRow {
  date: string;
  voucherNo: string;
  regNo: string;
  studentName: string;
  className: string;
  amount: number;
  paymentMode: string;
  receivedBy: string;
}

export async function exportPaymentReceiptPdf(
  receipt: any,
  institute: InstituteProfile
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(institute?.name || 'School Fee Receipt', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Payment Receipt', 105, 25, { align: 'center' });
  doc.line(15, 28, 135, 28);

  doc.setFontSize(9);
  doc.text(`Receipt #: ${receipt?.receiptNo || receipt?.txnNo || 'N/A'}`, 15, 36);
  doc.text(`Date: ${receipt?.date || new Date().toISOString().split('T')[0]}`, 135, 36, { align: 'right' });
  doc.text(`Student: ${receipt?.studentName || 'Student'} (${receipt?.regNo || ''})`, 15, 43);
  doc.text(`Class: ${receipt?.className || 'N/A'}`, 135, 43, { align: 'right' });
  doc.text(`Voucher #: ${receipt?.voucherNo || 'N/A'}`, 15, 50);
  doc.text(`Mode: ${receipt?.paymentMode || 'Cash'}`, 135, 50, { align: 'right' });

  doc.line(15, 54, 135, 54);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount Paid:', 15, 63);
  doc.text(formatCurrency(receipt?.amount || 0), 135, 63, { align: 'right' });
  doc.line(15, 68, 135, 68);

  doc.save(`Receipt-${receipt?.receiptNo || 'Fee'}.pdf`);
}

export async function printPaymentReceiptPdf(receipt: any, institute: InstituteProfile): Promise<void> {
  await exportPaymentReceiptPdf(receipt, institute);
}

export async function exportStudentFeeLedgerPdf(
  student: Student,
  classObj: Class | undefined,
  institute: InstituteProfile,
  entries: any[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(institute?.name || 'School Fee Ledger', 105, 18, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`Student Fee Ledger: ${student?.name} (Reg #: ${student?.regNo})`, 105, 26, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Class: ${classObj?.name || 'N/A'} | Date: ${new Date().toISOString().split('T')[0]}`, 105, 32, { align: 'center' });
  doc.line(15, 35, 195, 35);

  let y = 42;
  doc.setFont('helvetica', 'bold');
  doc.text('Date / Month', 15, y);
  doc.text('Description', 50, y);
  doc.text('Billed', 125, y, { align: 'right' });
  doc.text('Paid', 160, y, { align: 'right' });
  doc.text('Balance', 195, y, { align: 'right' });
  doc.line(15, y + 2, 195, y + 2);
  y += 7;

  doc.setFont('helvetica', 'normal');
  entries.forEach((e) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(e.date || e.month || ''), 15, y);
    doc.text(String(e.description || '').substring(0, 35), 50, y);
    doc.text(formatCurrency(e.billed || 0), 125, y, { align: 'right' });
    doc.text(formatCurrency(e.paid || 0), 160, y, { align: 'right' });
    doc.text(formatCurrency(e.balance || 0), 195, y, { align: 'right' });
    y += 6;
  });

  doc.save(`Ledger-${student?.regNo || 'Student'}.pdf`);
}

export async function printStudentFeeLedgerPdf(
  student: Student,
  classObj: Class | undefined,
  institute: InstituteProfile,
  entries: any[]
): Promise<void> {
  await exportStudentFeeLedgerPdf(student, classObj, institute, entries);
}

export async function exportSingleFeeVoucherPdf(
  voucher: FeeVoucher,
  student: Student | undefined,
  classObj: Class | undefined,
  institute: InstituteProfile,
  bankAccounts: BankAccount[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const copies = ['Bank Copy', 'School Copy', 'Student Copy'];
  const colWidth = 85;

  copies.forEach((copyName, idx) => {
    const x = 12 + idx * (colWidth + 7);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(institute?.name || 'School Voucher', x + colWidth / 2, 15, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${copyName} - ${voucher.month}`, x + colWidth / 2, 20, { align: 'center' });
    doc.line(x, 22, x + colWidth, 22);

    doc.text(`Voucher #: ${voucher.voucherNo}`, x, 27);
    doc.text(`Due: ${voucher.dueDate || 'N/A'}`, x + colWidth, 27, { align: 'right' });
    doc.text(`Student: ${student?.name || 'Student'} (${student?.regNo || ''})`, x, 32);
    doc.text(`Class: ${classObj?.name || 'N/A'}`, x + colWidth, 32, { align: 'right' });

    doc.line(x, 35, x + colWidth, 35);
    let itemY = 40;
    voucher.particulars.forEach((p) => {
      doc.text(p.label, x, itemY);
      doc.text(formatCurrency(p.amount), x + colWidth, itemY, { align: 'right' });
      itemY += 5;
    });

    doc.line(x, itemY + 2, x + colWidth, itemY + 2);
    doc.setFont('helvetica', 'bold');
    doc.text('Net Due:', x, itemY + 7);
    doc.text(formatCurrency(voucher.netDue), x + colWidth, itemY + 7, { align: 'right' });
  });

  doc.save(`Voucher-${voucher.voucherNo}.pdf`);
}

export async function printFeeVoucherPdf(
  voucher: FeeVoucher,
  student: Student | undefined,
  classObj: Class | undefined,
  institute: InstituteProfile,
  bankAccounts: BankAccount[]
): Promise<void> {
  await exportSingleFeeVoucherPdf(voucher, student, classObj, institute, bankAccounts);
}

export async function exportSingleCombinedPdf(
  vouchers: FeeVoucher[],
  students: Student[],
  classes: Class[],
  institute: InstituteProfile,
  bankAccounts: BankAccount[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  vouchers.forEach((v, vIdx) => {
    if (vIdx > 0) doc.addPage();
    const student = studentMap.get(v.studentId);
    const classObj = classMap.get(v.classId);
    const copies = ['Bank Copy', 'School Copy', 'Student Copy'];
    const colWidth = 85;

    copies.forEach((copyName, idx) => {
      const x = 12 + idx * (colWidth + 7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(institute?.name || 'School Voucher', x + colWidth / 2, 15, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${copyName} - ${v.month}`, x + colWidth / 2, 20, { align: 'center' });
      doc.line(x, 22, x + colWidth, 22);

      doc.text(`Voucher #: ${v.voucherNo}`, x, 27);
      doc.text(`Due: ${v.dueDate || 'N/A'}`, x + colWidth, 27, { align: 'right' });
      doc.text(`Student: ${student?.name || 'Student'} (${student?.regNo || ''})`, x, 32);
      doc.text(`Class: ${classObj?.name || 'N/A'}`, x + colWidth, 32, { align: 'right' });

      doc.line(x, 35, x + colWidth, 35);
      let itemY = 40;
      v.particulars.forEach((p) => {
        doc.text(p.label, x, itemY);
        doc.text(formatCurrency(p.amount), x + colWidth, itemY, { align: 'right' });
        itemY += 5;
      });

      doc.line(x, itemY + 2, x + colWidth, itemY + 2);
      doc.setFont('helvetica', 'bold');
      doc.text('Net Due:', x, itemY + 7);
      doc.text(formatCurrency(v.netDue), x + colWidth, itemY + 7, { align: 'right' });
    });
  });

  doc.save(`Combined-Vouchers-${vouchers[0]?.month || 'batch'}.pdf`);
}

export async function exportZipIndividualPdfs(
  vouchers: FeeVoucher[],
  students: Student[],
  classes: Class[],
  institute: InstituteProfile,
  bankAccounts: BankAccount[]
): Promise<void> {
  const zip = new JSZip();
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  for (const v of vouchers) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const student = studentMap.get(v.studentId);
    const classObj = classMap.get(v.classId);
    const copies = ['Bank Copy', 'School Copy', 'Student Copy'];
    const colWidth = 85;

    copies.forEach((copyName, idx) => {
      const x = 12 + idx * (colWidth + 7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(institute?.name || 'School Voucher', x + colWidth / 2, 15, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${copyName} - ${v.month}`, x + colWidth / 2, 20, { align: 'center' });
      doc.line(x, 22, x + colWidth, 22);

      doc.text(`Voucher #: ${v.voucherNo}`, x, 27);
      doc.text(`Due: ${v.dueDate || 'N/A'}`, x + colWidth, 27, { align: 'right' });
      doc.text(`Student: ${student?.name || 'Student'} (${student?.regNo || ''})`, x, 32);
      doc.text(`Class: ${classObj?.name || 'N/A'}`, x + colWidth, 32, { align: 'right' });

      doc.line(x, 35, x + colWidth, 35);
      let itemY = 40;
      v.particulars.forEach((p) => {
        doc.text(p.label, x, itemY);
        doc.text(formatCurrency(p.amount), x + colWidth, itemY, { align: 'right' });
        itemY += 5;
      });

      doc.line(x, itemY + 2, x + colWidth, itemY + 2);
      doc.setFont('helvetica', 'bold');
      doc.text('Net Due:', x, itemY + 7);
      doc.text(formatCurrency(v.netDue), x + colWidth, itemY + 7, { align: 'right' });
    });

    zip.file(`Voucher-${v.voucherNo}.pdf`, doc.output('blob'));
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Vouchers-Batch-${vouchers[0]?.month || 'batch'}.zip`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function printOutstandingArrearsPdf(
  rows: OutstandingArrearsPdfRow[],
  institute: InstituteProfile,
  month: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(institute?.name || 'School Defaulters Report', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Outstanding Arrears Report - ${month}`, 105, 25, { align: 'center' });
  doc.line(15, 28, 195, 28);

  let y = 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Reg #', 15, y);
  doc.text('Student Name', 35, y);
  doc.text('Class', 85, y);
  doc.text('Contact', 115, y);
  doc.text('Unpaid Months', 155, y);
  doc.text('Arrears', 195, y, { align: 'right' });
  doc.line(15, y + 2, 195, y + 2);
  y += 6;

  doc.setFont('helvetica', 'normal');
  rows.forEach((r) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(r.regNo, 15, y);
    doc.text(r.studentName.substring(0, 25), 35, y);
    doc.text(r.className, 85, y);
    doc.text(r.contactPhone || 'N/A', 115, y);
    doc.text(String(r.unpaidMonthsCount), 155, y);
    doc.text(formatCurrency(r.arrearsAmount), 195, y, { align: 'right' });
    y += 5;
  });

  doc.save(`Defaulters-${month}.pdf`);
}

export async function exportOutstandingArrearsPdf(
  rows: OutstandingArrearsPdfRow[],
  institute: InstituteProfile,
  month: string
): Promise<void> {
  await printOutstandingArrearsPdf(rows, institute, month);
}

export async function printFeeCollectionReportPdf(
  rows: FeeCollectionReportPdfRow[],
  institute: InstituteProfile,
  dateRange: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(institute?.name || 'Fee Collection Report', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Collections - ${dateRange}`, 105, 25, { align: 'center' });
  doc.line(15, 28, 195, 28);

  let y = 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Date', 15, y);
  doc.text('Voucher #', 40, y);
  doc.text('Student', 75, y);
  doc.text('Class', 125, y);
  doc.text('Mode', 155, y);
  doc.text('Amount', 195, y, { align: 'right' });
  doc.line(15, y + 2, 195, y + 2);
  y += 6;

  doc.setFont('helvetica', 'normal');
  rows.forEach((r) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(r.date, 15, y);
    doc.text(r.voucherNo, 40, y);
    doc.text(r.studentName.substring(0, 25), 75, y);
    doc.text(r.className, 125, y);
    doc.text(r.paymentMode, 155, y);
    doc.text(formatCurrency(r.amount), 195, y, { align: 'right' });
    y += 5;
  });

  doc.save(`Collections-${dateRange}.pdf`);
}

export async function exportFeeCollectionReportPdf(
  rows: FeeCollectionReportPdfRow[],
  institute: InstituteProfile,
  dateRange: string
): Promise<void> {
  await printFeeCollectionReportPdf(rows, institute, dateRange);
}
