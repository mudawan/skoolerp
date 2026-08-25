import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Family } from '../types';
import { downloadCsv } from '../utils/csv';
import { StudentAvatar } from './StudentAvatar';
import { ConfirmModal } from './ConfirmModal';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FolderKanban,
  LayoutGrid,
  List,
  Phone,
  Plus,
  PlusCircle,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';

export const FamiliesView: React.FC = () => {
  const {
    families,
    students,
    classes,
    addFamily,
    updateFamily,
    deleteFamily,
    addStudentToFamily,
    removeStudentFromFamily,
    hasPermission,
    showToast,
  } = useApp();

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [memberModalFamily, setMemberModalFamily] = useState<Family | null>(null);
  const [familyToDelete, setFamilyToDelete] = useState<Family | null>(null);

  // Bulk Selection & Sorting States
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sortField, setSortField] = useState<'familyNo' | 'headName' | 'phone' | 'members'>('familyNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // New Visibility & Filter Controls
  const [hideNoActiveFamilies, setHideNoActiveFamilies] = useState(false);
  const [showInactiveStudents, setShowInactiveStudents] = useState(false);

  const [formData, setFormData] = useState({
    headName: '',
    contactPhone: '',
    address: '',
    notes: '',
  });

  const [formError, setFormError] = useState('');
  const [selectedStudentForMember, setSelectedStudentForMember] = useState('');
  const [studentPickerSearch, setStudentPickerSearch] = useState('');
  const [isStudentPickerOpen, setIsStudentPickerOpen] = useState(false);

  const handleOpenMemberModal = (family: Family) => {
    setMemberModalFamily(family);
    setSelectedStudentForMember('');
    setStudentPickerSearch('');
    setIsStudentPickerOpen(false);
  };

  const handleCloseMemberModal = () => {
    setMemberModalFamily(null);
    setSelectedStudentForMember('');
    setStudentPickerSearch('');
    setIsStudentPickerOpen(false);
  };

  const filteredFamilies = useMemo(() => {
    return families.filter((f) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        f.headName.toLowerCase().includes(search) ||
        f.familyNo.toLowerCase().includes(search) ||
        f.contactPhone.includes(search) ||
        (f.address && f.address.toLowerCase().includes(search));

      if (!matchesSearch) return false;

      if (hideNoActiveFamilies) {
        const familyStudents = students.filter((s) => f.memberStudentIds.includes(s.id));
        const hasActive = familyStudents.some((s) => s.status === 'Active');
        if (!hasActive) return false;
      }

      return true;
    });
  }, [families, students, searchTerm, hideNoActiveFamilies]);

  const sortedFamilies = useMemo(() => {
    return [...filteredFamilies].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'familyNo':
          cmp = a.familyNo.localeCompare(b.familyNo, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
          break;
        case 'headName':
          cmp = a.headName.localeCompare(b.headName, undefined, { sensitivity: 'base' });
          break;
        case 'phone':
          cmp = a.contactPhone.localeCompare(b.contactPhone);
          break;
        case 'members':
          cmp = (a.memberStudentIds?.length || 0) - (b.memberStudentIds?.length || 0);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredFamilies, sortField, sortDirection]);

  // Selection handlers
  const toggleSelectFamily = (id: string) => {
    setSelectedFamilyIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFamilyIds.length === filteredFamilies.length && filteredFamilies.length > 0) {
      setSelectedFamilyIds([]);
    } else {
      setSelectedFamilyIds(filteredFamilies.map((f) => f.id));
    }
  };

  const handleSort = (field: 'familyNo' | 'headName' | 'phone' | 'members') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: 'familyNo' | 'headName' | 'phone' | 'members') => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-teal-600 inline ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-teal-600 inline ml-1" />
    );
  };

  const handleOpenAddModal = () => {
    setFormData({ headName: '', contactPhone: '', address: '', notes: '' });
    setFormError('');
    setShowAddModal(true);
  };

  const handleOpenEditModal = (family: Family) => {
    setEditingFamily(family);
    setFormData({
      headName: family.headName,
      contactPhone: family.contactPhone,
      address: family.address,
      notes: family.notes || '',
    });
    setFormError('');
  };

  const handleSaveFamily = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.headName.trim()) {
      setFormError('Family head name is required.');
      return;
    }
    if (!formData.contactPhone.trim()) {
      setFormError('Contact phone is required.');
      return;
    }

    if (editingFamily) {
      const res = updateFamily(editingFamily.id, {
        headName: formData.headName.trim(),
        contactPhone: formData.contactPhone.trim(),
        address: formData.address.trim(),
        notes: formData.notes.trim() || undefined,
      });
      if (res.success) setEditingFamily(null);
    } else {
      const res = addFamily({
        headName: formData.headName.trim(),
        contactPhone: formData.contactPhone.trim(),
        address: formData.address.trim(),
        notes: formData.notes.trim() || undefined,
        memberStudentIds: [],
      });
      if (res.success) setShowAddModal(false);
    }
  };

  const handleDelete = (family: Family) => {
    setFamilyToDelete(family);
  };

  const handleConfirmDelete = () => {
    if (!familyToDelete) return;
    if (familyToDelete.memberStudentIds?.length > 0) {
      familyToDelete.memberStudentIds.forEach((sId) => {
        removeStudentFromFamily(familyToDelete.id, sId);
      });
    }
    const res = deleteFamily(familyToDelete.id);
    if (!res.success) {
      showToast(res.error || 'Failed to delete family record.', 'error');
    } else {
      showToast(`Family ${familyToDelete.familyNo} deleted successfully.`, 'success');
      setSelectedFamilyIds((prev) => prev.filter((id) => id !== familyToDelete.id));
    }
    setFamilyToDelete(null);
  };

  // Bulk Delete
  const handleConfirmBulkDelete = () => {
    if (selectedFamilyIds.length === 0) return;
    let deletedCount = 0;
    let failedCount = 0;

    selectedFamilyIds.forEach((famId) => {
      const fam = families.find((f) => f.id === famId);
      if (fam) {
        if (fam.memberStudentIds?.length > 0) {
          fam.memberStudentIds.forEach((sId) => {
            removeStudentFromFamily(fam.id, sId);
          });
        }
        const res = deleteFamily(fam.id);
        if (res.success) {
          deletedCount++;
        } else {
          failedCount++;
        }
      }
    });

    showToast(
      `Successfully deleted ${deletedCount} family record(s).${
        failedCount > 0 ? ` (${failedCount} failed)` : ''
      }`,
      deletedCount > 0 ? 'success' : 'error'
    );
    setSelectedFamilyIds([]);
    setShowBulkDeleteModal(false);
  };

  // Bulk Export CSV
  const handleExportCsv = () => {
    const targets =
      selectedFamilyIds.length > 0
        ? sortedFamilies.filter((f) => selectedFamilyIds.includes(f.id))
        : sortedFamilies;

    if (targets.length === 0) {
      showToast('No families to export.', 'error');
      return;
    }

    const headers = [
      'Family #',
      'Family Head Name',
      'Contact Phone',
      'Address',
      'Total Members',
      'Active Members',
      'Inactive Members',
      'Linked Students (Reg - Name - Class - Status)',
      'Notes',
    ];

    const rows = targets.map((f) => {
      const mems = students.filter((s) => f.memberStudentIds.includes(s.id));
      const activeCount = mems.filter((s) => s.status === 'Active').length;
      const inactiveCount = mems.filter((s) => s.status !== 'Active').length;
      const memDetails = mems
        .map((s) => {
          const cls = classes.find((c) => c.id === s.classId);
          return `${s.regNo}: ${s.name} (${cls?.name || 'Class'}, ${s.status})`;
        })
        .join('; ');

      return [
        `"${f.familyNo}"`,
        `"${f.headName.replace(/"/g, '""')}"`,
        `"${f.contactPhone.replace(/"/g, '""')}"`,
        `"${(f.address || '').replace(/"/g, '""')}"`,
        f.memberStudentIds.length,
        activeCount,
        inactiveCount,
        `"${memDetails.replace(/"/g, '""')}"`,
        `"${(f.notes || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCsv(
      `Skooler_Families_${selectedFamilyIds.length > 0 ? 'Selected_' : ''}${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
      csvContent
    );
    showToast(`Exported ${targets.length} family record(s) to CSV.`, 'success');
  };

  // Bulk Copy to Clipboard
  const handleCopyToClipboard = () => {
    const targets =
      selectedFamilyIds.length > 0
        ? sortedFamilies.filter((f) => selectedFamilyIds.includes(f.id))
        : sortedFamilies;

    if (targets.length === 0) {
      showToast('No families to copy.', 'error');
      return;
    }

    const headers = ['Family #', 'Head Name', 'Phone', 'Address', 'Total Members', 'Linked Students'];
    const rows = targets.map((f) => {
      const mems = students.filter((s) => f.memberStudentIds.includes(s.id));
      const memNames = mems.map((s) => `${s.name} (${s.regNo})`).join(', ');
      return [
        f.familyNo,
        f.headName,
        f.contactPhone,
        f.address || '',
        f.memberStudentIds.length,
        memNames,
      ].join('\t');
    });

    const text = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showToast(`Copied ${targets.length} family record(s) to clipboard.`, 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const selectedFamilies = families.filter((f) => selectedFamilyIds.includes(f.id));
  const totalLinkedStudentsInSelected = selectedFamilies.reduce(
    (acc, f) => acc + (f.memberStudentIds?.length || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-teal-600" />
            Family Group Records
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Group sibling students under family heads for combined billing, sibling concessions, and centralized records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
              <span>List</span>
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer border border-slate-200"
            title={
              selectedFamilyIds.length > 0
                ? `Export ${selectedFamilyIds.length} selected families to CSV`
                : 'Export all filtered families to CSV'
            }
          >
            <Download className="w-4 h-4 text-slate-600" />
            {selectedFamilyIds.length > 0 ? `Export (${selectedFamilyIds.length})` : 'Export CSV'}
          </button>

          <button
            onClick={handleCopyToClipboard}
            title="Copy family roster to clipboard (pasteable into Excel/Sheets)"
            className={`flex items-center gap-2 font-semibold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer border ${
              copied
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-600" />
                <span>
                  {selectedFamilyIds.length > 0 ? `Copy (${selectedFamilyIds.length})` : 'Copy'}
                </span>
              </>
            )}
          </button>

          {selectedFamilyIds.length > 0 && hasPermission('families.manage') && (
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedFamilyIds.length})
            </button>
          )}

          {hasPermission('families.manage') && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Family Record
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search family #, head, phone, address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        {/* Compact Toggles & Stats */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle: Active Families Only */}
          <label
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer select-none transition ${
              hideNoActiveFamilies
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
            title="Show only families with at least one active student"
          >
            <input
              type="checkbox"
              checked={hideNoActiveFamilies}
              onChange={(e) => setHideNoActiveFamilies(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer w-3.5 h-3.5"
            />
            <span>Active Families Only</span>
          </label>

          {/* Toggle: Show Inactive Students */}
          <label
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer select-none transition ${
              showInactiveStudents
                ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
            title="Display inactive student members in family groups"
          >
            <input
              type="checkbox"
              checked={showInactiveStudents}
              onChange={(e) => setShowInactiveStudents(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
            />
            <span>Show Inactive Students</span>
          </label>

          {/* Selection Clear Helper */}
          {selectedFamilyIds.length > 0 && (
            <button
              onClick={() => setSelectedFamilyIds([])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 font-bold hover:bg-teal-100 transition cursor-pointer"
              title="Deselect all families"
            >
              <X className="w-3.5 h-3.5" />
              <span>{selectedFamilyIds.length} Selected (Clear)</span>
            </button>
          )}

          {/* Counter Summary */}
          <div className="text-slate-500 font-medium pl-2 border-l border-slate-200 text-xs whitespace-nowrap">
            <span className="font-bold text-slate-800">{filteredFamilies.length}</span> / {families.length} families
          </div>
        </div>
      </div>

      {/* Family Cards Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedFamilies.length > 0 ? (
            sortedFamilies.map((family) => {
              const allMemberStudents = students.filter((s) =>
                family.memberStudentIds.includes(s.id)
              );
              const activeMemberStudents = allMemberStudents.filter((s) => s.status === 'Active');
              const inactiveMemberStudents = allMemberStudents.filter((s) => s.status !== 'Active');
              const displayMemberStudents = showInactiveStudents
                ? allMemberStudents
                : activeMemberStudents;
              const isSelected = selectedFamilyIds.includes(family.id);

              return (
                <div
                  key={family.id}
                  className={`bg-white p-5 rounded-2xl border transition space-y-4 shadow-xs ${
                    isSelected
                      ? 'border-teal-400 ring-2 ring-teal-500/20 bg-teal-50/15'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectFamily(family.id)}
                        className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer mt-1 w-4 h-4"
                        title="Select family"
                      />
                      <div>
                        <span className="text-[11px] font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60 inline-block">
                          {family.familyNo}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-1">
                          {family.headName}
                        </h3>
                      </div>
                    </div>

                    {hasPermission('families.manage') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditModal(family)}
                          title="Edit Family Record"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(family)}
                          title="Delete Family Record"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <p className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {family.contactPhone}
                    </p>
                    <p className="text-slate-500 line-clamp-1">{family.address || '—'}</p>
                  </div>

                  {/* Member Students */}
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        Family Members ({activeMemberStudents.length} active
                        {inactiveMemberStudents.length > 0 && `, ${inactiveMemberStudents.length} inactive`})
                      </span>
                      {hasPermission('families.manage') && (
                        <button
                          onClick={() => handleOpenMemberModal(family)}
                          className="text-[11px] font-bold text-teal-600 hover:underline cursor-pointer"
                        >
                          + Manage
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {displayMemberStudents.length > 0 ? (
                        <>
                          {displayMemberStudents.map((m) => {
                            const cls = classes.find((c) => c.id === m.classId);
                            const isInactive = m.status !== 'Active';
                            return (
                              <span
                                key={m.id}
                                className={`inline-flex items-center gap-1.5 border text-[11px] font-semibold px-2 py-1 rounded-md ${
                                  isInactive
                                    ? 'bg-slate-50 border-slate-300/80 text-slate-500'
                                    : 'bg-slate-100 border-slate-200 text-slate-800'
                                }`}
                              >
                                <StudentAvatar photoUrl={m.photoUrl} name={m.name} size="xs" />
                                <span>{m.name} ({cls?.name || 'Class'})</span>
                                {isInactive && (
                                  <span className="text-[9px] px-1 py-0.2 bg-rose-100 text-rose-700 font-bold rounded">
                                    {m.status === 'AutoDeactivated' ? 'Auto-Deact' : 'Inactive'}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                          {!showInactiveStudents && inactiveMemberStudents.length > 0 && (
                            <span
                              onClick={() => setShowInactiveStudents(true)}
                              className="inline-flex items-center text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-dashed border-slate-300 font-medium cursor-pointer hover:bg-slate-100 hover:text-slate-800 transition"
                              title="Click to view inactive students"
                            >
                              +{inactiveMemberStudents.length} inactive hidden
                            </span>
                          )}
                        </>
                      ) : allMemberStudents.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                            No active students ({inactiveMemberStudents.length} inactive hidden)
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowInactiveStudents(true)}
                            className="text-[10px] text-indigo-600 font-bold underline cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No member students linked</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 italic">
              No family records found matching your filters.
            </div>
          )}
        </div>
      )}

      {/* Family Columns List Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px] select-none whitespace-nowrap">
                <tr>
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredFamilies.length > 0 &&
                        selectedFamilyIds.length === filteredFamilies.length
                      }
                      onChange={toggleSelectAll}
                      className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      title="Select all filtered families"
                    />
                  </th>
                  <th
                    className="p-3.5 w-36 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('familyNo')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Family #</span>
                      {renderSortIcon('familyNo')}
                    </div>
                  </th>
                  <th
                    className="p-3.5 min-w-[170px] cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('headName')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Family Head Name</span>
                      {renderSortIcon('headName')}
                    </div>
                  </th>
                  <th
                    className="p-3.5 w-40 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('phone')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Contact Phone</span>
                      {renderSortIcon('phone')}
                    </div>
                  </th>
                  <th
                    className="p-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('members')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Linked Students</span>
                      {renderSortIcon('members')}
                    </div>
                  </th>
                  {hasPermission('families.manage') && (
                    <th className="p-3.5 text-right w-28 whitespace-nowrap">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFamilies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={hasPermission('families.manage') ? 6 : 5}
                      className="p-8 text-center text-slate-400 italic"
                    >
                      No family records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  sortedFamilies.map((family) => {
                    const allMemberStudents = students.filter((s) =>
                      family.memberStudentIds.includes(s.id)
                    );
                    const activeMemberStudents = allMemberStudents.filter((s) => s.status === 'Active');
                    const inactiveMemberStudents = allMemberStudents.filter((s) => s.status !== 'Active');
                    const displayMemberStudents = showInactiveStudents
                      ? allMemberStudents
                      : activeMemberStudents;
                    const isSelected = selectedFamilyIds.includes(family.id);

                    return (
                      <tr
                        key={family.id}
                        className={`hover:bg-slate-50/80 transition ${
                          isSelected ? 'bg-teal-50/50' : ''
                        }`}
                      >
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectFamily(family.id)}
                            className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                            title="Select family"
                          />
                        </td>
                        <td className="p-3.5 font-mono font-bold text-teal-700 whitespace-nowrap">
                          <span className="bg-teal-50 px-2.5 py-1 rounded border border-teal-200/60 inline-block">
                            {family.familyNo}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 text-sm whitespace-nowrap">
                            {family.headName}
                          </div>
                          {family.address && (
                            <div className="text-[11px] text-slate-400 line-clamp-1">
                              {family.address}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-700 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {family.contactPhone}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {displayMemberStudents.length > 0 ? (
                              <>
                                {displayMemberStudents.map((m) => {
                                  const cls = classes.find((c) => c.id === m.classId);
                                  const isInactive = m.status !== 'Active';
                                  return (
                                    <span
                                      key={m.id}
                                      className={`inline-flex items-center gap-1 border text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                                        isInactive
                                          ? 'bg-slate-50 border-slate-300/80 text-slate-500'
                                          : 'bg-slate-100 border-slate-200 text-slate-800'
                                      }`}
                                    >
                                      <StudentAvatar photoUrl={m.photoUrl} name={m.name} size="xs" />
                                      <span>{m.name} ({cls?.name || 'Class'})</span>
                                      {isInactive && (
                                        <span className="text-[9px] px-1 py-0.2 bg-rose-100 text-rose-700 font-bold rounded">
                                          {m.status === 'AutoDeactivated' ? 'Auto-Deact' : 'Inactive'}
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                                {!showInactiveStudents && inactiveMemberStudents.length > 0 && (
                                  <span
                                    onClick={() => setShowInactiveStudents(true)}
                                    className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-dashed border-slate-300 font-medium cursor-pointer hover:bg-slate-100 hover:text-slate-800"
                                    title="Click to view inactive students"
                                  >
                                    +{inactiveMemberStudents.length} inactive
                                  </span>
                                )}
                              </>
                            ) : allMemberStudents.length > 0 ? (
                              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                                No active students ({inactiveMemberStudents.length} inactive)
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">None</span>
                            )}
                            {hasPermission('families.manage') && (
                              <button
                                onClick={() => handleOpenMemberModal(family)}
                                className="text-[10px] font-bold text-teal-600 hover:text-teal-800 ml-1 cursor-pointer underline"
                                title="Manage Family Members"
                              >
                                {allMemberStudents.length > 0 ? 'Edit' : '+ Add'}
                              </button>
                            )}
                          </div>
                        </td>
                        {hasPermission('families.manage') && (
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenMemberModal(family)}
                                title="Manage Family Members"
                                className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Users className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenEditModal(family)}
                                title="Edit Family Record"
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(family)}
                                title="Delete Family Record"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Family Modal */}
      {(showAddModal || editingFamily) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingFamily ? 'Edit Family Record' : 'Create Family Record'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingFamily(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                {formError}
              </p>
            )}

            <form onSubmit={handleSaveFamily} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Family Head Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Father Name"
                  value={formData.headName}
                  onChange={(e) => setFormData({ ...formData, headName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Phone *</label>
                <input
                  type="text"
                  required
                  placeholder="+92 3XX 1234567"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Residential Address</label>
                <input
                  type="text"
                  placeholder="Street, Sector, City"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingFamily(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl cursor-pointer"
                >
                  Save Family
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Members Modal */}
      {memberModalFamily && (() => {
        const liveModalFamily = families.find((f) => f.id === memberModalFamily.id) || memberModalFamily;
        const currentMemberIds = liveModalFamily.memberStudentIds || [];
        const candidateStudents = students.filter((s) => !currentMemberIds.includes(s.id));
        
        const term = studentPickerSearch.toLowerCase().trim();
        const filteredCandidates = candidateStudents.filter((s) => {
          if (!term) return true;
          const cls = classes.find((c) => c.id === s.classId);
          const otherFam = s.familyId ? families.find((f) => f.id === s.familyId) : null;
          return (
            s.name.toLowerCase().includes(term) ||
            s.regNo.toLowerCase().includes(term) ||
            (s.studentNo && s.studentNo.toLowerCase().includes(term)) ||
            (s.fatherName && s.fatherName.toLowerCase().includes(term)) ||
            (s.fatherCnic && s.fatherCnic.includes(term)) ||
            (s.mobileNumber && s.mobileNumber.includes(term)) ||
            (cls && cls.name.toLowerCase().includes(term)) ||
            (otherFam && otherFam.familyNo.toLowerCase().includes(term))
          );
        });

        const selectedStudent = students.find((s) => s.id === selectedStudentForMember);
        const selectedStudentOtherFamily = selectedStudent?.familyId
          ? families.find((f) => f.id === selectedStudent.familyId)
          : null;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-auto relative flex flex-col overflow-visible">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 gap-2 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200/60 px-2 py-0.5 rounded text-xs shrink-0">
                      {liveModalFamily.familyNo}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      Manage Family Members
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Family Head: <span className="font-semibold text-slate-700">{liveModalFamily.headName}</span>
                    {liveModalFamily.contactPhone && <span> &bull; {liveModalFamily.contactPhone}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseMemberModal}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0 transition"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 flex-1">
                {/* Current Members List */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-teal-600" />
                      <span>Linked Student Members ({currentMemberIds.length})</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {currentMemberIds.length === 1 ? '1 student' : `${currentMemberIds.length} students`}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto divide-y divide-slate-100/80 pr-1">
                    {currentMemberIds.length === 0 ? (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-slate-400 italic">
                        No students currently linked to this family. Use the search field below to link students.
                      </div>
                    ) : (
                      currentMemberIds.map((mId) => {
                        const s = students.find((st) => st.id === mId);
                        if (!s) return null;
                        const cls = classes.find((c) => c.id === s.classId);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/70 p-2.5 rounded-xl border border-slate-200/80 gap-2.5 transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                              <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 truncate text-xs" title={s.name}>
                                    {s.name}
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-200/80 px-1.5 py-0.2 rounded shrink-0">
                                    {s.regNo}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                  <span>{cls?.name || 'Unassigned'}</span>
                                  {s.fatherName && <span>&bull; S/D of {s.fatherName}</span>}
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                                      s.status === 'Active'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {s.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeStudentFromFamily(liveModalFamily.id, s.id)}
                              className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 transition"
                              title="Remove from family"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Add Student to Family with Type-Searchable Combobox */}
                <div className="pt-3 border-t border-slate-200 space-y-2 text-xs relative z-30">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-teal-600" />
                      <span>Add Student to Family</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {candidateStudents.length} available
                    </span>
                  </div>

                  <div className="flex items-center gap-2 w-full">
                    {/* Searchable Combobox Container */}
                    <div className="relative flex-1 min-w-0">
                      {/* Click outside backdrop */}
                      {isStudentPickerOpen && (
                        <div
                          className="fixed inset-0 z-40 bg-transparent"
                          onClick={() => setIsStudentPickerOpen(false)}
                        />
                      )}

                      <div className="relative z-50">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search student by name, Reg #, roll #, class..."
                          value={studentPickerSearch}
                          onChange={(e) => {
                            setStudentPickerSearch(e.target.value);
                            setSelectedStudentForMember('');
                            setIsStudentPickerOpen(true);
                          }}
                          onFocus={() => setIsStudentPickerOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setIsStudentPickerOpen(false);
                            } else if (e.key === 'Enter' && selectedStudentForMember) {
                              e.preventDefault();
                              addStudentToFamily(liveModalFamily.id, selectedStudentForMember);
                              setSelectedStudentForMember('');
                              setStudentPickerSearch('');
                              setIsStudentPickerOpen(false);
                            }
                          }}
                          className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition truncate"
                        />
                        {studentPickerSearch || selectedStudentForMember ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStudentPickerSearch('');
                              setSelectedStudentForMember('');
                              setIsStudentPickerOpen(false);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                            title="Clear search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        )}
                      </div>

                      {/* Dropdown Popover List */}
                      {isStudentPickerOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100 ring-1 ring-slate-900/10">
                          {filteredCandidates.length > 0 ? (
                            filteredCandidates.slice(0, 50).map((s) => {
                              const cls = classes.find((c) => c.id === s.classId);
                              const otherFam = s.familyId ? families.find((f) => f.id === s.familyId) : null;
                              const isSelected = s.id === selectedStudentForMember;

                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedStudentForMember(s.id);
                                    setStudentPickerSearch(`${s.name} (${s.regNo})`);
                                    setIsStudentPickerOpen(false);
                                  }}
                                  className={`w-full text-left p-2.5 hover:bg-teal-50/60 flex items-center justify-between gap-2.5 transition cursor-pointer ${
                                    isSelected ? 'bg-teal-50 font-bold' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                                    <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-900 truncate text-xs" title={s.name}>
                                          {s.name}
                                        </span>
                                        <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200/60 px-1.5 py-0.2 rounded shrink-0">
                                          {s.regNo}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                        <span>{cls?.name || 'No Class'}</span>
                                        {s.fatherName && <span>&bull; S/D of {s.fatherName}</span>}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                        s.status === 'Active'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-rose-100 text-rose-800'
                                      }`}
                                    >
                                      {s.status}
                                    </span>
                                    <span
                                      className={`text-[10px] font-medium ${
                                        otherFam
                                          ? 'text-amber-700 bg-amber-50 px-1 rounded'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      {otherFam ? `In ${otherFam.familyNo}` : 'Unlinked'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-4 text-center text-slate-400 text-xs italic">
                              No matching unlinked students found
                            </div>
                          )}
                          {filteredCandidates.length > 50 && (
                            <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 font-medium">
                              Showing 50 of {filteredCandidates.length} students. Refine query to narrow down.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Link Action Button - safely contained within modal border */}
                    <button
                      type="button"
                      disabled={!selectedStudentForMember}
                      onClick={() => {
                        addStudentToFamily(liveModalFamily.id, selectedStudentForMember);
                        setSelectedStudentForMember('');
                        setStudentPickerSearch('');
                        setIsStudentPickerOpen(false);
                      }}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 transition shadow-xs flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Link</span>
                    </button>
                  </div>

                  {/* Context notice when a selected student is already in another family */}
                  {selectedStudent && selectedStudentOtherFamily && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong>{selectedStudent.name}</strong> is currently linked to <strong>{selectedStudentOtherFamily.familyNo} ({selectedStudentOtherFamily.headName})</strong>. Linking will automatically transfer them to this family.
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end pt-3 border-t border-slate-200 shrink-0 relative z-10">
                <button
                  type="button"
                  onClick={handleCloseMemberModal}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Single Delete Family Confirmation Modal */}
      <ConfirmModal
        isOpen={!!familyToDelete}
        title="Delete Family Group"
        message={
          familyToDelete ? (
            <div className="space-y-2">
              <p>
                Are you sure you want to delete family{' '}
                <strong className="text-slate-900">
                  {familyToDelete.familyNo} ({familyToDelete.headName})
                </strong>
                ?
              </p>
              {familyToDelete.memberStudentIds?.length > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                  This will unlink <strong>{familyToDelete.memberStudentIds.length}</strong> student(s) from this family. The student records themselves will not be deleted.
                </div>
              )}
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Delete Family"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setFamilyToDelete(null)}
      />

      {/* Bulk Delete Families Confirmation Modal */}
      <ConfirmModal
        isOpen={showBulkDeleteModal}
        title={`Bulk Delete ${selectedFamilyIds.length} Families`}
        message={
          <div className="space-y-2">
            <p>
              Are you sure you want to delete{' '}
              <strong className="text-slate-900">{selectedFamilyIds.length}</strong> selected family
              group record(s)?
            </p>
            {totalLinkedStudentsInSelected > 0 && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                This will automatically unlink <strong>{totalLinkedStudentsInSelected}</strong> student member(s) across these families. The individual student records will remain intact.
              </div>
            )}
          </div>
        }
        confirmLabel={`Delete ${selectedFamilyIds.length} Families`}
        variant="danger"
        onConfirm={handleConfirmBulkDelete}
        onClose={() => setShowBulkDeleteModal(false)}
      />
    </div>
  );
};

