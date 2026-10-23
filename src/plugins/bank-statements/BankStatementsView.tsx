import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  RotateCcw,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { MonthPicker } from '../../components/MonthPicker';
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
  const { activeMonth, isMonthLocked, showToast, refreshFromServer } = useApp();

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
      setUploadError({ message: `Fee books for ${formatMonthName(feeMonth)} are locked. Ask an Admin to unlock the month first.`, warnings: [] });
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
          ? `${r.upload.newCount} new credit${r.upload.newCount === 1 ? '' : 's'} ready to assign` +
              (r.upload.duplicateCount ? ` (${r.upload.duplicateCount} already known)` : '')
          : 'No new transactions — everything in this statement was already loaded.',
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
      // Progressive elimination: the assigned student sinks in everyone else's suggestions.
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
      // Move on to the next row that still needs a student.
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
    showToast(`Applied ${r.result.appliedCount} payment(s) — ${formatCurrency(r.result.totalAmount)} (${r.result.collectionNo})`, 'success', 6000);
    await refreshFromServer();
    await reloadAll();
  };

  useEscapeKey(() => !applying && setApplyOpen(false), applyOpen);

  // ------------------------------------------------------------------ keyboard
  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.description} ${r.reference || ''} ${r.studentName || ''} ${r.studentRegNo || ''} ${r.amount}`.toLowerCase().includes(q));
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

  // ------------------------------------------------------------------ render helpers
  const locked = isMonthLocked(feeMonth);
  const assignedCount = selected?.counts.assigned || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
            <Landmark size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Bank Statements</h1>
            <p className="text-xs text-slate-500">Load a bank statement, match each deposit to a student, then post them all as normal fee collections.</p>
          </div>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Fee month</label>
            <MonthPicker value={feeMonth} onChange={setFeeMonth} variant="input" />
            {locked && (
              <p className="mt-1.5 text-xs font-semibold text-amber-700 flex items-center gap-1">
                <AlertTriangle size={13} /> This month is locked — payments cannot be recorded in it.
              </p>
            )}
          </div>
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
            className={`flex-1 border-2 border-dashed rounded-xl px-4 py-3 flex items-center gap-3 transition ${
              dragOver ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            {uploading ? <Loader2 className="animate-spin text-teal-700" size={20} /> : <Upload className="text-slate-500" size={20} />}
            <div className="flex-1 text-sm text-slate-600">
              {uploading ? 'Reading the statement…' : 'Drop the bank statement here (PDF, CSV or Excel), or'}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.csv,.xlsx,.txt" className="hidden" onChange={(e) => void doUpload(e.target.files?.[0])} />
            <button
              type="button"
              disabled={uploading || locked}
              onClick={() => fileRef.current?.click()}
              className="bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer disabled:cursor-not-allowed"
            >
              Choose file
            </button>
          </div>
        </div>
        {uploadError && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={15} /> {uploadError.message}
            </div>
            {uploadError.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{uploadError.warnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Uploads list */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">Uploaded statements</div>
          {loadingUploads ? (
            <div className="p-6 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>
          ) : uploads.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">No statements yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {uploads.map((u) => {
                const open = u.counts.pending + u.counts.assigned;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('open');
                        setSelectedId(u.id);
                      }}
                      className={`w-full text-left px-4 py-3 cursor-pointer hover:bg-slate-50 ${selectedId === u.id ? 'bg-teal-50/70' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText size={16} className={u.parseStatus === 'failed' ? 'text-red-500 mt-0.5' : 'text-slate-400 mt-0.5'} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-800 truncate">{u.filename}</div>
                          <div className="text-[11px] text-slate-500">
                            {formatMonthName(u.feeMonth)} · {new Date(u.uploadedAt).toLocaleDateString()}
                            {u.uploadedByName ? ` · ${u.uploadedByName}` : ''}
                          </div>
                          {u.parseStatus === 'failed' ? (
                            <div className="text-[11px] text-red-600 mt-0.5">Could not be read</div>
                          ) : (
                            <div className="text-[11px] mt-0.5 flex flex-wrap gap-x-2">
                              {open > 0 && <span className="font-semibold text-amber-700">{open} to do</span>}
                              {u.counts.applied > 0 && <span className="text-emerald-700">{u.counts.applied} applied</span>}
                              {u.duplicateCount > 0 && <span className="text-slate-400">{u.duplicateCount} known</span>}
                              {open === 0 && u.counts.applied === 0 && u.counts.ignored === 0 && <span className="text-slate-400">nothing new</span>}
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

        {/* Workspace */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden min-h-[320px]">
          {!selected ? (
            <div className="p-12 text-center text-slate-500 text-sm">Choose a statement on the left, or upload a new one.</div>
          ) : selected.parseStatus === 'failed' ? (
            <div className="p-8 text-sm text-red-700">
              <div className="font-bold mb-1">This file could not be read</div>
              {selected.parseError}
              <div className="mt-3"><a className="text-teal-700 font-semibold underline" href={bsApi.fileUrl(selected.id)}>Download the original file</a></div>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{selected.filename}</div>
                  <div className="text-xs text-slate-500">
                    Fee month {formatMonthName(selected.feeMonth)}
                    {selected.periodFrom ? ` · statement ${selected.periodFrom} → ${selected.periodTo}` : ''}
                    {selected.accountNumber ? ` · A/C ${selected.accountNumber}` : ''}
                    {' · '}
                    <a className="text-teal-700 underline" href={bsApi.fileUrl(selected.id)}>original file</a>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={assignedCount === 0}
                  onClick={() => void openApply()}
                  className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer disabled:cursor-not-allowed"
                  title="Ctrl+Enter"
                >
                  <Check size={15} /> Review &amp; apply {assignedCount > 0 ? `${assignedCount} assigned` : ''}
                </button>
              </div>

              {selected.warnings.length > 0 && (
                <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1"><AlertTriangle size={14} /> Check these before you continue</div>
                  <ul className="list-disc pl-5 space-y-0.5">{selected.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul>
                  {selected.warnings.length > 8 && <div className="mt-1">…and {selected.warnings.length - 8} more.</div>}
                </div>
              )}

              <div className="px-5 pt-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  {([
                    ['open', `To do (${selected.counts.pending + selected.counts.assigned})`],
                    ['applied', `Applied (${selected.counts.applied})`],
                    ['ignored', `Ignored (${selected.counts.ignored})`],
                  ] as Array<[Tab, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`px-3.5 py-1.5 rounded-lg font-bold cursor-pointer ${tab === id ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Filter rows…"
                    className="pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500/30 w-48"
                  />
                </div>
              </div>

              {tab === 'open' && (
                <div className="px-5 pt-2 text-[11px] text-slate-400">
                  Keys: ↑ ↓ move · Enter search student · 1 2 3 accept a suggestion · U clear · I ignore · Ctrl+Enter apply
                </div>
              )}

              <div className="p-5 pt-3">
                {loadingRows ? (
                  <div className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline" size={20} /></div>
                ) : visible.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-500">
                    {tab === 'open' ? (
                      <span className="inline-flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle2 size={18} /> Nothing left to do in this statement.</span>
                    ) : (
                      'Nothing here.'
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2 w-24">Date</th>
                          <th className="text-right px-3 py-2 w-28">Amount</th>
                          <th className="text-left px-3 py-2 min-w-[260px]">Bank narration</th>
                          <th className="text-left px-3 py-2 min-w-[300px]">{tab === 'open' ? 'Student' : tab === 'applied' ? 'Posted to' : 'Reason'}</th>
                          <th className="px-3 py-2 w-28" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((tx, i) => (
                          <tr
                            key={tx.id}
                            id={`bs-row-${i}`}
                            onClick={() => setFocus(i)}
                            className={`${focus === i ? 'bg-teal-50/60 outline outline-2 -outline-offset-2 outline-teal-400/60' : 'hover:bg-slate-50/70'} ${busyTx === tx.id ? 'opacity-60' : ''}`}
                          >
                            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{tx.date}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(tx.amount)}</td>
                            <td className="px-3 py-2.5 text-slate-700 min-w-[260px]">
                              <div className="line-clamp-2" title={tx.description}>{tx.description || <em className="text-slate-400">no narration</em>}</div>
                              {tx.reference && <div className="text-[11px] text-slate-400">Ref {tx.reference}</div>}
                            </td>
                            <td className="px-3 py-2.5">
                              {tab === 'open' && (
                                <AssignCell
                                  tx={tx}
                                  focused={focus === i}
                                  suggestions={suggestions[tx.id] || []}
                                  onAccept={(s) => void assign(tx, s.studentId)}
                                  onOpen={() => openPicker(tx)}
                                />
                              )}
                              {tab === 'applied' && (
                                <div className="text-xs">
                                  <div className="font-semibold text-slate-800">{tx.studentName} <span className="font-normal text-slate-500">({tx.studentRegNo})</span></div>
                                  {tx.collectionMissing ? (
                                    <div className="text-amber-700 font-semibold">Collection was reversed — can be re-applied</div>
                                  ) : (
                                    <div className="text-emerald-700">{tx.collectionNo} · {tx.appliedByName}</div>
                                  )}
                                </div>
                              )}
                              {tab === 'ignored' && <span className="text-xs text-slate-500">{tx.ignoreReason || '—'}</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              {tab === 'open' && (
                                <div className="flex justify-end gap-1">
                                  {tx.status === 'assigned' && (
                                    <button type="button" title="Clear assignment (U)" onClick={() => void unassign(tx)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"><Undo2 size={15} /></button>
                                  )}
                                  <button type="button" title="Not a fee payment — ignore (I)" onClick={() => setIgnoreTx(tx)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"><Ban size={15} /></button>
                                </div>
                              )}
                              {tab === 'ignored' && (
                                <button type="button" onClick={() => void simple(bsApi.unignore, tx)} className="text-xs font-bold text-teal-700 hover:underline cursor-pointer">Restore</button>
                              )}
                              {tab === 'applied' && tx.collectionMissing && (
                                <button type="button" onClick={() => void simple(bsApi.reopen, tx)} className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline cursor-pointer"><RotateCcw size={13} /> Reopen</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Student picker drawer */}
      {pickerTx && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onMouseDown={(e) => e.target === e.currentTarget && setPickerTx(null)}>
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Assign a student</div>
                  <div className="text-lg font-bold text-slate-900">{formatCurrency(pickerTx.amount)} <span className="text-sm font-normal text-slate-500">on {pickerTx.date}</span></div>
                  <div className="text-xs text-slate-600 mt-1 line-clamp-3">{pickerTx.description}</div>
                </div>
                <button type="button" onClick={() => setPickerTx(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><X size={18} /></button>
              </div>
              <div className="relative mt-4">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                  placeholder="Name, reg no., father's name, phone…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {pickerLoading && pickerResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>
              ) : pickerResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">{pickerQ ? 'No student matches.' : 'No suggestions — type to search.'}</div>
              ) : (
                <ul>
                  {!pickerQ && <li className="px-5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Suggested</li>}
                  {pickerResults.map((s, i) => (
                    <li key={s.studentId}>
                      <button
                        type="button"
                        onMouseEnter={() => setPickerActive(i)}
                        onClick={() => void choose(s)}
                        className={`w-full text-left px-5 py-3 cursor-pointer border-b border-slate-50 ${pickerActive === i ? 'bg-teal-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900 text-sm">{s.name} <span className="font-normal text-slate-500">· {s.regNo}</span></div>
                          {s.voucher && <div className="text-xs font-bold text-slate-700">{s.voucher.outstanding > 0 ? `Due ${formatCurrency(s.voucher.outstanding)}` : s.voucher.status}</div>}
                        </div>
                        <div className="text-[11px] text-slate-500">{[s.className, s.fatherName && `S/O ${s.fatherName}`, s.status !== 'Active' && s.status].filter(Boolean).join(' · ')}</div>
                        {s.reasons.length > 0 && <div className="text-[11px] text-teal-700 mt-0.5">{s.reasons.join(' · ')}</div>}
                        {s.voucher && !s.voucher.payable && <div className="text-[11px] text-red-600 mt-0.5">{s.voucher.blockedReason}</div>}
                        {!s.voucher && <div className="text-[11px] text-amber-700 mt-0.5">No voucher this month</div>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-400">↑ ↓ choose · Enter assign · Esc close</div>
          </div>
        </div>
      )}

      {/* Ignore prompt */}
      {ignoreTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setIgnoreTx(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="font-bold text-slate-900">Not a fee payment?</div>
            <p className="text-xs text-slate-500 mt-1">{formatCurrency(ignoreTx.amount)} · {ignoreTx.description.slice(0, 90)}</p>
            <input
              autoFocus
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmIgnore();
                if (e.key === 'Escape') setIgnoreTx(null);
              }}
              placeholder="Reason (optional) — e.g. bank refund"
              className="mt-3 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setIgnoreTx(null)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
              <button type="button" onClick={() => void confirmIgnore()} className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">Ignore</button>
            </div>
          </div>
        </div>
      )}

      {/* Apply dialog */}
      {applyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">Apply assigned payments</div>
                <p className="text-xs text-slate-500">Each one is recorded exactly like a normal collection against the student's {preview ? formatMonthName(preview.feeMonth) : ''} voucher.</p>
              </div>
              <button type="button" disabled={applying} onClick={() => setApplyOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {previewLoading && <div className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline" size={20} /></div>}
              {applyError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{applyError}</div>}
              {preview && (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2">Student</th>
                          <th className="text-right px-3 py-2">Paid</th>
                          <th className="text-right px-3 py-2">Voucher due</th>
                          <th className="text-left px-3 py-2">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.rows.map((r) => (
                          <tr key={r.txId} className={r.ready ? '' : 'bg-red-50/50'}>
                            <td className="px-3 py-2"><div className="font-semibold text-slate-800">{r.studentName}</div><div className="text-slate-400">{r.studentRegNo} · {r.date}</div></td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(r.amount)}</td>
                            <td className="px-3 py-2 text-right">{r.outstanding === null ? '—' : formatCurrency(r.outstanding)}</td>
                            <td className="px-3 py-2">
                              {r.ready ? (
                                r.excess > 0 ? <span className="text-amber-700 font-semibold">Pays in full; {formatCurrency(r.excess)} kept as advance</span> : <span className="text-emerald-700 font-semibold">{r.amount < (r.outstanding || 0) ? 'Partial payment' : 'Clears the voucher'}</span>
                              ) : (
                                <span className="text-red-700">Will be skipped: {r.blockedReason}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-700">
                      <b>{preview.readyCount}</b> payment(s) totalling <b>{formatCurrency(preview.readyTotal)}</b>
                      {preview.blockedCount > 0 && <span className="text-red-700"> · {preview.blockedCount} skipped</span>}
                    </div>
                    <label className="text-xs text-slate-600 flex items-center gap-2">
                      Payment mode
                      <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentModeChoice)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                        <option value="auto">Detect from narration</option>
                        <option value="BankDeposit">Bank Deposit</option>
                        <option value="OnlineTransfer">Online Transfer</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button type="button" disabled={applying} onClick={() => setApplyOpen(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
              <button
                type="button"
                disabled={applying || !preview || preview.readyCount === 0}
                onClick={() => void doApply()}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {applying && <Loader2 size={14} className="animate-spin" />} Apply {preview?.readyCount || ''} payment(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AssignCell: React.FC<{
  tx: StatementTxRow;
  focused: boolean;
  suggestions: Suggestion[];
  onAccept: (s: Suggestion) => void;
  onOpen: () => void;
}> = ({ tx, focused, suggestions, onAccept, onOpen }) => {
  if (tx.status === 'assigned') {
    return (
      <button type="button" onClick={onOpen} className="text-left cursor-pointer group" title="Change student (Enter)">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1">
          <Check size={13} className="text-emerald-700" />
          <span className="font-semibold text-emerald-900 text-xs">{tx.studentName}</span>
          <span className="text-emerald-700 text-[11px]">{tx.studentRegNo}</span>
        </div>
        {tx.studentClass && <span className="ml-2 text-[11px] text-slate-400">{tx.studentClass}</span>}
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:border-teal-400 hover:bg-teal-50 px-2 py-1 text-xs cursor-pointer"
        >
          {focused && <kbd className="text-[10px] font-bold bg-slate-100 rounded px-1">{i + 1}</kbd>}
          <span className="font-semibold text-slate-800">{s.name}</span>
          <span className="text-slate-400">{s.regNo}</span>
        </button>
      ))}
      <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 cursor-pointer">
        <Search size={12} /> {suggestions.length ? 'Other…' : 'Find student'}
      </button>
    </div>
  );
};
