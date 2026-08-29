import React, { useMemo } from 'react';
import { VoucherItem, ParticularKind } from '../types';
import { RotateCcw, Tag, Save } from 'lucide-react';
import { formatCurrency, getEffectiveMultiple, roundUpToMultiple } from '../utils/feeMath';
import { useApp } from '../context/AppContext';

interface VoucherParticularsEditorProps {
  items: VoucherItem[];
  onChange: (updatedItems: VoucherItem[]) => void;
  onResetToOriginal?: () => void;
  onSaveLineItems?: () => void;
  originalItems?: VoucherItem[];
  amountPaid?: number;
  compact?: boolean;
  readOnly?: boolean;
  studentId?: string;
}

interface StandardHeadDef {
  kind: ParticularKind;
  defaultLabel: string;
  categoryTag: string;
  isFlex: boolean;
  isDiscount: boolean;
  isPreviousBalance: boolean;
  sortOrder: number;
}

const STANDARD_ROSTER_DEFS: StandardHeadDef[] = [
  {
    kind: 'Tuition',
    defaultLabel: 'Tuition Fee',
    categoryTag: 'Monthly Fee',
    isFlex: false,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 1,
  },
  {
    kind: 'Flex1',
    defaultLabel: 'Admission Fee',
    categoryTag: 'Flex 1',
    isFlex: true,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 2,
  },
  {
    kind: 'Flex2',
    defaultLabel: 'Registration Fee',
    categoryTag: 'Flex 2',
    isFlex: true,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 3,
  },
  {
    kind: 'Transport',
    defaultLabel: 'Transport Fee',
    categoryTag: 'Transport',
    isFlex: false,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 4,
  },
  {
    kind: 'Fine',
    defaultLabel: 'Fine',
    categoryTag: 'Penalty',
    isFlex: false,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 5,
  },
  {
    kind: 'Flex3',
    defaultLabel: 'Exam Fee',
    categoryTag: 'Flex 3',
    isFlex: true,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 6,
  },
  {
    kind: 'Flex4',
    defaultLabel: 'Other',
    categoryTag: 'Flex 4',
    isFlex: true,
    isDiscount: false,
    isPreviousBalance: false,
    sortOrder: 7,
  },
  {
    kind: 'PreviousBalance',
    defaultLabel: 'Previous Balance',
    categoryTag: 'Arrears',
    isFlex: false,
    isDiscount: false,
    isPreviousBalance: true,
    sortOrder: 8,
  },
  {
    kind: 'Discount',
    defaultLabel: 'Discount in Fee',
    categoryTag: 'Concession',
    isFlex: false,
    isDiscount: true,
    isPreviousBalance: false,
    sortOrder: 9,
  },
];

/**
 * Sanitizes any raw internal kind strings like "Flex1", "Flex2", "Tuition" from appearing in user-facing labels.
 */
function sanitizeLabel(rawLabel: string, fallbackLabel: string): string {
  if (!rawLabel || typeof rawLabel !== 'string') return fallbackLabel;
  const trimmed = rawLabel.trim();
  if (!trimmed || /^flex[1-4]$/i.test(trimmed) || /ffffff/i.test(trimmed)) {
    return fallbackLabel;
  }
  return trimmed;
}

export const VoucherParticularsEditor: React.FC<VoucherParticularsEditorProps> = ({
  items,
  onChange,
  onResetToOriginal,
  onSaveLineItems,
  originalItems,
  readOnly = false,
  studentId,
}) => {
  const { templates, students, hasPermission, activeMonth, roundingMultiple, roundingEnabled } = useApp();

  // Check if current user has permission to edit voucher amounts / particulars
  const canEdit =
    !readOnly &&
    (hasPermission('fees.collect') ||
      hasPermission('fees.manage') ||
      hasPermission('settings.manage') ||
      hasPermission('fees.generate'));

  // Get active templates (sorted) with 3-tier overrides (Student > Class > Global)
  const resolvedRoster = useMemo(() => {
    const student = studentId ? students.find((s) => s.id === studentId) : null;
    const globalTemplates = templates
      .filter((t) => !t.studentId && !t.classId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const classTemplates = student?.classId
      ? templates.filter(
          (t) => !t.studentId && t.classId === student.classId && (!t.month || t.month === activeMonth)
        )
      : [];

    const studentTemplates = studentId
      ? templates.filter((t) => t.studentId === studentId && (!t.month || t.month === activeMonth))
      : [];

    return STANDARD_ROSTER_DEFS.map((stdDef) => {
      const gTpl = globalTemplates.find((t) => t.kind === stdDef.kind);
      const cTpl = classTemplates.find((t) => t.kind === stdDef.kind);
      const sTpl = studentTemplates.find((t) => t.kind === stdDef.kind);

      const resolvedLabel = sanitizeLabel(
        sTpl?.label || cTpl?.label || gTpl?.label || stdDef.defaultLabel,
        stdDef.defaultLabel
      );

      const sortOrder = sTpl?.sortOrder ?? cTpl?.sortOrder ?? gTpl?.sortOrder ?? stdDef.sortOrder;

      return {
        ...stdDef,
        templateLabel: resolvedLabel,
        sortOrder,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [templates, students, studentId, activeMonth]);

  // Construct complete reconciled line items containing all standard heads
  const reconciledItems = useMemo(() => {
    const list: VoucherItem[] = [];

    // Map each standard head in order
    resolvedRoster.forEach((rDef) => {
      const matched = items.find((it) => it.kind === rDef.kind);
      let amount = 0;
      let label = rDef.templateLabel;

      if (matched) {
        amount = Number(matched.amount) || 0;
        const cleaned = sanitizeLabel(matched.label, rDef.templateLabel);
        if (cleaned) {
          label = cleaned;
        }
      }

      list.push({
        kind: rDef.kind,
        label,
        amount,
      });
    });

    // Also include any extra custom kinds if any exist in the voucher
    items.forEach((it) => {
      if (!STANDARD_ROSTER_DEFS.some((s) => s.kind === it.kind)) {
        list.push({
          kind: it.kind,
          label: sanitizeLabel(it.label, 'Custom Fee Head'),
          amount: Number(it.amount) || 0,
        });
      }
    });

    return list;
  }, [items, resolvedRoster]);

  // Totals calculations
  const grossTotal = reconciledItems
    .filter((p) => p.amount > 0 && p.kind !== 'PreviousBalance')
    .reduce((sum, p) => sum + p.amount, 0);

  const discountTotal = reconciledItems
    .filter((p) => p.kind === 'Discount' || (p.amount < 0 && p.kind !== 'PreviousBalance'))
    .reduce((sum, p) => sum + Math.abs(p.amount), 0);

  const netDue = roundUpToMultiple(
    reconciledItems.reduce((sum, p) => sum + p.amount, 0),
    getEffectiveMultiple(roundingEnabled, roundingMultiple)
  );

  const handleAmountChange = (kind: ParticularKind, valStr: string) => {
    // Only Flex1-4 heads and values are editable
    const isFlex = STANDARD_ROSTER_DEFS.find((d) => d.kind === kind)?.isFlex ?? false;
    if (!canEdit || !isFlex) return;

    const rawVal = parseFloat(valStr);
    const numericVal = isNaN(rawVal) ? 0 : Math.max(0, rawVal);

    const updatedList = reconciledItems.map((item) => {
      if (item.kind !== kind) return item;
      return {
        ...item,
        amount: numericVal,
      };
    });

    onChange(updatedList);
  };

  const handleLabelChange = (kind: ParticularKind, newLabel: string) => {
    // Only Flex1-4 heads are editable
    const isFlex = STANDARD_ROSTER_DEFS.find((d) => d.kind === kind)?.isFlex ?? false;
    if (!canEdit || !isFlex) return;

    const updatedList = reconciledItems.map((item) => {
      if (item.kind === kind) {
        return { ...item, label: newLabel };
      }
      return item;
    });
    onChange(updatedList);
  };

  // Determine if current amounts differ from original voucher items
  const hasModifications = useMemo(() => {
    if (!originalItems) return false;
    for (const rItem of reconciledItems) {
      const origMatch = originalItems.find((o) => o.kind === rItem.kind);
      const origAmt = origMatch ? origMatch.amount : 0;
      const origLbl = origMatch ? origMatch.label : '';
      if (rItem.amount !== origAmt || (rItem.label !== origLbl && origLbl)) return true;
    }
    return false;
  }, [reconciledItems, originalItems]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs flex flex-col h-full">
      {/* Header with Title and Save Line Items Button */}
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-teal-600" />
          <span className="font-bold text-xs text-slate-800">Fee Heads & Breakdown</span>
          {onSaveLineItems && (
            <button
              type="button"
              disabled={!hasModifications}
              onClick={onSaveLineItems}
              className={`ml-1 text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition ${
                hasModifications
                  ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-2xs cursor-pointer'
                  : 'bg-slate-200/80 text-slate-400 cursor-not-allowed'
              }`}
              title={hasModifications ? "Save modified line items to voucher" : "No modifications to save"}
            >
              <Save className="w-3 h-3" />
              Save Line Items
            </button>
          )}
        </div>

        {hasModifications && onResetToOriginal && (
          <button
            type="button"
            onClick={onResetToOriginal}
            className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            title="Reset to original voucher amounts"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* Clean Compact Rows (No edit/lock icons, no category pills) */}
      <div className="divide-y divide-slate-100 overflow-y-auto flex-1 max-h-[310px]">
        {reconciledItems.map((item, index) => {
          const spec = STANDARD_ROSTER_DEFS.find((sr) => sr.kind === item.kind);
          const isFlexField = spec?.isFlex ?? false;
          const isDiscount = item.kind === 'Discount' || item.amount < 0;
          const displayAmount = isDiscount ? Math.abs(item.amount) : item.amount;
          const isZero = displayAmount === 0;

          return (
            <div
              key={`${item.kind}-${index}`}
              className={`px-3 py-1.5 flex items-center justify-between gap-2 text-xs transition ${
                isFlexField
                  ? 'bg-teal-50/20 hover:bg-teal-50/40'
                  : isDiscount
                  ? 'bg-rose-50/20 hover:bg-rose-50/40'
                  : 'hover:bg-slate-50/80'
              }`}
            >
              {/* Fee Head Name */}
              <div className="flex items-center min-w-0 flex-1">
                {isFlexField && canEdit ? (
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) => handleLabelChange(item.kind, e.target.value)}
                    placeholder={spec?.defaultLabel || 'Fee Head'}
                    className="w-full bg-white border border-slate-200 focus:border-teal-500 rounded px-1.5 py-0.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                ) : (
                  <span className="font-semibold text-slate-700 truncate text-xs">
                    {item.label}
                  </span>
                )}
              </div>

              {/* Amount Display / Input */}
              <div className="flex items-center gap-1 shrink-0">
                {isFlexField && canEdit ? (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[10px] text-slate-400 font-bold">Rs.</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={displayAmount === 0 ? '' : displayAmount}
                      onChange={(e) => handleAmountChange(item.kind, e.target.value)}
                      placeholder="0"
                      className="w-20 px-1.5 py-0.5 bg-white border border-teal-300 rounded text-right font-mono font-bold text-xs text-teal-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                ) : (
                  <div className="w-24 text-right font-mono font-bold text-xs py-0.5">
                    {isDiscount ? (
                      <span className="text-rose-600">
                        {displayAmount > 0 ? `-${formatCurrency(displayAmount)}` : 'Rs. 0'}
                      </span>
                    ) : isZero ? (
                      <span className="text-slate-300 font-normal">Rs. 0</span>
                    ) : (
                      <span className="text-slate-800">{formatCurrency(displayAmount)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact Totals Footer */}
      <div className="bg-slate-50 p-2.5 border-t border-slate-200 grid grid-cols-3 gap-2 text-center font-mono shrink-0">
        <div className="bg-white px-2 py-1 rounded border border-slate-200">
          <div className="text-[9px] text-slate-500 font-sans">Gross Total</div>
          <div className="font-bold text-slate-800 text-xs">{formatCurrency(grossTotal)}</div>
        </div>
        <div className="bg-white px-2 py-1 rounded border border-slate-200">
          <div className="text-[9px] text-slate-500 font-sans">Concession</div>
          <div className="font-bold text-rose-700 text-xs">
            {discountTotal > 0 ? `-${formatCurrency(discountTotal)}` : 'Rs. 0'}
          </div>
        </div>
        <div className="bg-teal-50 px-2 py-1 rounded border border-teal-200">
          <div className="text-[9px] text-teal-800 font-sans font-bold">
            {roundingEnabled ? `Net Due (Rounded to ${roundingMultiple ?? 10})` : 'Net Due'}
          </div>
          <div className="font-black text-teal-900 text-xs">{formatCurrency(netDue)}</div>
        </div>
      </div>
    </div>
  );
};
