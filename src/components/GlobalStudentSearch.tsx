import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Student } from '../types';
import { StudentAvatar } from './StudentAvatar';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentFormModal } from './StudentFormModal';
import {
  Search,
  X,
  User,
  GraduationCap,
  CreditCard,
  Edit2,
  Phone,
  ArrowRight,
  Clock,
  Sparkles,
  Command,
} from 'lucide-react';

interface GlobalStudentSearchProps {
  onNavigateToLedger?: (studentId: string) => void;
  onNavigateToStudents?: () => void;
}

export const GlobalStudentSearch: React.FC<GlobalStudentSearchProps> = ({
  onNavigateToLedger,
  onNavigateToStudents,
}) => {
  const { students, classes, families, hasPermission, showToast } = useApp();

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'withdrawn'>('all');

  // Modals for selected student
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Helper to test if a student matches status filter
  const isMatchStatus = (student: Student, filter: 'all' | 'active' | 'withdrawn') => {
    if (filter === 'active') return student.status === 'Active';
    if (filter === 'withdrawn') return student.status !== 'Active';
    return true;
  };

  // Recent students state (ephemeral in-memory per session, zero disk cache)
  const [recentStudentIds, setRecentStudentIds] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Map classes and families for fast lookup
  const classMap = useMemo(() => {
    return new Map(classes.map((c) => [c.id, c.name]));
  }, [classes]);

  const familyMap = useMemo(() => {
    return new Map(families.map((f) => [f.id, f.name]));
  }, [families]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K / '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is actively typing in another input/textarea/select
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute match counts for current query across filters
  const matchCounts = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    const matched = cleanQuery
      ? students.filter((student) => {
          if (student.name.toLowerCase().includes(cleanQuery)) return true;
          if (student.regNo.toLowerCase().includes(cleanQuery)) return true;
          if (student.fatherName.toLowerCase().includes(cleanQuery)) return true;
          if (student.fatherPhone?.toLowerCase().includes(cleanQuery)) return true;
          if (student.motherPhone?.toLowerCase().includes(cleanQuery)) return true;
          if (student.mobileNumber?.toLowerCase().includes(cleanQuery)) return true;
          if (student.studentNationalId?.toLowerCase().includes(cleanQuery)) return true;
          if (student.fatherNationalId?.toLowerCase().includes(cleanQuery)) return true;
          const className = classMap.get(student.classId)?.toLowerCase() || '';
          if (className.includes(cleanQuery)) return true;
          const famName = familyMap.get(student.familyId || '')?.toLowerCase() || '';
          if (famName.includes(cleanQuery)) return true;
          return false;
        })
      : students;

    const active = matched.filter((s) => s.status === 'Active').length;
    const withdrawn = matched.filter((s) => s.status !== 'Active').length;
    return { all: matched.length, active, withdrawn };
  }, [students, query, classMap, familyMap]);

  // Filter students based on query and status filter
  const searchResults = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [];

    return students
      .filter((student) => {
        // Status filter
        if (!isMatchStatus(student, statusFilter)) return false;

        // Name
        if (student.name.toLowerCase().includes(cleanQuery)) return true;
        // Reg No / Roll No
        if (student.regNo.toLowerCase().includes(cleanQuery)) return true;
        // Father Name
        if (student.fatherName.toLowerCase().includes(cleanQuery)) return true;
        // Phones
        if (student.fatherPhone?.toLowerCase().includes(cleanQuery)) return true;
        if (student.motherPhone?.toLowerCase().includes(cleanQuery)) return true;
        if (student.mobileNumber?.toLowerCase().includes(cleanQuery)) return true;
        // Student ID / Birth Cert. No.
        if (student.studentNationalId?.toLowerCase().includes(cleanQuery)) return true;
        if (student.fatherNationalId?.toLowerCase().includes(cleanQuery)) return true;
        // Class Name
        const className = classMap.get(student.classId)?.toLowerCase() || '';
        if (className.includes(cleanQuery)) return true;
        // Family
        const famName = familyMap.get(student.familyId || '')?.toLowerCase() || '';
        if (famName.includes(cleanQuery)) return true;

        return false;
      })
      .slice(0, 10); // Top 10 matches
  }, [students, query, classMap, familyMap, statusFilter]);

  // Recent students objects filtered by status
  const recentStudents = useMemo(() => {
    if (query.trim()) return [];
    return recentStudentIds
      .map((id) => students.find((s) => s.id === id))
      .filter((s): s is Student => !!s && isMatchStatus(s, statusFilter))
      .slice(0, 6);
  }, [recentStudentIds, students, query, statusFilter]);

  // Active items being rendered in dropdown
  const activeItems = query.trim() ? searchResults : recentStudents;

  // Reset selected index when results or filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, statusFilter]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save to recent searches (in-memory per session)
  const recordRecentStudent = (studentId: string) => {
    setRecentStudentIds((prev) => [studentId, ...prev.filter((id) => id !== studentId)].slice(0, 8));
  };

  // Open student profile
  const handleSelectStudent = (student: Student) => {
    recordRecentStudent(student.id);
    setProfileStudent(student);
    setIsOpen(false);
  };

  // Keyboard navigation inside dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < activeItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : activeItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeItems.length > 0 && activeItems[selectedIndex]) {
        handleSelectStudent(activeItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const getStatusBadge = (status: Student['status']) => {
    switch (status) {
      case 'Active':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>;
      case 'AutoDeactivated':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Auto Deactivated</span>;
      case 'Inactive':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Inactive</span>;
    }
  };

  return (
    <>
      <div className="relative w-full max-w-xl">
        {/* Search Input Box */}
        <div className="relative flex items-center">
          <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
            <Search className="w-4 h-4 text-slate-400" />
          </div>

          <input
            ref={inputRef}
            type="text"
            id="global-student-search-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search students by name, roll no, father name, class..."
            className="w-full pl-9 pr-20 py-2 bg-white/95 hover:bg-white focus:bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition-all font-medium"
            autoComplete="off"
            spellCheck="false"
          />

          <div className="absolute right-2.5 flex items-center gap-1">
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-500 select-none">
                <Command className="w-2.5 h-2.5" />
                <span>K</span>
              </div>
            )}
          </div>
        </div>

        {/* Dropdown Results Overlay */}
        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header info */}
            <div className="px-3.5 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                {query.trim() ? (
                  <>
                    <Search className="w-3 h-3 text-teal-600" />
                    <span>
                      Found <strong className="text-slate-800">{searchResults.length}</strong> matching students
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Recent Student Profiles</span>
                  </>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400">
                <span>Navigate: <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">↑</kbd> <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">↓</kbd></span>
                <span>Open: <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">↵</kbd></span>
                <span>Close: <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">Esc</kbd></span>
              </div>
            </div>

            {/* Filter Toggle Segmented Control */}
            <div className="px-3.5 py-1.5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg">
                {/* Active Students Filter */}
                <button
                  type="button"
                  id="search-filter-active"
                  onClick={() => setStatusFilter('active')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'active'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Active Students</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      statusFilter === 'active'
                        ? 'bg-emerald-100/80 text-emerald-800 font-bold'
                        : 'bg-slate-300/60 text-slate-600'
                    }`}
                  >
                    {matchCounts.active}
                  </span>
                </button>

                {/* Withdrawn Students Filter */}
                <button
                  type="button"
                  id="search-filter-withdrawn"
                  onClick={() => setStatusFilter('withdrawn')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'withdrawn'
                      ? 'bg-white text-amber-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Withdrawn Students</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      statusFilter === 'withdrawn'
                        ? 'bg-amber-100/80 text-amber-800 font-bold'
                        : 'bg-slate-300/60 text-slate-600'
                    }`}
                  >
                    {matchCounts.withdrawn}
                  </span>
                </button>

                {/* All Students Filter */}
                <button
                  type="button"
                  id="search-filter-all"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>All</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      statusFilter === 'all'
                        ? 'bg-slate-200 text-slate-800 font-bold'
                        : 'bg-slate-300/60 text-slate-600'
                    }`}
                  >
                    {matchCounts.all}
                  </span>
                </button>
              </div>

              {/* Active Filter Hint */}
              <div className="hidden sm:block text-[10px] text-slate-400 font-medium">
                {statusFilter === 'active' && 'Filtering active students only'}
                {statusFilter === 'withdrawn' && 'Filtering withdrawn/inactive students'}
                {statusFilter === 'all' && 'Showing all student records'}
              </div>
            </div>

            {/* Results List */}
            <div ref={resultsContainerRef} className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-1">
              {activeItems.length > 0 ? (
                activeItems.map((student, idx) => {
                  const isSelected = selectedIndex === idx;
                  const className = classMap.get(student.classId) || 'Unassigned';

                  return (
                    <div
                      key={student.id}
                      onClick={() => handleSelectStudent(student)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`group p-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition ${
                        isSelected ? 'bg-teal-50/70 text-slate-900' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      {/* Left: Avatar + Details */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <StudentAvatar
                          name={student.name}
                          photoUrl={student.photoUrl}
                          gender={student.gender}
                          size="md"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate group-hover:text-teal-900">
                              {student.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                              Roll #{student.regNo}
                            </span>
                            {getStatusBadge(student.status)}
                          </div>

                          <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              <GraduationCap className="w-3 h-3 text-teal-600" />
                              {className}
                            </span>
                            <span className="truncate">
                              S/O {student.fatherName}
                            </span>
                            {student.fatherPhone && (
                              <span className="hidden sm:inline-flex items-center gap-1 font-mono text-slate-400">
                                <Phone className="w-2.5 h-2.5" />
                                {student.fatherPhone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Jump to Fee Ledger */}
                        {onNavigateToLedger && (
                          <button
                            type="button"
                            title="View Fee Ledger"
                            onClick={(e) => {
                              e.stopPropagation();
                              recordRecentStudent(student.id);
                              setIsOpen(false);
                              onNavigateToLedger(student.id);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-teal-50 hover:border-teal-300 text-slate-600 hover:text-teal-800 transition cursor-pointer text-[10px] font-bold flex items-center gap-1"
                          >
                            <CreditCard className="w-3 h-3 text-teal-600" />
                            <span className="hidden md:inline">Ledger</span>
                          </button>
                        )}

                        {/* View Profile Direct Action */}
                        <div className="p-1.5 rounded-lg bg-teal-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs group-hover:bg-teal-700 transition">
                          <User className="w-3 h-3" />
                          <span className="hidden sm:inline">Profile</span>
                          <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : query.trim() ? (
                /* Empty state when query has no results */
                <div className="py-8 px-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">No matching students found</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    No student record matched &quot;<strong className="text-slate-800">{query}</strong>&quot;
                    {statusFilter !== 'all' ? ` under ${statusFilter === 'active' ? 'Active' : 'Withdrawn'} filter.` : '.'}
                  </p>
                  {statusFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition"
                    >
                      <span>Show results across All students ({matchCounts.all})</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Empty state when no query and no recents */
                <div className="py-6 px-4 text-center space-y-1.5 text-slate-400">
                  <Sparkles className="w-5 h-5 mx-auto text-teal-500" />
                  <p className="text-xs font-medium text-slate-600">Quick Student Search</p>
                  <p className="text-[11px] text-slate-400">
                    Type a student&apos;s name, roll number (e.g. 101), father&apos;s name, or class to jump to their profile.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {onNavigateToStudents && (
              <div className="px-3.5 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onNavigateToStudents();
                  }}
                  className="font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer transition"
                >
                  <span>Open Full Students Directory ({students.length} students)</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-slate-400">Tip: Press &apos;/&apos; anytime to search</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student Profile / Detail Modal */}
      {profileStudent && (
        <StudentDetailModal
          student={profileStudent}
          onClose={() => setProfileStudent(null)}
          onEdit={(st) => {
            setProfileStudent(null);
            if (hasPermission('students.manage')) {
              setEditingStudent(st);
            } else {
              showToast('You do not have permission to edit students.', 'warning');
            }
          }}
          onViewLedger={(studentId) => {
            setProfileStudent(null);
            if (onNavigateToLedger) {
              onNavigateToLedger(studentId);
            }
          }}
        />
      )}

      {/* Student Edit Form Modal */}
      {editingStudent && (
        <StudentFormModal
          student={editingStudent}
          onClose={() => setEditingStudent(null)}
          onSuccess={() => {
            setEditingStudent(null);
            showToast('Student profile updated successfully', 'success');
          }}
        />
      )}
    </>
  );
};
