import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  Undo2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { StudentAvatar } from '../../components/StudentAvatar';
import { ConfirmModal } from '../../components/ConfirmModal';
import { THEME_COLOR_PRESETS } from '../../utils/themeConfig';
import { formatCurrency, formatMonthName } from '../../utils/feeMath';
import { bsApi, fileToBase64 } from './api';
import type {
  ApplyPreview,
  PaymentModeChoice,
  StatementTxRow,
  StatementUploadSummary,
  Suggestion,
} from './shared';

type Tab = 'open' | 'applied' | 'ignored';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export const BankStatementsView: React.FC = () => {
  const { activeMonth, isMonthLocked, showToast, refreshFromServer, themeConfig } = useApp();
  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;
  const locked = isMonthLocked(activeMonth);

  const [uploads, setUploads] = useState<StatementUploadSummary[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadToDelete, setUploadToDelete] = useState<StatementUploadSummary | null>(null);

  // Filter uploads exclusively to the active billing month from the vertical sidebar
  const displayedUploads = useMemo(() => {
    return uploads.filter((u) => !u.feeMonth || u.feeMonth === activeMonth);
  }, [uploads, activeMonth]);

  // Upload form
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<{ message: string; warnings: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Workspace
  const [tab, setTab] = useState<Tab>('open');
  const [rows, setRows] = useState<StatementTxRow[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [loadingRows, setLoadingRows] = useState(false);
  const [focus, setFocus] = useState(0);
  const [busyTx, setBusyTx] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  // Picker drawer
  const [pickerTx, setPickerTx] = useState<StatementTxRow | null>(null);
  const [pickerQ, setPickerQ] = useState('');
  const [pickerResults, setPickerResults] = useState<Suggestion[]>([]);
  const [pickerActive, setPickerActive] = useState(0);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pickerSeq = useRef(0);

  // Ignore prompt + apply dialog
  const [ignoreTx, setIgnoreTx] = useState<StatementTxRow | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentModeChoice>('auto');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const selected = useMemo(() => uploads.find((u) => u.id === selectedId) || null, [uploads, selectedId]);

  // Keep selectedId pointing to a valid item in displayedUploads
  useEffect(() => {
    if (displayedUploads.length > 0) {
      if (!selectedId || !displayedUploads.some((u) => u.id === selectedId)) {
        setSelectedId(displayedUploads[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [displayedUploads, selectedId]);

  // ------------------------------------------------------------------ loading
  const loadUploads = useCallback(async () => {
    const r = await bsApi.uploads();
    if (r.success) {
      setUploads(r.uploads);
    } else {
      showToast(r.error, 'error');
    }
    setLoadingUploads(false);
  }, [showToast]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads]);

  const loadRows = useCallback(
    async (id: string, which: Tab) => {
      setLoadingRows(true);
      const r = await bsApi.transactions(id, which);
      if (r.success) setRows(r.transactions);
      else showToast(r.error, 'error');
      if (which === 'open') {
        const s = await bsApi.suggestions(id);
        if (s.success) setSuggestions(s.suggestions);
      }
      setLoadingRows(false);
    },
    [showToast]
  );

  useEffect(() => {
    if (selectedId) {
      setFocus(0);
      void loadRows(selectedId, tab);
    } else {
      setRows([]);
    }
  }, [selectedId, tab, loadRows]);

  const reloadAll = useCallback(async () => {
    if (!selectedId) return;
    await Promise.all([loadUploads(), loadRows(selectedId, tab)]);
  }, [selectedId, tab, loadUploads, loadRows]);

  // ------------------------------------------------------------------ upload
  const doUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (isMonthLocked(activeMonth)) {
      setUploadError({
        message: `Fee books for ${formatMonthName(activeMonth)} are locked. Ingestion of new statements is disabled.`,
        warnings: [],
      });
      return;
    }
    setUploading(true);
    try {
      const r = await bsApi.upload({
        filename: file.name,
        mimeType: file.type || '',
        contentBase64: await fileToBase64(file),
        feeMonth: activeMonth,
      });
      if (!r.success) {
        setUploadError({ message: r.error, warnings: r.upload?.warnings || [] });
        await loadUploads();
        return;
      }
      await loadUploads();
      setTab('open');
      setSelectedId(r.upload.id);
      showToast(
        r.upload.newCount > 0
          ? `${r.upload.newCount} new credit${r.upload.newCount === 1 ? '' : 's'} ready to match` +
              (r.upload.duplicateCount ? ` (${r.upload.duplicateCount} duplicate${r.upload.duplicateCount === 1 ? '' : 's'} skipped)` : '')
          : 'No new credit transactions — all items in this statement were already known.',
        r.upload.newCount > 0 ? 'success' : 'info'
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ------------------------------------------------------------------ delete upload
  const confirmDeleteUpload = async () => {
    if (!uploadToDelete) return;
    if (locked) {
      showToast('Fee books for this month are locked. Statements cannot be deleted.', 'error');
      setUploadToDelete(null);
      return;
    }
    const targetId = uploadToDelete.id;
    const filename = uploadToDelete.filename;
    const r = await bsApi.deleteUpload(targetId);
    if (r.success) {
      showToast(`Removed statement "${filename}" from consideration.`, 'info');
      setUploads((prev) => prev.filter((u) => u.id !== targetId));
      if (selectedId === targetId) {
        const remaining = displayedUploads.filter((u) => u.id !== targetId);
        setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      }
    } else {
      showToast(r.error || 'Failed to remove statement.', 'error');
    }
    setUploadToDelete(null);
  };

  // ------------------------------------------------------------------ row actions
  const replaceRow = (t: StatementTxRow) => setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));

  const hasInvalidSplit = useMemo(() => {
    return rows.some((r) => {
      if (r.status !== 'assigned') return false;
      const d = r.duesAmount !== null && r.duesAmount !== undefined ? r.duesAmount : r.amount;
      const f = r.fineAmount !== null && r.fineAmount !== undefined ? r.fineAmount : 0;
      return d + f > r.amount + 0.01;
    });
  }, [rows]);

  const assign = async (tx: StatementTxRow, studentId: string, split?: { duesAmount?: number; fineAmount?: number }) => {
    if (locked) {
      showToast('Fee books for this month are locked. Student allocations cannot be modified.', 'error');
      return false;
    }
    setBusyTx(tx.id);
    const r = await bsApi.assign(tx.id, studentId, split);
    setBusyTx(null);
    if (!r.success) {
      showToast(r.error, 'error');
      return false;
    }
    replaceRow(r.transaction);
    if (selectedId) {
      const s = await bsApi.suggestions(selectedId);
      if (s.success) setSuggestions(s.suggestions);
      void loadUploads();
    }
    return true;
  };

  const updateSplit = async (tx: StatementTxRow, dues: number, fine: number) => {
    if (locked) {
      showToast('Fee books for this month are locked. Amounts cannot be modified.', 'error');
      return;
    }
    setBusyTx(tx.id);
    const r = await bsApi.updateSplit(tx.id, dues, fine);
    setBusyTx(null);
    if (!r.success) {
      showToast(r.error, 'error');
      return;
    }
    replaceRow(r.transaction);
  };

  const unassign = async (tx: StatementTxRow) => {
    if (locked) {
      showToast('Fee books for this month are locked. Student allocations cannot be modified.', 'error');
      return;
    }
    setBusyTx(tx.id);
    const r = await bsApi.unassign(tx.id);
    setBusyTx(null);
    if (!r.success) return void showToast(r.error, 'error');
    replaceRow(r.transaction);
    if (selectedId) {
      const s = await bsApi.suggestions(selectedId);
      if (s.success) setSuggestions(s.suggestions);
      void loadUploads();
    }
  };

  const confirmIgnore = async () => {
    if (!ignoreTx) return;
    if (locked) {
      showToast('Fee books for this month are locked. Transactions cannot be excluded.', 'error');
      setIgnoreTx(null);
      return;
    }
    const tx = ignoreTx;
    setBusyTx(tx.id);
    const r = await bsApi.ignore(tx.id, ignoreReason);
    setBusyTx(null);
    setIgnoreTx(null);
    setIgnoreReason('');
    if (!r.success) return void showToast(r.error, 'error');
    await reloadAll();
  };

  const simple = async (fn: (id: string) => Promise<{ success: boolean } & { error?: string }>, tx: StatementTxRow) => {
    if (locked) {
      showToast('Fee books for this month are locked. Changes cannot be performed.', 'error');
      return;
    }
    setBusyTx(tx.id);
    const r: any = await fn(tx.id);
    setBusyTx(null);
    if (!r.success) return void showToast(r.error, 'error');
    await reloadAll();
  };

  // ------------------------------------------------------------------ picker
  const openPicker = (tx: StatementTxRow) => {
    if (locked) {
      showToast('Fee books for this month are locked. Student allocation is read-only.', 'info');
      return;
    }
    setPickerTx(tx);
    setPickerQ('');
    setPickerActive(0);
    setPickerResults(suggestions[tx.id] || []);
  };

  useEffect(() => {
    if (!pickerTx) return;
    const seq = ++pickerSeq.current;
    setPickerLoading(true);
    const t = setTimeout(async () => {
      const r = await bsApi.suggestionsFor(pickerTx.id, pickerQ.trim() || undefined);
      if (seq !== pickerSeq.current) return;
      setPickerLoading(false);
      if (r.success) {
        setPickerResults(r.suggestions);
        setPickerActive(0);
      } else showToast(r.error, 'error');
    }, pickerQ ? 200 : 0);
    return () => clearTimeout(t);
  }, [pickerTx, pickerQ, showToast]);

  const choose = async (s: Suggestion) => {
    if (!pickerTx || locked) return;
    const tx = pickerTx;
    if (await assign(tx, s.studentId, { duesAmount: s.suggestedDues, fineAmount: s.suggestedFine })) {
      setPickerTx(null);
      setFocus((f) => Math.min(f + 1, Math.max(0, rows.length - 1)));
    }
  };

  useEscapeKey(() => setPickerTx(null), !!pickerTx);

  // ------------------------------------------------------------------ apply
  const openApply = async () => {
    if (!selectedId || locked) return;
    if (hasInvalidSplit) {
      showToast('Some transactions have dues + fine exceeding credit amount. Please adjust the split before posting.', 'error');
      return;
    }
    setApplyOpen(true);
    setApplyError(null);
    setPreview(null);
    setPreviewLoading(true);
    const r = await bsApi.preview(selectedId);
    setPreviewLoading(false);
    if (r.success) setPreview(r.preview);
    else setApplyError(r.error);
  };

  const doApply = async () => {
    if (!selectedId || !preview || locked) return;
    setApplying(true);
    setApplyError(null);
    const readyIds = preview.rows.filter((r) => r.ready).map((r) => r.txId);
    const r = await bsApi.apply(selectedId, paymentMode, readyIds);
    setApplying(false);
    if (!r.success) {
      setApplyError(r.error);
      return;
    }
    setApplyOpen(false);
    showToast(
      `Posted ${r.result.appliedCount} collection(s) totalling ${formatCurrency(r.result.totalAmount)} under receipt batch ${r.result.collectionNo}.`,
      'success',
      6000
    );
    await refreshFromServer();
    await reloadAll();
  };

  useEscapeKey(() => !applying && setApplyOpen(false), applyOpen);

  // ------------------------------------------------------------------ keyboard
  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.description} ${r.reference || ''} ${r.studentName || ''} ${r.studentRegNo || ''} ${r.amount}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, filterText]);

  useEffect(() => {
    if (focus > visible.length - 1) setFocus(Math.max(0, visible.length - 1));
  }, [visible.length, focus]);

  useEffect(() => {
    document.getElementById(`bs-row-${focus}`)?.scrollIntoView({ block: 'nearest' });
  }, [focus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || pickerTx || applyOpen || ignoreTx || uploadToDelete) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!locked) void openApply();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const tx = visible[focus];
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setFocus((f) => Math.min(f + 1, visible.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setFocus((f) => Math.max(f - 1, 0));
      } else if (tab === 'open' && tx && !locked) {
        if (e.key === 'Enter' || e.key === '/') {
          e.preventDefault();
          openPicker(tx);
        } else if (['1', '2', '3'].includes(e.key)) {
          const s = suggestions[tx.id]?.[Number(e.key) - 1];
          if (s) {
            e.preventDefault();
            void assign(tx, s.studentId, { duesAmount: s.suggestedDues, fineAmount: s.suggestedFine }).then(
              (ok) => ok && setFocus((f) => Math.min(f + 1, visible.length - 1))
            );
          }
        } else if (e.key === 'u' && tx.status === 'assigned') void unassign(tx);
        else if (e.key === 'i') {
          e.preventDefault();
          setIgnoreTx(tx);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------------ metrics & counts
  const assignedCount = selected?.counts.assigned || 0;
  const pendingCount = selected?.counts.pending || 0;
  const appliedCount = selected?.counts.applied || 0;
  const ignoredCount = selected?.counts.ignored || 0;
  const openTodoCount = pendingCount + assignedCount;

  return (
    <div className="space-y-6">
      {/* Top Header - Consistent with FamiliesView, CollectionsView, etc. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-6 h-6 text-teal-600" />
            Bank Statements
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Load bank statements, match incoming deposits to students, and post verified fee collections directly to vouchers.
          </p>
        </div>

        {locked && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
              Month Locked
            </span>
          </div>
        )}
      </div>

      {/* Month Locked Warning Banner */}
      {locked && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs text-rose-900 shadow-2xs flex items-center gap-3">
          <Lock className="w-4 h-4 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold">Fee books for {formatMonthName(activeMonth)} are locked.</span>{' '}
            Student allocations, postings, exclusions, and statement deletions are disabled in read-only mode until an Admin unlocks the month.
          </div>
        </div>
      )}

      {/* Top Section: Ingestion Dropzone & Compact Uploaded Statements Batches Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Statement Ingestion Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-slate-500" />
                Upload Statement File
              </div>
            </div>

            {/* Caution Work In Progress Note */}
            <div className="mb-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Work in progress:</strong> Bank statement auto-reconciliation is an evolving function. Always review suggested student matches and verify voucher amounts before posting collections.
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!locked) void doUpload(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-xl p-4 border-2 border-dashed transition-all duration-150 flex items-center justify-between gap-3 ${
                dragOver
                  ? 'border-teal-500 bg-teal-50/50 shadow-sm ring-4 ring-teal-500/10'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 text-slate-600 shadow-2xs">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin text-teal-600" /> : <FileSpreadsheet className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {uploading ? 'Parsing statement content…' : 'Drop bank statement here'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">PDF, CSV, Excel (XLSX), or TXT</div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.csv,.xlsx,.txt"
                  className="hidden"
                  onChange={(e) => void doUpload(e.target.files?.[0])}
                />
                <button
                  type="button"
                  disabled={uploading || locked}
                  onClick={() => fileRef.current?.click()}
                  style={!locked ? { backgroundColor: preset.primaryColor } : undefined}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap bg-teal-700"
                >
                  {uploading ? 'Reading...' : 'Choose File'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>Supports standard electronic bank statement formats</span>
            {locked && <span className="text-rose-600 font-semibold">Locked month prevents uploads</span>}
          </div>

          {uploadError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-900 shadow-2xs">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                {uploadError.message}
              </div>
              {uploadError.warnings.length > 0 && (
                <ul className="mt-1.5 list-disc pl-5 space-y-0.5 text-rose-800 text-[11px]">
                  {uploadError.warnings.slice(0, 4).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Uploaded Statement Batches Card with Scroll Bar & Delete Button */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Uploaded Statements</span>
            </div>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
              {displayedUploads.length} batch{displayedUploads.length === 1 ? '' : 'es'}
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 flex-1">
            {loadingUploads ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="animate-spin inline w-5 h-5 text-teal-600" />
                <p className="text-xs text-slate-500 mt-1">Loading statements…</p>
              </div>
            ) : displayedUploads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No bank statements uploaded for {formatMonthName(activeMonth)} yet. Upload a statement on the left to begin.
              </div>
            ) : (
              displayedUploads.map((u) => {
                const openCount = u.counts.pending + u.counts.assigned;
                const isSelected = selectedId === u.id;
                const isFailed = u.parseStatus === 'failed';

                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      setTab('open');
                      setSelectedId(u.id);
                    }}
                    className={`flex items-center justify-between gap-2.5 p-3 text-left transition cursor-pointer relative ${
                      isSelected ? 'bg-teal-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                    )}

                    <div className="flex items-start gap-2.5 min-w-0 flex-1 pl-1">
                      <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${isFailed ? 'text-rose-500' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate" title={u.filename}>
                            {u.filename}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{new Date(u.uploadedAt).toLocaleDateString()}</span>
                          {u.uploadedByName && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[100px]">{u.uploadedByName}</span>
                            </>
                          )}
                          <span>·</span>
                          {isFailed ? (
                            <span className="text-rose-600 font-semibold">Failed</span>
                          ) : openCount > 0 ? (
                            <span className="text-amber-700 font-semibold">{openCount} to do</span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">{u.counts.applied} applied</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Delete Statement Action Button */}
                    <button
                      type="button"
                      disabled={locked}
                      title={
                        locked
                          ? 'Month is locked — statement batches cannot be removed'
                          : 'Remove statement upload from consideration'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (locked) return;
                        setUploadToDelete(u);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Main Full-Width Statement Workbench */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden min-h-[440px]">
        {!selected ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-4 shadow-2xs">
              <Landmark className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Statement Selected</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Upload a bank statement above or select one from the uploaded statements list to review deposits and match students.
            </p>
          </div>
        ) : selected.parseStatus === 'failed' ? (
          <div className="p-8">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-rose-900">Statement Parsing Error</h3>
                  <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                    The parser could not extract credit transaction rows from <b>{selected.filename}</b>. This typically occurs if the file format does not match recognized column headers.
                  </p>
                  {selected.parseError && (
                    <div className="mt-3 p-3 bg-white/90 rounded-lg border border-rose-200/80 text-xs font-mono text-rose-800">
                      {selected.parseError}
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-3">
                    <a
                      href={bsApi.fileUrl(selected.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-xs font-bold text-rose-800 hover:bg-rose-100/50 shadow-2xs transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Original File
                    </a>
                    <button
                      type="button"
                      disabled={locked}
                      title={locked ? 'Month is locked — statements cannot be removed' : undefined}
                      onClick={() => !locked && setUploadToDelete(selected)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove from Consideration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Statement Banner & Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/40">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 truncate" title={selected.filename}>
                      {selected.filename}
                    </h2>
                  </div>

                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {selected.bankName && (
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {selected.bankName}
                      </span>
                    )}
                    {selected.accountNumber && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[11px] text-slate-600">A/C {selected.accountNumber}</span>
                      </>
                    )}
                    {selected.periodFrom && (
                      <>
                        <span>·</span>
                        <span className="text-[11px]">Period: {selected.periodFrom} → {selected.periodTo}</span>
                      </>
                    )}
                    <span>·</span>
                    <a
                      href={bsApi.fileUrl(selected.id)}
                      className="text-teal-700 hover:text-teal-800 underline font-medium inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      original file
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={assignedCount === 0 || locked || hasInvalidSplit}
                    onClick={() => !locked && !hasInvalidSplit && void openApply()}
                    style={assignedCount > 0 && !locked && !hasInvalidSplit ? { backgroundColor: preset.primaryColor } : undefined}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap bg-teal-700"
                    title={
                      locked
                        ? 'Month is locked — collections cannot be posted'
                        : hasInvalidSplit
                        ? 'Some transactions have allocated dues + fine exceeding statement credit'
                        : 'Press Ctrl+Enter / Cmd+Enter to open'
                    }
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Review &amp; Apply Collections</span>
                    {assignedCount > 0 && (
                      <span className="bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-mono">
                        {assignedCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* 4-Stat Metric Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Credits</div>
                  <div className="text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                    {formatCurrency(
                      (selected.amounts.pending || 0) +
                        (selected.amounts.assigned || 0) +
                        (selected.amounts.applied || 0) +
                        (selected.amounts.ignored || 0)
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-semibold text-slate-700">{selected.totalCredits}</span> credit transaction{selected.totalCredits === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Pending Match</div>
                  <div className="text-base font-bold text-amber-700 font-mono tabular-nums mt-0.5">
                    {formatCurrency(selected.amounts.pending || 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-semibold text-amber-700">{pendingCount}</span> unassigned deposit{pendingCount === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Ready to Post</div>
                  <div className="text-base font-bold text-teal-700 font-mono tabular-nums mt-0.5">
                    {formatCurrency(selected.amounts.assigned || 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-semibold text-teal-700">{assignedCount}</span> matched student{assignedCount === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Posted Collections</div>
                  <div className="text-base font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                    {formatCurrency(selected.amounts.applied || 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-semibold text-emerald-700">{appliedCount}</span> verified record{appliedCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              {/* Warnings Callout */}
              {selected.warnings.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 shadow-2xs">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Reconciliation Alerts ({selected.warnings.length})
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-amber-800">
                    {selected.warnings.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  {selected.warnings.length > 4 && (
                    <div className="mt-1 text-[11px] font-medium text-amber-700 pl-5">
                      …and {selected.warnings.length - 4} more warnings recorded.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Workbench Action Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
              {/* Segmented Filter Tabs */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                {([
                  ['open', `To Do (${openTodoCount})`],
                  ['applied', `Posted (${appliedCount})`],
                  ['ignored', `Ignored (${ignoredCount})`],
                ] as Array<[Tab, string]>).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      tab === id ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Search / Filter Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Search narration, ref, student…"
                  className="pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-64 transition"
                />
                {filterText && (
                  <button
                    type="button"
                    onClick={() => setFilterText('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Keyboard Guidance Ribbon */}
            {tab === 'open' && (
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <div className="flex items-center gap-1 font-medium">
                  <span className="font-bold text-slate-700">Keyboard shortcuts:</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">↓</kbd>
                  <span>navigate</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">Enter</kbd>
                  <span>search student</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">1</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">2</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">3</kbd>
                  <span>accept match</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">U</kbd>
                  <span>unassign</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">I</kbd>
                  <span>ignore</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">Ctrl+Enter</kbd>
                  <span>apply</span>
                </div>
              </div>
            )}

            {/* Transactions Ledger Table */}
            <div className="p-5">
              {loadingRows ? (
                <div className="py-16 text-center text-slate-400">
                  <Loader2 className="animate-spin inline w-6 h-6 text-teal-600" />
                  <p className="text-xs text-slate-500 mt-2 font-medium">Loading bank credits...</p>
                </div>
              ) : visible.length === 0 ? (
                <div className="py-16 text-center">
                  {tab === 'open' ? (
                    <div className="max-w-xs mx-auto">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800">All credits reconciled!</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Every credit transaction in this statement has either been assigned, posted, or marked as non-fee income.
                      </p>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      {filterText ? 'No transactions match the search filter.' : 'No entries found in this view.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/90 shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/90 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-3 font-bold w-12 text-center">#</th>
                        <th className="px-4 py-3 font-bold w-28">Date</th>
                        <th className="px-4 py-3 font-bold text-right w-32">Credit Amount</th>
                        <th className="px-4 py-3 font-bold min-w-[240px]">Bank Narration &amp; Ref</th>
                        <th className="px-4 py-3 font-bold min-w-[280px]">
                          {tab === 'open' ? 'Student Allocation' : tab === 'applied' ? 'Receipt & Allocation' : 'Ignore Reason'}
                        </th>
                        <th className="px-3 py-3 font-bold text-right w-28">Base Dues</th>
                        <th className="px-3 py-3 font-bold text-right w-24">Late Fine</th>
                        <th className="px-3 py-3 font-bold text-center w-36">Split Status</th>
                        <th className="px-4 py-3 font-bold text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {visible.map((tx, i) => {
                        const isFocused = focus === i;
                        const isAssigned = tx.status === 'assigned';

                        return (
                          <tr
                            key={tx.id}
                            id={`bs-row-${i}`}
                            onClick={() => setFocus(i)}
                            className={`transition-colors duration-150 ${
                              isFocused
                                ? 'bg-teal-50/70 ring-2 ring-inset ring-teal-500/30'
                                : 'hover:bg-slate-50/80'
                            } ${busyTx === tx.id ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            {/* Row Number Column */}
                            <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs tabular-nums select-none">
                              {tx.rowIndex + 1}
                            </td>

                            {/* Date Column */}
                            <td className="px-4 py-3 text-slate-600 font-mono tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{tx.date}</div>
                            </td>

                            {/* Amount Column */}
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap tabular-nums text-sm">
                              {formatCurrency(tx.amount)}
                            </td>

                            {/* Narration & Reference Column */}
                            <td className="px-4 py-3 text-slate-700 min-w-[240px]">
                              <div className="font-medium text-slate-800 line-clamp-2 leading-relaxed" title={tx.description}>
                                {tx.description || <em className="text-slate-400">Narration not extractable</em>}
                              </div>
                              {tx.reference && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] font-mono text-slate-500">
                                  <Tag className="w-3 h-3 text-slate-400" />
                                  <span>Ref: {tx.reference}</span>
                                </div>
                              )}
                            </td>

                            {/* Allocation / Target Column */}
                            <td className="px-4 py-3 min-w-[280px]">
                              {tab === 'open' && (
                                <AssignCell
                                  tx={tx}
                                  focused={isFocused}
                                  suggestions={suggestions[tx.id] || []}
                                  disabled={locked}
                                  onAccept={(s) =>
                                    void assign(tx, s.studentId, {
                                      duesAmount: s.suggestedDues,
                                      fineAmount: s.suggestedFine,
                                    })
                                  }
                                  onOpen={() => openPicker(tx)}
                                />
                              )}

                              {tab === 'applied' && (
                                <div className="text-xs space-y-1">
                                  <div className="flex items-center gap-2">
                                    <StudentAvatar name={tx.studentName || 'Student'} size="xs" />
                                    <span className="font-bold text-slate-900">{tx.studentName}</span>
                                    <span className="font-mono text-slate-500">({tx.studentRegNo})</span>
                                  </div>
                                  {tx.collectionMissing ? (
                                    <div className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                                      <AlertTriangle className="w-3 h-3" />
                                      Collection reversed — ready to re-apply
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium">
                                      <span className="font-mono font-bold">{tx.collectionNo}</span>
                                      <span>·</span>
                                      <span>By {tx.appliedByName || 'System'}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {tab === 'ignored' && (
                                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                                  <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{tx.ignoreReason || 'Excluded from fee collections'}</span>
                                </div>
                              )}
                            </td>

                            {/* Permanent Dedicated Columns: Base Dues, Late Fine, and Split Status */}
                            <DuesFineSplitCells
                              tx={tx}
                              tab={tab}
                              disabled={locked}
                              onUpdateSplit={(d, f) => void updateSplit(tx, d, f)}
                            />

                            {/* Actions Column */}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {tab === 'open' && (
                                <div className="flex items-center justify-end gap-1">
                                  {isAssigned && (
                                    <button
                                      type="button"
                                      disabled={locked}
                                      title={locked ? "Cannot unassign student in a locked month" : "Clear student assignment (U)"}
                                      onClick={() => void unassign(tx)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400 transition cursor-pointer"
                                    >
                                      <Undo2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={locked}
                                    title={locked ? "Cannot exclude transaction in a locked month" : "Exclude (not a fee payment) (I)"}
                                    onClick={() => setIgnoreTx(tx)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400 transition cursor-pointer"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                </div>
                              )}

                              {tab === 'ignored' && (
                                <button
                                  type="button"
                                  disabled={locked}
                                  title={locked ? "Cannot restore transactions in a locked month" : "Restore to Todo"}
                                  onClick={() => void simple(bsApi.unignore, tx)}
                                  className="text-xs font-bold text-teal-700 hover:text-teal-800 hover:underline disabled:opacity-35 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
                                >
                                  Restore to Todo
                                </button>
                              )}

                              {tab === 'applied' && tx.collectionMissing && (
                                <button
                                  type="button"
                                  disabled={locked}
                                  title={locked ? "Cannot reopen transaction in a locked month" : "Reopen"}
                                  onClick={() => void simple(bsApi.reopen, tx)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline disabled:opacity-35 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reopen
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Statement Confirmation Modal */}
      <ConfirmModal
        isOpen={!!uploadToDelete}
        onClose={() => setUploadToDelete(null)}
        onConfirm={() => void confirmDeleteUpload()}
        title="Delete Statement Batch?"
        message={
          <div>
            <p>
              Are you sure you want to remove <strong>{uploadToDelete?.filename}</strong>?
            </p>
            <p className="mt-2 text-xs text-slate-500">
              This will remove all associated pending and assigned transactions from consideration.
            </p>
            {uploadToDelete && uploadToDelete.counts.applied > 0 && (
              <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                Caution: This statement contains {uploadToDelete.counts.applied} already posted collections. Statements with posted collections cannot be deleted until reversed.
              </div>
            )}
          </div>
        }
        confirmLabel="Remove Statement"
        variant="danger"
      />

      {/* Student Picker Slide-Over Drawer */}
      {pickerTx && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity"
          onMouseDown={(e) => e.target === e.currentTarget && setPickerTx(null)}
        >
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
            {/* Drawer Top Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Student Assignment</div>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">{formatCurrency(pickerTx.amount)}</h3>
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">Credit on {pickerTx.date}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerTx(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Narration Context Box */}
              <div className="mt-3.5 p-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-700 shadow-2xs">
                <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider block mb-0.5">
                  Statement Narration
                </span>
                <p className="line-clamp-3 leading-relaxed font-medium">{pickerTx.description}</p>
                {pickerTx.reference && (
                  <div className="mt-1 font-mono text-[11px] text-slate-500">Ref: {pickerTx.reference}</div>
                )}
              </div>

              {/* Search Bar */}
              <div className="relative mt-4">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={pickerQ}
                  onChange={(e) => setPickerQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setPickerActive((a) => Math.min(a + 1, pickerResults.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setPickerActive((a) => Math.max(a - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const s = pickerResults[pickerActive];
                      if (s) void choose(s);
                    }
                  }}
                  placeholder="Search by student name, reg no., father name, phone…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white transition shadow-2xs"
                />
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {pickerLoading && pickerResults.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Loader2 className="animate-spin inline w-6 h-6 text-teal-600" />
                  <p className="text-xs text-slate-500 mt-2">Searching enrolled students...</p>
                </div>
              ) : pickerResults.length === 0 ? (
                <div className="p-12 text-center">
                  <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-slate-700">No matching students found</div>
                  <p className="text-xs text-slate-400 mt-1">Try searching with a partial registration number or name.</p>
                </div>
              ) : (
                <div>
                  {!pickerQ && (
                    <div className="px-6 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Algorithmic Suggestions (Score Ranked)
                    </div>
                  )}
                  {pickerResults.map((s, i) => {
                    const isSelected = pickerActive === i;
                    return (
                      <button
                        key={s.studentId}
                        type="button"
                        onMouseEnter={() => setPickerActive(i)}
                        onClick={() => void choose(s)}
                        className={`w-full text-left px-6 py-3.5 transition cursor-pointer flex items-start gap-3.5 ${
                          isSelected ? 'bg-teal-50/80 shadow-2xs' : 'hover:bg-slate-50'
                        }`}
                      >
                        <StudentAvatar name={s.name} size="sm" className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                            {s.voucher ? (
                              <div className="text-right">
                                <span
                                  className={`text-xs font-mono font-bold block ${
                                    s.voucher.outstanding > 0 ? 'text-amber-700' : 'text-slate-600'
                                  }`}
                                >
                                  {s.voucher.outstanding > 0
                                    ? `Due ${formatCurrency(s.voucher.outstanding)}`
                                    : s.voucher.status}
                                </span>
                                {s.isOverdue && s.suggestedFine ? (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-1 py-0.2 rounded inline-block mt-0.5">
                                    +Fine Rs. {s.suggestedFine}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span className="font-mono text-slate-700 font-semibold">{s.regNo}</span>
                            {s.className && <span>· {s.className}</span>}
                            {s.fatherName && <span>· S/O {s.fatherName}</span>}
                            {s.status !== 'Active' && (
                              <span className="px-1 py-0.2 bg-slate-100 text-slate-600 text-[10px] rounded font-semibold">
                                {s.status}
                              </span>
                            )}
                          </div>

                          {s.reasons.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {s.reasons.map((r, ri) => (
                                <span
                                  key={ri}
                                  className="text-[10px] font-semibold text-teal-800 bg-teal-50/90 border border-teal-200/80 px-2 py-0.5 rounded"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}

                          {s.voucher && !s.voucher.payable && (
                            <div className="text-[11px] font-semibold text-rose-700 mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {s.voucher.blockedReason}
                            </div>
                          )}
                          {!s.voucher && (
                            <div className="text-[11px] font-medium text-amber-700 mt-1">
                              No monthly voucher issued for this target billing month.
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sticky Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">↓</kbd>
                <span>navigate</span>
                <span className="mx-1">·</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-700 shadow-2xs">Enter</kbd>
                <span>assign</span>
              </div>
              <button
                type="button"
                onClick={() => setPickerTx(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/60 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ignore Reason Dialog */}
      {ignoreTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setIgnoreTx(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Exclude Non-Fee Deposit</h3>
                <p className="text-xs text-slate-500">Mark transaction as non-tuition credit</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 mb-4">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>{formatCurrency(ignoreTx.amount)}</span>
                <span className="font-mono text-slate-500 font-normal">{ignoreTx.date}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-slate-600 font-medium">{ignoreTx.description}</p>
            </div>

            <label className="block text-xs font-bold text-slate-700 mb-1">
              Reason for Exemption (Optional)
            </label>
            <input
              autoFocus
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmIgnore();
                if (e.key === 'Escape') setIgnoreTx(null);
              }}
              placeholder="e.g. Vendor refund, profit on debt, inter-branch transfer"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIgnoreTx(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmIgnore()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white shadow-xs cursor-pointer"
              >
                Exclude Deposit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review & Apply Posting Modal */}
      {applyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
                  style={{
                    backgroundColor: preset.lightBg,
                    color: preset.textColor,
                    border: `1px solid ${preset.lightBorder}`,
                  }}
                >
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Post Bank Collections to Ledgers</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verified deposits will generate official fee collection records credited against student vouchers for{' '}
                    <b>{preview ? formatMonthName(preview.feeMonth) : ''}</b>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={applying}
                onClick={() => setApplyOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {previewLoading && (
                <div className="py-16 text-center text-slate-400">
                  <Loader2 className="animate-spin inline w-8 h-8 text-teal-600" />
                  <p className="text-xs text-slate-500 mt-2 font-medium">Validating vouchers &amp; calculating posting balances...</p>
                </div>
              )}

              {applyError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Posting Error</span>
                    {applyError}
                  </div>
                </div>
              )}

              {preview && (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ready to Post</div>
                      <div className="text-lg font-bold text-emerald-700 font-mono tabular-nums">
                        {preview.readyCount} collections
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Credit Amount</div>
                      <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                        {formatCurrency(preview.readyTotal)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Skipped / Blocked</div>
                      <div className="text-lg font-bold text-slate-700 font-mono tabular-nums">
                        {preview.blockedCount > 0 ? (
                          <span className="text-rose-600">{preview.blockedCount} row(s)</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment Mode Selection */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Payment Collection Method</div>
                      <div className="text-[11px] text-slate-500">Specify how these receipts should be classified in financial reports.</div>
                    </div>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as PaymentModeChoice)}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option value="auto">Auto-detect from Narration (Default)</option>
                      <option value="BankDeposit">Bank Deposit (Slip / Branch)</option>
                      <option value="OnlineTransfer">Online Bank Transfer (FT / IBFT)</option>
                    </select>
                  </div>

                  {/* Preview Items Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5 font-bold">Student</th>
                          <th className="px-3.5 py-2.5 font-bold text-right">Bank Credit</th>
                          <th className="px-3.5 py-2.5 font-bold text-right">Base Dues</th>
                          <th className="px-3.5 py-2.5 font-bold text-right">Late Fine</th>
                          <th className="px-3.5 py-2.5 font-bold">Posting Consequence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {preview.rows.map((r) => (
                          <tr key={r.txId} className={r.ready ? 'hover:bg-slate-50/60' : 'bg-rose-50/40'}>
                            <td className="px-3.5 py-2.5">
                              <div className="font-bold text-slate-800">{r.studentName}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {r.studentRegNo} · {r.date}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 tabular-nums">
                              {formatCurrency(r.amount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono text-slate-700 tabular-nums font-semibold">
                              {formatCurrency(r.duesAmount)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                              {r.fineAmount > 0 ? (
                                <span className="font-bold text-amber-700">{formatCurrency(r.fineAmount)}</span>
                              ) : (
                                <span className="text-slate-400">Rs. 0</span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5">
                              {r.ready ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {r.fineAmount > 0 && (
                                    <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                                      Includes {formatCurrency(r.fineAmount)} fine
                                    </span>
                                  )}
                                  {r.excess > 0 ? (
                                    <span className="text-blue-800 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                                      +{formatCurrency(r.excess)} advance credit
                                    </span>
                                  ) : (
                                    <span className="text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                                      {r.duesAmount < (r.outstanding || 0) ? 'Partial Payment' : 'Clears Voucher Full'}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-rose-700 font-semibold text-[11px] flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Skipped: {r.blockedReason}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={applying}
                onClick={() => setApplyOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={applying || !preview || preview.readyCount === 0}
                onClick={() => void doApply()}
                style={preview && preview.readyCount > 0 ? { backgroundColor: preset.primaryColor } : undefined}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 shadow-xs transition active:scale-98"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Posting Collections to Server...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirm &amp; Post {preview?.readyCount || 0} Collection(s)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AssignCellProps {
  tx: StatementTxRow;
  focused: boolean;
  suggestions: Suggestion[];
  disabled?: boolean;
  onAccept: (s: Suggestion) => void;
  onOpen: () => void;
}

const AssignCell: React.FC<AssignCellProps> = ({
  tx,
  focused,
  suggestions,
  disabled = false,
  onAccept,
  onOpen,
}) => {
  if (disabled) {
    if (tx.status === 'assigned') {
      return (
        <div className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-50 border border-slate-200 text-left select-none">
          <StudentAvatar name={tx.studentName || 'Student'} size="xs" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-800 text-xs truncate">{tx.studentName}</span>
              <span className="font-mono text-[10px] text-slate-500 font-semibold">{tx.studentRegNo}</span>
            </div>
            {tx.studentClass && <div className="text-[10px] text-slate-500">{tx.studentClass}</div>}
          </div>
          <span className="text-[10px] font-semibold text-slate-400 ml-auto pr-1 flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" />
            Locked
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-400 italic py-1 select-none">
        <Lock className="w-3 h-3 text-slate-400 shrink-0" />
        <span>Unassigned (Month locked)</span>
      </div>
    );
  }

  if (tx.status === 'assigned') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-left cursor-pointer group flex items-start gap-2.5 p-1.5 rounded-xl bg-teal-50/80 hover:bg-teal-100/70 border border-teal-200 transition"
        title="Click or press Enter to change student assignment"
      >
        <StudentAvatar name={tx.studentName || 'Student'} size="xs" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-teal-900 text-xs truncate">{tx.studentName}</span>
            <span className="font-mono text-[10px] text-teal-700 font-semibold">{tx.studentRegNo}</span>
          </div>
          {tx.studentClass && <div className="text-[10px] text-teal-700/80">{tx.studentClass}</div>}
          {tx.voucherDueDate && (
            <div className="mt-1 flex items-center gap-1">
              {tx.isOverdue ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300">
                  <Clock className="w-2.5 h-2.5 text-amber-600" />
                  Overdue (Due: {tx.voucherDueDate}{tx.voucherLateFeeRate ? `, Fine: Rs. ${tx.voucherLateFeeRate}` : ''})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                  On-time (Due: {tx.voucherDueDate})
                </span>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold text-teal-700 opacity-60 group-hover:opacity-100 ml-auto pr-1 shrink-0">
          Change
        </span>
      </button>
    );
  }

  const shown = focused ? suggestions.slice(0, 3) : suggestions.slice(0, 1);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((s, i) => (
        <button
          key={s.studentId}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAccept(s);
          }}
          title={s.reasons.join(' · ')}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs cursor-pointer shadow-2xs transition ${
            s.isOverdue
              ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-100 hover:border-amber-400'
              : 'border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/70'
          }`}
        >
          {focused && (
            <kbd className="text-[9px] font-bold font-mono bg-slate-100 border border-slate-200 text-slate-700 rounded px-1">
              {i + 1}
            </kbd>
          )}
          <span className="font-semibold text-slate-800">{s.name}</span>
          <span className="font-mono text-slate-400 text-[11px]">{s.regNo}</span>
          {s.isOverdue && s.suggestedFine ? (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-200/60 px-1 rounded">
              +Rs.{s.suggestedFine} fine
            </span>
          ) : null}
        </button>
      ))}

      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-teal-700 hover:bg-teal-50 hover:text-teal-800 transition cursor-pointer"
      >
        <Search className="w-3 h-3" />
        <span>{suggestions.length ? 'More...' : 'Find student'}</span>
      </button>
    </div>
  );
};

interface DuesFineSplitCellsProps {
  tx: StatementTxRow;
  tab: Tab;
  disabled: boolean;
  onUpdateSplit: (dues: number, fine: number) => void;
}

const DuesFineSplitCells: React.FC<DuesFineSplitCellsProps> = ({
  tx,
  tab,
  disabled,
  onUpdateSplit,
}) => {
  const isAssigned = tx.status === 'assigned';
  const isApplied = tx.status === 'applied';

  const currentDues = tx.duesAmount !== null && tx.duesAmount !== undefined ? tx.duesAmount : tx.amount;
  const currentFine = tx.fineAmount !== null && tx.fineAmount !== undefined ? tx.fineAmount : 0;

  const [duesInput, setDuesInput] = useState<string>(String(currentDues));
  const [fineInput, setFineInput] = useState<string>(String(currentFine));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDuesInput(String(currentDues));
      setFineInput(String(currentFine));
    }
  }, [currentDues, currentFine, isEditing]);

  if (!isAssigned && !isApplied) {
    return (
      <>
        <td className="px-3 py-3 text-right font-mono text-slate-300 select-none">—</td>
        <td className="px-3 py-3 text-right font-mono text-slate-300 select-none">—</td>
        <td className="px-3 py-3 text-center text-[11px] text-slate-400 select-none">
          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium text-[10px]">
            Unallocated
          </span>
        </td>
      </>
    );
  }

  if (isApplied) {
    const dues = tx.duesAmount ?? tx.amount;
    const fine = tx.fineAmount ?? 0;
    return (
      <>
        <td className="px-3 py-3 text-right font-mono font-semibold text-slate-800 tabular-nums">
          {formatCurrency(dues)}
        </td>
        <td className="px-3 py-3 text-right font-mono tabular-nums">
          {fine > 0 ? (
            <span className="text-amber-700 font-semibold">{formatCurrency(fine)}</span>
          ) : (
            <span className="text-slate-400">Rs. 0</span>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Posted
          </span>
        </td>
      </>
    );
  }

  const numDues = parseFloat(duesInput) || 0;
  const numFine = parseFloat(fineInput) || 0;
  const totalAllocated = Math.round((numDues + numFine) * 100) / 100;
  const diff = Math.round((tx.amount - totalAllocated) * 100) / 100;
  const isOverAllocated = diff < -0.01;
  const isBalanced = Math.abs(diff) <= 0.01;

  const handleCommit = (newDuesStr: string, newFineStr: string) => {
    setIsEditing(false);
    const d = Math.max(0, parseFloat(newDuesStr) || 0);
    const f = Math.max(0, parseFloat(newFineStr) || 0);
    if (d + f <= tx.amount + 0.01) {
      if (d !== currentDues || f !== currentFine) {
        onUpdateSplit(d, f);
      }
    }
  };

  const setSplitDirect = (d: number, f: number) => {
    setDuesInput(String(d));
    setFineInput(String(f));
    setIsEditing(false);
    onUpdateSplit(d, f);
  };

  return (
    <>
      {/* Base Dues Input Cell */}
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <div className="relative inline-flex items-center">
          <span className="absolute left-2 text-[10px] text-slate-400 font-mono select-none">Rs.</span>
          <input
            type="number"
            min="0"
            max={tx.amount}
            step="1"
            disabled={disabled}
            value={duesInput}
            onFocus={() => setIsEditing(true)}
            onChange={(e) => setDuesInput(e.target.value)}
            onBlur={() => handleCommit(duesInput, fineInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            title="Base tuition and dues allocated to voucher"
            className={`w-24 pl-7 pr-1.5 py-1 text-right font-mono font-semibold text-xs rounded-lg border transition ${
              isOverAllocated
                ? 'border-rose-400 bg-rose-50 text-rose-900 focus:ring-rose-500'
                : 'border-slate-300 bg-white hover:border-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 text-slate-800'
            }`}
          />
        </div>
      </td>

      {/* Late Fine Input Cell */}
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <div className="relative inline-flex items-center">
          <span className="absolute left-2 text-[10px] text-slate-400 font-mono select-none">Rs.</span>
          <input
            type="number"
            min="0"
            max={tx.amount}
            step="1"
            disabled={disabled}
            value={fineInput}
            onFocus={() => setIsEditing(true)}
            onChange={(e) => setFineInput(e.target.value)}
            onBlur={() => handleCommit(duesInput, fineInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            title="Late payment fine surcharge"
            className={`w-20 pl-7 pr-1.5 py-1 text-right font-mono font-semibold text-xs rounded-lg border transition ${
              isOverAllocated
                ? 'border-rose-400 bg-rose-50 text-rose-900 focus:ring-rose-500'
                : numFine > 0
                ? 'border-amber-300 bg-amber-50/50 text-amber-900 focus:border-amber-500 focus:ring-amber-500/20'
                : 'border-slate-300 bg-white hover:border-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 text-slate-800'
            }`}
          />
        </div>
      </td>

      {/* Split Status & Quick Adjust Cell */}
      <td className="px-3 py-3 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5">
          {isOverAllocated ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300"
              title={`Total allocated (Rs. ${totalAllocated}) exceeds transaction credit (Rs. ${tx.amount}) by Rs. ${Math.abs(diff)}`}
            >
              <AlertCircle className="w-3 h-3 text-rose-600" />
              Exceeds: +Rs.{Math.abs(diff)}
            </span>
          ) : isBalanced ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
              title="Transaction credit perfectly covers allocated dues and fine"
            >
              <Check className="w-3 h-3 text-emerald-600" />
              Balanced
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200"
              title={`Unallocated Rs. ${diff} will be held as advance credit in student ledger`}
            >
              +Rs.{diff} Adv
            </span>
          )}

          {/* Quick Preset Actions Dropdown */}
          <div className="relative group inline-block text-left">
            <button
              type="button"
              disabled={disabled}
              className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer transition"
              title="Quick split options (Waiver, Full Dues, Standard Fine)"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full z-20 w-44 p-1 bg-white rounded-xl shadow-lg border border-slate-200 text-left text-xs space-y-0.5">
              <button
                type="button"
                onClick={() => setSplitDirect(tx.amount, 0)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 font-medium flex items-center justify-between"
              >
                <span>Full to Dues</span>
                <span className="text-[10px] text-slate-400">Fine 0</span>
              </button>
              {tx.voucherLateFeeRate && tx.voucherLateFeeRate > 0 && tx.amount > tx.voucherLateFeeRate && (
                <button
                  type="button"
                  onClick={() => setSplitDirect(tx.amount - (tx.voucherLateFeeRate || 0), tx.voucherLateFeeRate || 0)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 font-medium flex items-center justify-between"
                >
                  <span>Standard Fine Split</span>
                  <span className="text-[10px] text-amber-600">Rs. {tx.voucherLateFeeRate}</span>
                </button>
              )}
              {numFine > 0 && (
                <button
                  type="button"
                  onClick={() => setSplitDirect(numDues, 0)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-rose-700 font-medium flex items-center justify-between"
                >
                  <span>Waive Fine (0)</span>
                  <span className="text-[10px] text-blue-600">+Adv</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </>
  );
};
