import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { DeleteInstitutionModal } from './settings/DeleteInstitutionModal';
import { DataCleanupOptions } from '../types';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Bus,
  Check,
  CheckCircle2,
  CreditCard,
  Database,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Info,
  Lock,
  MapPin,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface TableSelectionState {
  students: boolean;
  vouchers: boolean;
  collections: boolean;
  classes: boolean;
  families: boolean;
  templates: boolean;
  transportAssignments: boolean;
  transportStops: boolean;
  transportBuses: boolean;
  bankAccounts: boolean;
  users: boolean;
}

const INITIAL_SELECTION: TableSelectionState = {
  students: false,
  vouchers: false,
  collections: false,
  classes: false,
  families: false,
  templates: false,
  transportAssignments: false,
  transportStops: false,
  transportBuses: false,
  bankAccounts: false,
  users: false,
};

export interface DataCleanupViewProps {
  hideHeader?: boolean;
}

export const DataCleanupView: React.FC<DataCleanupViewProps> = ({ hideHeader = false }) => {
  const {
    students,
    classes,
    families,
    vouchers,
    collections,
    transactions,
    templates,
    buses,
    stops,
    transportAssignments,
    bankAccounts,
    users,
    currentUser,
    hasPermission,
    cleanupDatabaseTables,
    showToast,
    historyFrom,
    ensureHistoryLoaded,
  } = useApp();

  // Record counts must reflect everything in the database, not just the working set.
  useEffect(() => {
    if (historyFrom) void ensureHistoryLoaded('0000-01');
  }, [historyFrom, ensureHistoryLoaded]);


  const [selectedTables, setSelectedTables] = useState<TableSelectionState>(INITIAL_SELECTION);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [hasAcknowledgedRisk, setHasAcknowledgedRisk] = useState<boolean>(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [showDeleteInstitutionModal, setShowDeleteInstitutionModal] = useState<boolean>(false);

  useEscapeKey(() => {
    if (showConfirmModal) {
      setShowConfirmModal(false);
      setHasAcknowledgedRisk(false);
      setConfirmationPhrase('');
    }
  }, showConfirmModal && !isExecuting, 1);

  // Security Gate: Check if user has admin privileges. Deliberately checks
  // the dedicated 'system.cleanup' permission (not 'settings.manage', which
  // is a much lower-stakes permission and must never be treated as
  // equivalent to admin access for a destructive, irreversible operation
  // like this one).
  const isAdmin = currentUser?.role === 'Admin' || hasPermission('system.cleanup');

  // Secondary users count (excluding self)
  const secondaryUsersCount = useMemo(() => {
    return users.filter((u) => u.id !== currentUser.id).length;
  }, [users, currentUser]);

  // Count distinct fee-template scopes (1 global baseline set + per-class + per-student
  // override sets), rather than raw per-head rows. This reflects the "how many template
  // groups exist" intent: 1 with defaults, N+1 once N students/classes are customized.
  const templateScopeCount = useMemo(() => {
    const hasGlobal = templates.some((t) => !t.studentId && !t.classId);
    const classScopes = new Set(
      templates.filter((t) => t.classId && !t.studentId).map((t) => t.classId)
    );
    const studentScopes = new Set(templates.filter((t) => t.studentId).map((t) => t.studentId));
    return (hasGlobal ? 1 : 0) + classScopes.size + studentScopes.size;
  }, [templates]);

  // Table Configuration Matrix
  const tableCards = useMemo(() => [
    {
      key: 'students' as keyof TableSelectionState,
      name: 'Students & Enrollment Records',
      category: 'Academic Roster',
      count: students.length,
      unit: 'students',
      icon: <GraduationCap className="w-5 h-5 text-teal-600" />,
      description: 'Removes all enrolled student profiles, admission numbers, discounts, and fee particulars overrides.',
      cascadingNote: 'Detaches student memberships from Families and resets transport seat assignments.',
      risk: 'Critical' as const,
    },
    {
      key: 'vouchers' as keyof TableSelectionState,
      name: 'Fee Vouchers & Invoices',
      category: 'Financial Ledger',
      count: vouchers.length,
      unit: 'vouchers',
      icon: <FileText className="w-5 h-5 text-blue-600" />,
      description: 'Erases all generated monthly fee vouchers, late fees, line items, and billing history.',
      cascadingNote: 'Students remain enrolled with blank ledger balances. Collections become unlinked.',
      risk: 'High' as const,
    },
    {
      key: 'collections' as keyof TableSelectionState,
      name: 'Payment Collections & Transactions',
      category: 'Financial Ledger',
      count: collections.length + transactions.length,
      unit: 'records',
      icon: <Receipt className="w-5 h-5 text-emerald-600" />,
      description: 'Purges all collection receipts, cash/bank transaction records, and paid balance receipts.',
      cascadingNote: 'If Vouchers are kept, all paid vouchers will revert back to Unpaid status.',
      risk: 'High' as const,
    },
    {
      key: 'classes' as keyof TableSelectionState,
      name: 'Classes & Sections',
      category: 'Academic Roster',
      count: classes.length,
      unit: 'classes',
      icon: <Building2 className="w-5 h-5 text-indigo-600" />,
      description: 'Removes class grade structures, section names, and default class tuition fee amounts.',
      cascadingNote: 'If Students are kept, their assigned class references will become unassigned.',
      risk: 'Critical' as const,
    },
    {
      key: 'families' as keyof TableSelectionState,
      name: 'Families & Guardian Links',
      category: 'Academic Roster',
      count: families.length,
      unit: 'families',
      icon: <Users className="w-5 h-5 text-purple-600" />,
      description: 'Removes family groupings, guardian contacts, and multi-child sibling associations.',
      cascadingNote: 'Unlinks familyId on all remaining student records without deleting the students.',
      risk: 'Moderate' as const,
    },
    {
      key: 'templates' as keyof TableSelectionState,
      name: 'Fee Templates & Overrides',
      category: 'Financial Ledger',
      count: templateScopeCount,
      unit: 'template set',
      icon: <FileSpreadsheet className="w-5 h-5 text-amber-600" />,
      description: 'Resets fee particular labels and amounts back to standard global 9-item baseline and wipes student/class overrides.',
      cascadingNote: 'Subsequent voucher generation will strictly use clean default global rates.',
      risk: 'Moderate' as const,
    },
    {
      key: 'transportAssignments' as keyof TableSelectionState,
      name: 'Student Transport Assignments',
      category: 'Transport & Fleet',
      count: transportAssignments.length,
      unit: 'assignments',
      icon: <Bus className="w-5 h-5 text-teal-600" />,
      description: 'Erases all student route seat allocations, pickup stop selections, trip types, and transport discount overrides.',
      cascadingNote: 'Preserves bus fleet vehicles and stop fare rates for fresh re-enrollments. Halts transport charges on future fee vouchers.',
      risk: 'Moderate' as const,
    },
    {
      key: 'transportStops' as keyof TableSelectionState,
      name: 'Bus Stops & Monthly Fare Rates',
      category: 'Transport & Fleet',
      count: stops.length,
      unit: 'stops',
      icon: <MapPin className="w-5 h-5 text-rose-500" />,
      description: 'Purges all designated pickup points, landmarks, areas, and monthly transport fare pricing tiers.',
      cascadingNote: 'Student assignments linked to deleted stops will lose their base fare calculation reference.',
      risk: 'Moderate' as const,
    },
    {
      key: 'transportBuses' as keyof TableSelectionState,
      name: 'Buses Fleet Directory',
      category: 'Transport & Fleet',
      count: buses.length,
      unit: 'buses',
      icon: <Bus className="w-5 h-5 text-amber-600" />,
      description: 'Clears registered school buses, vehicle models, registration plates, routes, and driver contact records.',
      cascadingNote: 'Vehicle fleet records are removed. Student assignments will be unlinked from deleted bus vehicles.',
      risk: 'Moderate' as const,
    },
    {
      key: 'bankAccounts' as keyof TableSelectionState,
      name: 'Bank Accounts & Deposit Details',
      category: 'Infrastructure',
      count: bankAccounts.length,
      unit: 'accounts',
      icon: <CreditCard className="w-5 h-5 text-sky-600" />,
      description: 'Clears all institute bank account titles, IBAN numbers, and branch codes.',
      cascadingNote: 'Voucher payment deposit slip details will remain empty until new bank accounts are added.',
      risk: 'Moderate' as const,
    },
    {
      key: 'users' as keyof TableSelectionState,
      name: 'Secondary Personnel & Staff',
      category: 'Security & Auth',
      count: secondaryUsersCount,
      unit: 'operators',
      icon: <Users className="w-5 h-5 text-rose-600" />,
      description: 'Removes all secondary accountant and viewer user accounts.',
      cascadingNote: `Protected: Your active session account (${currentUser.name}) is preserved.`,
      risk: 'High' as const,
    },
  ], [
    students.length,
    vouchers.length,
    collections.length,
    transactions.length,
    classes.length,
    families.length,
    templates.length,
    transportAssignments.length,
    stops.length,
    buses.length,
    bankAccounts.length,
    secondaryUsersCount,
    currentUser.name,
  ]);

  // Selected tables count & selected record count
  const { selectedCount, totalRecordsToClear } = useMemo(() => {
    let count = 0;
    let records = 0;
    tableCards.forEach((t) => {
      if (selectedTables[t.key]) {
        count++;
        records += t.count;
      }
    });
    return { selectedCount: count, totalRecordsToClear: records };
  }, [selectedTables, tableCards]);

  // Cascading Integrity Warnings
  const integrityWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (selectedTables.students && !selectedTables.vouchers && vouchers.length > 0) {
      warnings.push('Deleting Students while keeping Vouchers will create orphaned fee vouchers without student profiles.');
    }
    if (selectedTables.classes && !selectedTables.students && students.length > 0) {
      warnings.push('Deleting Classes while retaining Students will leave student records with invalid or missing class references.');
    }
    if (selectedTables.collections && !selectedTables.vouchers && vouchers.length > 0) {
      warnings.push('Purging Collections while keeping Vouchers will revert all previously paid vouchers back to Unpaid status.');
    }
    if (selectedTables.families && !selectedTables.students && students.length > 0) {
      warnings.push('Deleting Families will remove sibling links from remaining students.');
    }
    if (selectedTables.transportAssignments && !selectedTables.vouchers && vouchers.length > 0) {
      warnings.push('Clearing Student Transport Assignments will stop future transport fees, but existing vouchers will retain historical transport charges.');
    }
    if (selectedTables.transportStops && !selectedTables.transportAssignments && transportAssignments.length > 0) {
      warnings.push('Deleting Bus Stops while keeping Student Assignments will leave transport seat allocations without valid stop and fare references.');
    }
    if (selectedTables.transportBuses && !selectedTables.transportAssignments && transportAssignments.length > 0) {
      warnings.push('Deleting Buses Fleet while keeping Student Assignments will detach students from their assigned transport vehicles.');
    }

    return warnings;
  }, [selectedTables, vouchers.length, students.length, transportAssignments.length]);

  // Presets Handlers
  const handleSelectPreset = (preset: 'transactional' | 'academic' | 'transport' | 'all' | 'none') => {
    switch (preset) {
      case 'transactional':
        setSelectedTables({
          ...INITIAL_SELECTION,
          vouchers: true,
          collections: true,
        });
        break;
      case 'academic':
        setSelectedTables({
          ...INITIAL_SELECTION,
          students: true,
          classes: true,
          families: true,
          transportAssignments: true,
        });
        break;
      case 'transport':
        setSelectedTables({
          ...INITIAL_SELECTION,
          transportAssignments: true,
          transportStops: true,
          transportBuses: true,
        });
        break;
      case 'all':
        setSelectedTables({
          students: true,
          vouchers: true,
          collections: true,
          classes: true,
          families: true,
          templates: true,
          transportAssignments: true,
          transportStops: true,
          transportBuses: true,
          bankAccounts: true,
          users: true,
        });
        break;
      case 'none':
        setSelectedTables(INITIAL_SELECTION);
        break;
    }
  };

  const handleToggleTable = (key: keyof TableSelectionState) => {
    setSelectedTables((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Execute Database Reset
  const handleExecuteReset = async () => {
    if (!hasAcknowledgedRisk || confirmationPhrase.trim().toUpperCase() !== 'RESET DATA') {
      return;
    }

    setIsExecuting(true);

    try {
      const options: DataCleanupOptions = { ...selectedTables };
      const result = await cleanupDatabaseTables(options);

      if (result.success) {
        showToast(
          `Database Cleanup Successful! Cleared ${result.recordsClearedCount} records across ${result.clearedTables.length} tables.`,
          'success',
          5000
        );
        setShowConfirmModal(false);
        setSelectedTables(INITIAL_SELECTION);
        setHasAcknowledgedRisk(false);
        setConfirmationPhrase('');
      } else {
        showToast(result.error || 'Database reset encountered an error. Please try again.', 'error');
      }
    } catch {
      showToast('Unexpected error during database reset.', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  // Security Check Guard
  if (!isAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center max-w-xl mx-auto my-8 space-y-4">
        <div className="w-14 h-14 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Administrator Access Required</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          The Selection-Based Database Cleanup & Table Reset utility requires Super Administrator authentication permissions. Please sign in with an Admin operator account to manage database purges.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      {!hideHeader && (
        <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 p-6 rounded-2xl text-white shadow-md border border-rose-900/40 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-full bg-rose-600/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 rounded-full text-rose-300 text-[11px] font-bold">
                <ShieldAlert className="w-3.5 h-3.5" />
                Administrative Data Maintenance Utility
              </div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-rose-400" />
                Selection-Based Database Reset & Table Purge
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Quickly reset or purge individual data tables for testing, staging, or academic year renewal.
                Select specific collections below to execute a targeted reset with full cascading integrity awareness.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick-Select Presets Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Quick Presets:
          </span>
          <button
            type="button"
            onClick={() => handleSelectPreset('transactional')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Financial & Transactions
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('academic')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Academic Roster
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('transport')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Transport System
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('all')}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition cursor-pointer"
          >
            Select All (Full Wipe)
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => handleSelectPreset('none')}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Deselect All
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="font-semibold text-slate-600">
            Selected:{' '}
            <strong className="text-slate-900 font-bold">
              {selectedCount} of {tableCards.length}
            </strong>{' '}
            tables
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="font-semibold text-slate-600">
            Records to erase:{' '}
            <strong className="text-rose-600 font-bold">{totalRecordsToClear}</strong>
          </div>
        </div>
      </div>

      {/* Main Grid: Selection Cards & Live Summary Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Table Selection Cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tableCards.map((table) => {
              const isSelected = selectedTables[table.key];
              return (
                <div
                  key={table.key}
                  onClick={() => handleToggleTable(table.key)}
                  className={`p-4 rounded-2xl border-2 transition cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-rose-500 bg-rose-50/20 shadow-md ring-1 ring-rose-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 shadow-2xs'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-slate-100 rounded-xl shrink-0">{table.icon}</div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs leading-snug">{table.name}</h4>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            {table.category}
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer mt-0.5"
                      />
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">{table.description}</p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">Current:</span>
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                          table.count > 0 ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        {table.count} {table.unit}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        table.risk === 'Critical'
                          ? 'bg-rose-100 text-rose-800'
                          : table.risk === 'High'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {table.risk} Risk
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Live Impact & Cascading Summary */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 sticky top-6">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Impact & Confirmation Summary
            </h3>

            {/* Selected Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Tables Selected</span>
                <span className="text-lg font-bold text-slate-900">{selectedCount}</span>
                <span className="text-[10px] text-slate-500 font-medium block">of {tableCards.length} tables</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                <span className="text-[10px] text-rose-700 font-bold uppercase block">Records to Erase</span>
                <span className="text-lg font-bold text-rose-700">{totalRecordsToClear}</span>
                <span className="text-[10px] text-rose-600 font-medium block">permanent purge</span>
              </div>
            </div>

            {/* Selected Tables Checklist */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Tables Marked for Cleanup:</span>
              {selectedCount === 0 ? (
                <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-500 italic">
                  No tables selected yet. Choose tables from the left or use presets.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {tableCards
                    .filter((t) => selectedTables[t.key])
                    .map((t) => (
                      <div
                        key={t.key}
                        className="flex items-center justify-between text-xs p-2 bg-rose-50/50 rounded-lg border border-rose-100"
                      >
                        <span className="font-medium text-slate-900 truncate pr-2">{t.name}</span>
                        <span className="font-mono text-[11px] font-bold text-rose-700 shrink-0">
                          {t.count} {t.unit}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Cascading Integrity Warnings */}
            {integrityWarnings.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2 text-amber-900">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  Cascading Integrity Notice
                </div>
                <ul className="text-[11px] space-y-1 list-disc pl-4 leading-relaxed font-medium">
                  {integrityWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Responsibility Disclaimer */}
            <div className="p-3 bg-slate-100 rounded-xl text-[11px] text-slate-600 leading-relaxed">
              <strong className="text-slate-800 block mb-0.5">Admin Responsibility:</strong>
              The user understands and is responsible for cascading data integrity and orphaned references after executing a partial table reset.
            </div>

            {/* Action Button */}
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => {
                setHasAcknowledgedRisk(false);
                setConfirmationPhrase('');
                setShowConfirmModal(true);
              }}
              className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Proceed to Reset Selected Tables ({selectedCount})
            </button>

            {/* Comprehensive Institution Deletion Section */}
            <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-200 text-xs space-y-2.5 mt-4">
              <div className="flex items-center gap-2 text-rose-950 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Permanent Institution Deletion</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Looking to completely remove this entire institution? This is more comprehensive than table resets: it permanently deletes the institution profile, admin credentials, users, and all server data.
              </p>
              <button
                type="button"
                id="btn-cleanup-open-delete-institution"
                disabled={currentUser.role !== 'Admin'}
                onClick={() => setShowDeleteInstitutionModal(true)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  currentUser.role === 'Admin'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                title={
                  currentUser.role !== 'Admin'
                    ? 'Restricted: Only an Administrator for this institution can delete the profile and data.'
                    : 'Permanently delete institution and all server data'
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Institution & All Data...
              </button>
              {currentUser.role !== 'Admin' && (
                <span className="text-[10px] text-slate-500 block text-center">
                  Restricted to Admin user for this institution.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Safety Confirmation Modal (Compact) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Compact Modal Header */}
            <div className="px-3.5 py-2.5 border-b border-rose-100/90 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5 leading-tight">
                    Confirm Database Reset
                    <span className="text-[9px] font-bold text-rose-600 bg-rose-100/80 px-1.5 py-0.5 rounded">Permanent</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Purging {selectedCount} selected table{selectedCount !== 1 ? 's' : ''} ({totalRecordsToClear} records)
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-cleanup-modal"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-rose-100/50 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Compact Modal Body */}
            <div className="p-3.5 space-y-2.5 text-xs overflow-y-auto">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-rose-50/80 border border-rose-200/70 rounded-lg text-rose-800 text-[11px] leading-snug">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Permanently purges records in selected tables. Cannot be undone.</span>
              </div>

              {/* Compact Tables Chips */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 px-0.5">
                  <span>Selected Tables ({selectedCount})</span>
                  <span className="text-[10px] font-semibold text-rose-600">{totalRecordsToClear} records</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 bg-slate-50/80 border border-slate-200/80 rounded-lg">
                  {tableCards
                    .filter((t) => selectedTables[t.key])
                    .map((t) => (
                      <span
                        key={t.key}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-rose-200/70 rounded-md text-[10px] font-medium text-slate-800 shadow-2xs"
                      >
                        <span className="truncate max-w-[130px]">{t.name}</span>
                        <span className="font-mono font-bold text-rose-600">({t.count})</span>
                      </span>
                    ))}
                </div>
              </div>

              {/* Compact Cascading Notice */}
              {integrityWarnings.length > 0 && (
                <div className="p-2 bg-amber-50/80 rounded-lg border border-amber-200/70 text-amber-900 text-[10px] space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-[10px] text-amber-800">
                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                    Cascading Notice ({integrityWarnings.length}):
                  </div>
                  <p className="text-[10px] font-medium leading-tight text-amber-800/90 pl-4">
                    {integrityWarnings.join(' • ')}
                  </p>
                </div>
              )}

              {/* Compact Mandatory Checkbox */}
              <label className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer hover:bg-slate-100/60 transition">
                <input
                  type="checkbox"
                  id="checkbox-cleanup-acknowledge"
                  checked={hasAcknowledgedRisk}
                  onChange={(e) => setHasAcknowledgedRisk(e.target.checked)}
                  className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer shrink-0"
                />
                <span className="text-[10px] text-slate-700 font-medium leading-tight">
                  I accept responsibility for cascading data integrity and orphaned references.
                </span>
              </label>

              {/* Compact Confirmation Field */}
              <div className="flex items-center gap-2 pt-0.5">
                <label htmlFor="input-cleanup-confirm" className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">
                  Type <span className="font-mono font-bold text-rose-600">RESET DATA</span>:
                </label>
                <input
                  type="text"
                  id="input-cleanup-confirm"
                  value={confirmationPhrase}
                  onChange={(e) => setConfirmationPhrase(e.target.value)}
                  placeholder="RESET DATA"
                  className="flex-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-slate-300 uppercase"
                />
              </div>
            </div>

            {/* Compact Modal Footer */}
            <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                id="btn-cleanup-cancel"
                onClick={() => setShowConfirmModal(false)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/80 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-cleanup-execute"
                disabled={!hasAcknowledgedRisk || confirmationPhrase.trim().toUpperCase() !== 'RESET DATA' || isExecuting}
                onClick={handleExecuteReset}
                className="px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isExecuting ? 'Purging...' : `Execute Reset (${selectedCount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Institution Deletion Modal */}
      <DeleteInstitutionModal
        isOpen={showDeleteInstitutionModal}
        onClose={() => setShowDeleteInstitutionModal(false)}
      />
    </div>
  );
};
