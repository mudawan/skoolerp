import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  HelpCircle,
  Info,
  Landmark,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Undo2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { MonthPicker } from '../../components/MonthPicker';
import { StudentAvatar } from '../../components/StudentAvatar';
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

  const [uploads, setUploads] = useState<StatementUploadSummary[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Upload form
  const [feeMonth, setFeeMonth] = useState(activeMonth);
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

  // ------------------------------------------------------------------ loading
  const loadUploads = useCallback(async () => {
    const r = await bsApi.uploads();
    if (r.success) setUploads(r.uploads);
    else showToast(r.error, 'error');
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
    if (isMonthLocked(feeMonth)) {
      setUploadError({
        message: `Fee books for ${formatMonthName(feeMonth)} are locked. Ask an Admin to unlock the month first.`,
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
        feeMonth,
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

  // ------------------------------------------------------------------ row actions
  const replaceRow = (t: StatementTxRow) => setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));

  const assign = async (tx: StatementTxRow, studentId: string) => {
    setBusyTx(tx.id);
    const r = await bsApi.assign(tx.id, studentId);
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

  const unassign = async (tx: StatementTxRow) => {
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
    setBusyTx(tx.id);
    const r: any = await fn(tx.id);
    setBusyTx(null);
    if (!r.success) return void showToast(r.error, 'error');
    await reloadAll();
  };

  // ------------------------------------------------------------------ picker
  const openPicker = (tx: StatementTxRow) => {
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
    if (!pickerTx) return;
    const tx = pickerTx;
    if (await assign(tx, s.studentId)) {
      setPickerTx(null);
      setFocus((f) => Math.min(f + 1, Math.max(0, rows.length - 1)));
    }
  };

  useEscapeKey(() => setPickerTx(null), !!pickerTx);

  // ------------------------------------------------------------------ apply
  const openApply = async () => {
    if (!selectedId) return;
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
    if (!selectedId || !preview) return;
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
      if (!selected || pickerTx || applyOpen || ignoreTx) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void openApply();
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
      } else if (tab === 'open' && tx) {
        if (e.key === 'Enter' || e.key === '/') {
          e.preventDefault();
          openPicker(tx);
        } else if (['1', '2', '3'].includes(e.key)) {
          const s = suggestions[tx.id]?.[Number(e.key) - 1];
          if (s) {
            e.preventDefault();
            void assign(tx, s.studentId).then((ok) => ok && setFocus((f) => Math.min(f + 1, visible.length - 1)));
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
  const locked = isMonthLocked(feeMonth);
  const assignedCount = selected?.counts.assigned || 0;
  const pendingCount = selected?.counts.pending || 0;
  const appliedCount = selected?.counts.applied || 0;
  const ignoredCount = selected?.counts.ignored || 0;
  const openTodoCount = pendingCount + assignedCount;

  // Global aggregate stats
  const totalOpenAcrossUploads = useMemo(
    () => uploads.reduce((acc, u) => acc + (u.counts.pending + u.counts.assigned), 0),
    [uploads]
  );
  const totalAppliedAcrossUploads = useMemo(
    () => uploads.reduce((acc, u) => acc + u.counts.applied, 0),
    [uploads]
  );

  return (
    <div className="space-y-6">
      {/* Top Executive Header */}
      <div className="relative overflow-hidden bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`,
          }}
        />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
              style={{
                backgroundColor: preset.lightBg,
                color: preset.textColor,
                border: `1px solid ${preset.lightBorder}`,
              }}
            >
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Bank Statements Reconciliation</h1>
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md">
                  Electronic Collections Loader
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
                Import school bank statements (PDF, CSV, Excel), match incoming credits against enrolled students, and batch-post verified payments directly to monthly vouchers with full audit trails.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-center">
            <div className="flex items-center gap-4 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Statements:</span>
                <span className="font-bold text-slate-800 font-mono tabular-nums">{uploads.length}</span>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Pending:</span>
                <span className={`font-bold font-mono tabular-nums ${totalOpenAcrossUploads > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                  {totalOpenAcrossUploads}
                </span>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Applied:</span>
                <span className="font-bold font-mono tabular-nums text-emerald-600">{totalAppliedAcrossUploads}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ingestion & Upload Console */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">
          {/* Target Month Selector */}
          <div className="lg:w-72 shrink-0 flex flex-col justify-between p-4 bg-slate-50/80 rounded-xl border border-slate-200/70">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Target Billing Month
                </label>
                {locked && (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                    Month Locked
                  </span>
                )}
              </div>
              <MonthPicker value={feeMonth} onChange={setFeeMonth} variant="input" />
            </div>

            <div className="mt-3 text-[11px] text-slate-500 leading-normal">
              {locked ? (
                <div className="flex items-start gap-1.5 text-amber-800 bg-amber-50/90 border border-amber-200 p-2 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                  <span>Books for {formatMonthName(feeMonth)} are locked. Unlock in Settings to apply collections.</span>
                </div>
              ) : (
                <span>Collections created will be credited against {formatMonthName(feeMonth)} student vouchers.</span>
              )}
            </div>
          </div>

          {/* Drag & Drop File Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void doUpload(e.dataTransfer.files?.[0]);
            }}
            className={`flex-1 rounded-xl p-5 border-2 border-dashed transition-all duration-200 flex flex-col sm:flex-row items-center justify-between gap-4 ${
              dragOver
                ? 'border-teal-500 bg-teal-50/50 shadow-sm ring-4 ring-teal-500/10'
                : 'border-slate-300 hover:border-slate-400 bg-white'
            }`}
          >
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  uploading
                    ? 'bg-teal-100 text-teal-700'
                    : dragOver
                    ? 'bg-teal-500 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">
                  {uploading
                    ? 'Processing & analyzing bank statement...'
                    : 'Upload Bank Statement Document'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Drag and drop statement file here, or browse local computer.
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                  <span className="font-semibold px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">PDF</span>
                  <span className="font-semibold px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">CSV</span>
                  <span className="font-semibold px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">XLSX</span>
                  <span className="font-semibold px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">TXT</span>
                  <span>· Bank Al Habib, HBL, Meezan, Allied, MCB, UBL &amp; Standard Formats</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
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
                style={
                  !locked
                    ? {
                        backgroundColor: preset.primaryColor,
                      }
                    : undefined
                }
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 whitespace-nowrap bg-teal-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing File...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    Choose Statement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {uploadError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-900 shadow-2xs">
            <div className="font-bold text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              {uploadError.message}
            </div>
            {uploadError.warnings.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-rose-200/60 pl-6">
                <span className="font-semibold text-rose-800 block mb-1">Parser Diagnostic Notes:</span>
                <ul className="list-disc space-y-0.5 text-rose-700">
                  {uploadError.warnings.slice(0, 6).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Workspace: Left Uploads Ledger + Right Reconciliation Workbench */}
      <div className="grid grid-cols-1 xl:grid-cols-[330px_1fr] gap-6 items-start">
        {/* Left Column: Uploaded Statements History */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Statement Batches</span>
            </div>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
              {uploads.length}
            </span>
          </div>

          {loadingUploads ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="animate-spin inline w-6 h-6 text-teal-600" />
              <p className="text-xs text-slate-500 mt-2 font-medium">Loading uploaded statements...</p>
            </div>
          ) : uploads.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-800">No statements uploaded</div>
              <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
                Upload a monthly bank credit statement above to begin automatic voucher matching.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {uploads.map((u) => {
                const openCount = u.counts.pending + u.counts.assigned;
                const isSelected = selectedId === u.id;
                const isFailed = u.parseStatus === 'failed';
                const isFullyPosted = openCount === 0 && u.counts.applied > 0;

                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('open');
                        setSelectedId(u.id);
                      }}
                      className={`w-full text-left p-4 transition-all duration-150 cursor-pointer relative group ${
                        isSelected
                          ? 'bg-teal-50/80 shadow-xs'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Active indicator bar */}
                      {isSelected && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1"
                          style={{ backgroundColor: preset.primaryColor }}
                        />
                      )}

                      <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                            isFailed
                              ? 'bg-rose-50 text-rose-600 border-rose-200'
                              : isFullyPosted
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : openCount > 0
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-sm font-bold text-slate-900 truncate" title={u.filename}>
                              {u.filename}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-700">{formatMonthName(u.feeMonth)}</span>
                            <span>·</span>
                            <span>{new Date(u.uploadedAt).toLocaleDateString()}</span>
                            {u.uploadedByName && (
                              <>
                                <span>·</span>
                                <span className="truncate max-w-[90px]">{u.uploadedByName}</span>
                              </>
                            )}
                          </div>

                          {isFailed ? (
                            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                              <AlertCircle className="w-3 h-3" />
                              Parsing Failed
                            </div>
                          ) : (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                              {openCount > 0 && (
                                <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  {openCount} to do
                                </span>
                              )}
                              {u.counts.applied > 0 && (
                                <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  {u.counts.applied} applied
                                </span>
                              )}
                              {u.duplicateCount > 0 && (
                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {u.duplicateCount} dup
                                </span>
                              )}
                              {openCount === 0 && u.counts.applied === 0 && u.counts.ignored === 0 && (
                                <span className="text-[10px] text-slate-400 italic">No new entries</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Column: Statement Reconciliation Workbench */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden min-h-[440px]">
          {!selected ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-4 shadow-2xs">
                <Landmark className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Statement Selected</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                Choose an uploaded statement from the ledger on the left, or upload a new bank statement to review deposits and match students.
              </p>
            </div>
          ) : selected.parseStatus === 'failed' ? (
            <div className="p-8">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-rose-900">Statement Parsing Error</h3>
                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                      The parser could not extract credit transaction rows from <b>{selected.filename}</b>. This typically occurs if the file format does not match recognized layout headers or if the PDF is image-based without selectable text.
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
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                        {formatMonthName(selected.feeMonth)}
                      </span>
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
                      disabled={assignedCount === 0}
                      onClick={() => void openApply()}
                      style={
                        assignedCount > 0
                          ? {
                              backgroundColor: preset.primaryColor,
                            }
                          : undefined
                      }
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition hover:opacity-90 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap bg-teal-700"
                      title="Press Ctrl+Enter / Cmd+Enter to open"
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
                      <span className="font-semibold text-slate-700">{selected.totalCredits}</span> total credit row{selected.totalCredits === 1 ? '' : 's'}
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
                        tab === id
                          ? 'bg-white text-teal-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
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
                          <th className="px-4 py-3 font-bold w-24">Date</th>
                          <th className="px-4 py-3 font-bold text-right w-32">Credit Amount</th>
                          <th className="px-4 py-3 font-bold min-w-[280px]">Bank Narration &amp; Ref</th>
                          <th className="px-4 py-3 font-bold min-w-[320px]">
                            {tab === 'open' ? 'Student Allocation' : tab === 'applied' ? 'Receipt & Allocation' : 'Ignore Reason'}
                          </th>
                          <th className="px-4 py-3 font-bold text-right w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {visible.map((tx, i) => {
                          const isFocused = focus === i;
                          const isAssigned = tx.status === 'assigned';
                          const isApplied = tx.status === 'applied';

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
                              {/* Date Column */}
                              <td className="px-4 py-3 text-slate-600 font-mono tabular-nums whitespace-nowrap">
                                <div className="font-semibold text-slate-800">{tx.date}</div>
                                <div className="text-[10px] text-slate-400">Row #{tx.rowIndex + 1}</div>
                              </td>

                              {/* Amount Column */}
                              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 whitespace-nowrap tabular-nums text-sm">
                                {formatCurrency(tx.amount)}
                              </td>

                              {/* Narration & Reference Column */}
                              <td className="px-4 py-3 text-slate-700 min-w-[280px]">
                                <div className="font-medium text-slate-800 line-clamp-2 leading-relaxed" title={tx.description}>
                                  {tx.description || <em className="text-slate-400">No narration provided</em>}
                                </div>
                                {tx.reference && (
                                  <div className="mt-1 flex items-center gap-1 text-[11px] font-mono text-slate-500">
                                    <Tag className="w-3 h-3 text-slate-400" />
                                    <span>Ref: {tx.reference}</span>
                                  </div>
                                )}
                              </td>

                              {/* Allocation / Target Column */}
                              <td className="px-4 py-3">
                                {tab === 'open' && (
                                  <AssignCell
                                    tx={tx}
                                    focused={isFocused}
                                    suggestions={suggestions[tx.id] || []}
                                    onAccept={(s) => void assign(tx, s.studentId)}
                                    onOpen={() => openPicker(tx)}
                                    preset={preset}
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

                              {/* Actions Column */}
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                {tab === 'open' && (
                                  <div className="flex items-center justify-end gap-1">
                                    {isAssigned && (
                                      <button
                                        type="button"
                                        title="Clear student assignment (U)"
                                        onClick={() => void unassign(tx)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                      >
                                        <Undo2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      title="Exclude (not a fee payment) (I)"
                                      onClick={() => setIgnoreTx(tx)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}

                                {tab === 'ignored' && (
                                  <button
                                    type="button"
                                    onClick={() => void simple(bsApi.unignore, tx)}
                                    className="text-xs font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer"
                                  >
                                    Restore to Todo
                                  </button>
                                )}

                                {tab === 'applied' && tx.collectionMissing && (
                                  <button
                                    type="button"
                                    onClick={() => void simple(bsApi.reopen, tx)}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
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
      </div>

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
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                    {formatCurrency(pickerTx.amount)}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">
                    Credit on {pickerTx.date}
                  </div>
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
                              <span
                                className={`text-xs font-mono font-bold ${
                                  s.voucher.outstanding > 0 ? 'text-amber-700' : 'text-slate-600'
                                }`}
                              >
                                {s.voucher.outstanding > 0
                                  ? `Due ${formatCurrency(s.voucher.outstanding)}`
                                  : s.voucher.status}
                              </span>
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
                          <th className="px-3.5 py-2.5 font-bold text-right">Voucher Due</th>
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
                            <td className="px-3.5 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                              {r.outstanding === null ? '—' : formatCurrency(r.outstanding)}
                            </td>
                            <td className="px-3.5 py-2.5">
                              {r.ready ? (
                                r.excess > 0 ? (
                                  <span className="text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                                    Clears due; {formatCurrency(r.excess)} advance credit
                                  </span>
                                ) : (
                                  <span className="text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                                    {r.amount < (r.outstanding || 0) ? 'Partial Payment' : 'Clears Voucher Full'}
                                  </span>
                                )
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
                style={
                  preview && preview.readyCount > 0
                    ? { backgroundColor: preset.primaryColor }
                    : undefined
                }
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
  onAccept: (s: Suggestion) => void;
  onOpen: () => void;
  preset: any;
}

const AssignCell: React.FC<AssignCellProps> = ({
  tx,
  focused,
  suggestions,
  onAccept,
  onOpen,
  preset,
}) => {
  if (tx.status === 'assigned') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-left cursor-pointer group flex items-center gap-2.5 p-1.5 rounded-xl bg-teal-50/80 hover:bg-teal-100/70 border border-teal-200 transition"
        title="Click or press Enter to change student assignment"
      >
        <StudentAvatar name={tx.studentName || 'Student'} size="xs" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-teal-900 text-xs truncate">{tx.studentName}</span>
            <span className="font-mono text-[10px] text-teal-700 font-semibold">{tx.studentRegNo}</span>
          </div>
          {tx.studentClass && <div className="text-[10px] text-teal-700/80">{tx.studentClass}</div>}
        </div>
        <span className="text-[10px] font-bold text-teal-700 opacity-60 group-hover:opacity-100 ml-auto pr-1">
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/70 px-2.5 py-1 text-xs cursor-pointer shadow-2xs transition"
        >
          {focused && (
            <kbd className="text-[9px] font-bold font-mono bg-slate-100 border border-slate-200 text-slate-700 rounded px-1">
              {i + 1}
            </kbd>
          )}
          <span className="font-semibold text-slate-800">{s.name}</span>
          <span className="font-mono text-slate-400 text-[11px]">{s.regNo}</span>
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
