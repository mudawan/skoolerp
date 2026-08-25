import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatMonthName, formatStudentAge, calculateAge } from '../utils/feeMath';
import { StudentAvatar } from './StudentAvatar';
import { StudentFeeLedger } from './StudentFeeLedger';
import { BarChart3, BookOpen, Building2, Download, FileSpreadsheet, History, Printer, Users } from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { activeMonth, classes, vouchers, students, institute } = useApp();

  const [reportType, setReportType] = useState<'classSummary' | 'outstanding' | 'studentLedger'>('classSummary');
  const [selectedStudentForLedger, setSelectedStudentForLedger] = useState<string | undefined>(undefined);

  const monthVouchers = vouchers.filter((v) => v.month === activeMonth && v.status !== 'Reversed');

  // Per-Class Monthly Summary Data
  const classSummaryRows = classes.map((cls) => {
    const clsVouchers = monthVouchers.filter((v) => v.classId === cls.id);
    const issued = clsVouchers.reduce((sum, v) => sum + v.netDue, 0);
    const collected = clsVouchers.reduce((sum, v) => sum + v.amountPaid, 0);
    const outstanding = issued - collected;
    const pct = issued > 0 ? Math.round((collected / issued) * 100) : 0;

    return {
      classId: cls.id,
      className: cls.name,
      voucherCount: clsVouchers.length,
      issued,
      collected,
      outstanding,
      pct,
    };
  });

  // Student Outstanding Balances Data
  const studentOutstandingRows = students
    .map((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      
      // All non-reversed vouchers for this student sorted chronologically
      const allStudentVouchers = vouchers
        .filter((v) => v.studentId === s.id && v.status !== 'Reversed')
        .sort((a, b) => a.month.localeCompare(b.month));

      // Overdue vouchers: any voucher where netDue > amountPaid (including Carried, Issued, Partial)
      const overdueVouchers = allStudentVouchers.filter(
        (v) => Math.max(0, v.netDue - v.amountPaid) > 0
      );

      // Active uncarried vouchers for current outstanding cumulative balance
      const uncarriedUnpaidVouchers = allStudentVouchers.filter(
        (v) => v.status !== 'Carried' && v.amountPaid < v.netDue
      );

      const totalOutstanding =
        uncarriedUnpaidVouchers.length > 0
          ? uncarriedUnpaidVouchers.reduce((sum, v) => sum + (v.netDue - v.amountPaid), 0)
          : overdueVouchers.length > 0
          ? Math.max(0, overdueVouchers.slice(-1)[0].netDue - overdueVouchers.slice(-1)[0].amountPaid)
          : 0;

      const unpaidMonths = overdueVouchers.map((v) => v.month);
      const unpaidMonthsCount = unpaidMonths.length;
      const oldestUnpaidMonth = unpaidMonths[0] || '';
      const formattedMonthsList = overdueVouchers.map((v) => formatMonthName(v.month)).join(', ');

      return {
        studentId: s.id,
        studentNo: s.studentNo,
        regNo: s.regNo,
        name: s.name,
        photoUrl: s.photoUrl,
        dob: s.dob,
        ageStr: formatStudentAge(s.dob),
        className: cls?.name || 'Class',
        fatherName: s.fatherName,
        fatherPhone: s.fatherPhone,
        unpaidVoucherCount: overdueVouchers.length,
        unpaidMonthsCount,
        oldestUnpaidMonth,
        formattedMonthsList,
        totalOutstanding,
      };
    })
    .filter((row) => row.totalOutstanding > 0);

  // CSV Export for Reports
  const handleExportReportCsv = () => {
    if (reportType === 'classSummary') {
      const headers = ['Class Name', 'Vouchers Issued', 'Gross Issued (Rs)', 'Collected (Rs)', 'Outstanding (Rs)', 'Collection %'];
      const rows = classSummaryRows.map((r) => [
        `"${r.className}"`,
        r.voucherCount,
        r.issued,
        r.collected,
        r.outstanding,
        `${r.pct}%`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', `Class_Fee_Summary_${activeMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (reportType === 'outstanding') {
      const headers = [
        'Registration No.',
        'Student Name',
        'Date of Birth',
        'Calculated Age',
        'Class',
        'Father Name',
        'Father Phone',
        'Unpaid Vouchers',
        'Overdue Months Count',
        'Overdue Months List',
        'Outstanding Amount (Rs)',
      ];
      const rows = studentOutstandingRows.map((r) => [
        r.regNo,
        `"${r.name}"`,
        `"${r.dob || ''}"`,
        `"${r.ageStr}"`,
        `"${r.className}"`,
        `"${r.fatherName}"`,
        r.fatherPhone,
        r.unpaidVoucherCount,
        r.unpaidMonthsCount,
        `"${r.formattedMonthsList}"`,
        r.totalOutstanding,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', `Student_Outstanding_Balances_${activeMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6">
      {/* Printable Institutional Header (Visible only when printing) */}
      <div className="hidden print:block mb-4 border-b border-slate-300 pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {institute.logoUrl ? (
              <img
                src={institute.logoUrl}
                alt={institute.name}
                className="w-12 h-12 object-contain rounded-lg border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 font-bold text-base shrink-0">
                {institute.name ? institute.name.charAt(0) : 'S'}
              </div>
            )}
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                {institute.name || 'INSTITUTE NAME'}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {institute.address || 'School Campus'} {institute.phone && `• Ph: ${institute.phone}`} {institute.regNo && `• Reg #: ${institute.regNo}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Billing Month
            </span>
            <span className="text-sm font-bold text-slate-900">
              {formatMonthName(activeMonth)}
            </span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div className="flex items-center gap-3.5">
          {institute.logoUrl ? (
            <img
              src={institute.logoUrl}
              alt={institute.name}
              className="w-12 h-12 object-contain rounded-xl border border-slate-200/80 p-1 bg-white shrink-0 shadow-2xs"
            />
          ) : (
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 shrink-0">
              <BarChart3 className="w-6 h-6 text-teal-600" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Financial & Fee Audit Reports
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {institute.name} &bull; Monthly collection summaries, student fee ledgers, and outstanding arrears audit reports.
            </p>
          </div>
        </div>

        {reportType !== 'studentLedger' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs shadow-2xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              Print Report
            </button>
            <button
              onClick={handleExportReportCsv}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export Report CSV
            </button>
          </div>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto print:hidden">
        <button
          onClick={() => setReportType('classSummary')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            reportType === 'classSummary'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Per-Class Monthly Collection Summary
        </button>
        <button
          onClick={() => setReportType('studentLedger')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            reportType === 'studentLedger'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          Student Fee Collections Ledger
        </button>
        <button
          onClick={() => setReportType('outstanding')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            reportType === 'outstanding'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          Student Outstanding Balances Arrears ({studentOutstandingRows.length})
        </button>
      </div>

      {/* Report 3: Student Fee Collections Ledger */}
      {reportType === 'studentLedger' && (
        <StudentFeeLedger initialStudentId={selectedStudentForLedger} />
      )}

      {/* Report 1: Class Summary */}
      {reportType === 'classSummary' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Class Fee Collection Summary &bull; {formatMonthName(activeMonth)}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Class Name</th>
                  <th className="p-3 text-center">Vouchers Issued</th>
                  <th className="p-3 text-right">Gross Issued</th>
                  <th className="p-3 text-right">Collected</th>
                  <th className="p-3 text-right">Outstanding</th>
                  <th className="p-3 text-center">Collection %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classSummaryRows.map((r) => (
                  <tr key={r.classId} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{r.className}</td>
                    <td className="p-3 text-center font-semibold">{r.voucherCount}</td>
                    <td className="p-3 text-right font-bold text-slate-900">
                      {formatCurrency(r.issued)}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-700">
                      {formatCurrency(r.collected)}
                    </td>
                    <td className="p-3 text-right font-bold text-rose-600">
                      {formatCurrency(r.outstanding)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          r.pct >= 80
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.pct >= 40
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t border-slate-800">
                <tr>
                  <td className="p-3">TOTAL INSTITUTE SUMMARY:</td>
                  <td className="p-3 text-center">
                    {classSummaryRows.reduce((s, r) => s + r.voucherCount, 0)}
                  </td>
                  <td className="p-3 text-right text-teal-300">
                    {formatCurrency(classSummaryRows.reduce((s, r) => s + r.issued, 0))}
                  </td>
                  <td className="p-3 text-right text-emerald-400">
                    {formatCurrency(classSummaryRows.reduce((s, r) => s + r.collected, 0))}
                  </td>
                  <td className="p-3 text-right text-rose-300">
                    {formatCurrency(classSummaryRows.reduce((s, r) => s + r.outstanding, 0))}
                  </td>
                  <td className="p-3 text-center text-amber-300">
                    {classSummaryRows.reduce((s, r) => s + r.issued, 0) > 0
                      ? Math.round(
                          (classSummaryRows.reduce((s, r) => s + r.collected, 0) /
                            classSummaryRows.reduce((s, r) => s + r.issued, 0)) *
                            100
                        )
                      : 0}
                    %
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Student Outstanding */}
      {reportType === 'outstanding' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Student Unpaid Fee Arrears Audit ({studentOutstandingRows.length} Defaulters)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">Student Info</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Father Name & Contact</th>
                  <th className="p-3 text-center">Unpaid Vouchers</th>
                  <th className="p-3">Unpaid Due Months (Streak)</th>
                  <th className="p-3 text-right">Outstanding Arrears</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentOutstandingRows.length > 0 ? (
                  studentOutstandingRows.map((r) => (
                    <tr key={r.studentId} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar photoUrl={r.photoUrl} name={r.name} size="xs" />
                          <div>
                            <span className="font-bold text-slate-900 block">{r.name}</span>
                            <span className="text-[11px] text-slate-500 font-mono font-semibold block">
                              Reg #: {r.regNo}
                            </span>
                            {r.dob && (
                              <span className="text-[10px] text-slate-400 font-medium block">
                                DOB: {r.dob} ({r.ageStr})
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{r.className}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-900 block">{r.fatherName}</span>
                        <span className="text-[11px] text-slate-500">{r.fatherPhone}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[11px]">
                          {r.unpaidVoucherCount} Voucher(s)
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                r.unpaidMonthsCount >= 3
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-amber-100 text-amber-900 border border-amber-200'
                              }`}
                            >
                              {r.unpaidMonthsCount} {r.unpaidMonthsCount === 1 ? 'Month' : 'Months'} Due
                            </span>
                            {r.unpaidMonthsCount >= 3 && (
                              <span className="text-[10px] font-bold bg-rose-600 text-white px-1.5 py-0.2 rounded">
                                Streak
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Due since {formatMonthName(r.oldestUnpaidMonth)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-bold text-rose-600">
                        {formatCurrency(r.totalOutstanding)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedStudentForLedger(r.studentId);
                            setReportType('studentLedger');
                          }}
                          className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-lg transition text-[11px] cursor-pointer"
                        >
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                      Zero outstanding defaulter arrears found!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
