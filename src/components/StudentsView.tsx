import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Student, StudentStatus } from '../types';
import { formatCurrency, formatStudentAge, calculateAge, normalizeDateToISO } from '../utils/feeMath';
import { parseCsvLine, downloadCsv } from '../utils/csv';
import { StudentAvatar } from './StudentAvatar';
import { StudentFeeLedger } from './StudentFeeLedger';
import { StudentFormModal } from './StudentFormModal';
import { StudentDetailModal } from './StudentDetailModal';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';
import { RecordsPerPageSelector } from './RecordsPerPageSelector';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  History,
  Search,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface PreviewRow {
  id: string;
  selected: boolean;
  regNo: string;
  name: string;
  admissionDate?: string;
  firstBillingMonth?: string;
  rawClassName: string;
  classId: string;
  gender?: 'Male' | 'Female' | '';
  dob: string;
  fatherName: string;
  fatherCnic: string;
  fatherPhone: string;
  fatherOccupation: string;
  motherName: string;
  motherCnic?: string;
  motherPhone: string;
  monthlyDiscount: number;
  mobileNumber?: string;
  bFormNo?: string;
  address?: string;
  isValid: boolean;
  isDuplicate: boolean;
  hasCaution?: boolean;
  classUnresolved?: boolean;
  validationMessage: string;
  duplicateReason?: string;
}

// Normalizes diverse month strings into standard YYYY-MM
const normalizeMonthToYYYYMM = (val: string): string => {
  const trimmed = val.trim();
  if (!trimmed) return '';
  const yyyymm = trimmed.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (yyyymm) {
    const y = parseInt(yyyymm[1], 10);
    const m = parseInt(yyyymm[2], 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  const mmyyyy = trimmed.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (mmyyyy) {
    const m = parseInt(mmyyyy[1], 10);
    const y = parseInt(mmyyyy[2], 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
  const fullDate = normalizeDateToISO(trimmed);
  if (fullDate && fullDate.length >= 7) {
    return fullDate.substring(0, 7);
  }
  return trimmed;
};

interface StudentsViewProps {
  onNavigateToLedger?: (studentId: string) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({ onNavigateToLedger }) => {
  const {
    students,
    classes,
    families,
    deleteStudent,
    hasPermission,
    addStudent,
    showToast,
  } = useApp();

  // Helper to strictly evaluate row validity matching Student Registration Modal requirements
  const evaluateRowValidation = (r: {
    name?: string;
    admissionDate?: string;
    firstBillingMonth?: string;
    classId?: string;
    rawClassName?: string;
    fatherName?: string;
    fatherCnic?: string;
    fatherPhone?: string;
    monthlyDiscount?: number;
    isDuplicate?: boolean;
    duplicateReason?: string;
  }): { isValid: boolean; validationMessage: string; classUnresolved: boolean } => {
    if (r.isDuplicate) {
      return {
        isValid: false,
        validationMessage: r.duplicateReason || 'Duplicate Reg #',
        classUnresolved: false,
      };
    }

    const missing: string[] = [];
    if (!r.name?.trim()) missing.push('Student Name');
    if (!r.admissionDate?.trim()) missing.push('Admission Date');
    if (!r.firstBillingMonth?.trim()) missing.push('First Billing Month');
    if (!r.fatherName?.trim()) missing.push('Father Name');
    if (!r.fatherCnic?.trim()) missing.push('Father CNIC');
    if (!r.fatherPhone?.trim()) missing.push('Father Phone');
    if (r.monthlyDiscount === undefined || isNaN(r.monthlyDiscount) || r.monthlyDiscount < 0) {
      missing.push('Discount in Fee');
    }

    const cls = classes.find((c) => c.id === r.classId);
    const classMissing = !r.classId || !cls;

    if (missing.length > 0 && classMissing) {
      return {
        isValid: false,
        validationMessage: `Missing: ${missing.join(', ')} & Class unassigned`,
        classUnresolved: true,
      };
    }

    if (classMissing) {
      return {
        isValid: false,
        validationMessage: `Class "${r.rawClassName || 'None'}" not found - assign below`,
        classUnresolved: true,
      };
    }

    if (missing.length > 0) {
      return {
        isValid: false,
        validationMessage: `Missing: ${missing.join(', ')}`,
        classUnresolved: false,
      };
    }

    return {
      isValid: true,
      validationMessage: 'Valid',
      classUnresolved: false,
    };
  };

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Sorting state (default regNo ascending)
  const [sortField, setSortField] = useState<'regNo' | 'name' | 'class' | 'father' | 'family' | 'status'>('regNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Copy feedback state
  const [copied, setCopied] = useState(false);

  // Fee Ledger Modal state
  const [viewLedgerStudentId, setViewLedgerStudentId] = useState<string | null>(null);

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'issues' | 'caution' | 'invalid' | 'duplicates' | 'valid'>('all');
  const [importStatus, setImportStatus] = useState<{
    message: string | null;
    error: string | null;
  }>({ message: null, error: null });

  useEscapeKey(() => {
    if (viewLedgerStudentId) {
      setViewLedgerStudentId(null);
    } else if (showImportModal) {
      setShowImportModal(false);
      setPreviewRows([]);
    } else if (studentToDelete || isBulkDeleting) {
      setStudentToDelete(null);
      setIsBulkDeleting(false);
    } else if (editingStudent) {
      setEditingStudent(null);
    } else if (detailStudent) {
      setDetailStudent(null);
    } else if (showFormModal) {
      setShowFormModal(false);
    }
  }, !!(
    viewLedgerStudentId ||
    showImportModal ||
    studentToDelete ||
    isBulkDeleting ||
    editingStudent ||
    detailStudent ||
    showFormModal
  ));

  // Filter students
  const filteredStudents = students.filter((s) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(term) ||
      s.regNo.toLowerCase().includes(term) ||
      s.fatherName.toLowerCase().includes(term) ||
      (s.fatherCnic && s.fatherCnic.includes(searchTerm)) ||
      (s.bFormNo && s.bFormNo.toLowerCase().includes(term)) ||
      (s.mobileNumber && s.mobileNumber.includes(searchTerm));

    const matchesClass = selectedClassId === 'all' || s.classId === selectedClassId;
    const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;

    return matchesSearch && matchesClass && matchesStatus;
  });

  // Sort students
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let primaryCompare = 0;

    switch (sortField) {
      case 'regNo':
        primaryCompare = a.regNo.localeCompare(b.regNo, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        return sortDirection === 'asc' ? primaryCompare : -primaryCompare;

      case 'name':
        primaryCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        break;

      case 'class': {
        const clsA = classes.find((c) => c.id === a.classId);
        const clsB = classes.find((c) => c.id === b.classId);
        const nameA = clsA ? clsA.name : '';
        const nameB = clsB ? clsB.name : '';
        primaryCompare = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        break;
      }

      case 'father':
        primaryCompare = a.fatherName.localeCompare(b.fatherName, undefined, {
          sensitivity: 'base',
        });
        break;

      case 'family': {
        const famA = families.find((f) => f.id === a.familyId);
        const famB = families.find((f) => f.id === b.familyId);
        const codeA = famA ? famA.familyNo : 'ZZZZ';
        const codeB = famB ? famB.familyNo : 'ZZZZ';
        primaryCompare = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
        break;
      }

      case 'status':
        primaryCompare = a.status.localeCompare(b.status);
        break;
    }

    if (primaryCompare !== 0) {
      return sortDirection === 'asc' ? primaryCompare : -primaryCompare;
    }

    // Secondary fallback: sort by Reg #
    return a.regNo.localeCompare(b.regNo, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Handle Sort Header Click
  const handleSort = (field: 'regNo' | 'name' | 'class' | 'father' | 'family' | 'status') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedStudents = sortedStudents.slice(startIndex, startIndex + itemsPerPage);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const pageIds = paginatedStudents.map((s) => s.id);
    const allPageSelected =
      pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleBulkDelete = () => {
    setIsBulkDeleting(true);
  };

  const handleDelete = (student: Student) => {
    setStudentToDelete(student);
  };

  const handleConfirmSingleDelete = (id: string) => {
    deleteStudent(id);
    setStudentToDelete(null);
  };

  const handleConfirmBulkDelete = (idsToDelete: string[]) => {
    idsToDelete.forEach((id) => deleteStudent(id));
    setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
    setIsBulkDeleting(false);
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Registration No.',
      'Student Name',
      'Date of Admission',
      'First Billing Month',
      'Class',
      'Monthly Tuition Fee',
      'Monthly Discount',
      'Net Monthly Fee',
      'Status',
      'Gender',
      'Date of Birth',
      'Calculated Age',
      'Student CNIC / B-Form',
      'Mobile Number',
      'Father Name',
      'Father CNIC',
      'Father Mobile',
      'Mother Name',
      'Mother CNIC',
      'Mother Mobile',
      'Family No.',
      'Residential Address',
      'Documents Attached',
      'Other Notes',
    ];

    const rows = sortedStudents.map((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      const fam = families.find((f) => f.id === s.familyId);
      const tuition = cls ? cls.monthlyFee : 0;
      const discount = s.monthlyDiscount || 0;
      const netFee = Math.max(0, tuition - discount);
      const docCount = [s.document1, s.document2, s.document3].filter((d) => d?.fileData || d?.name).length;
      const ageObj = calculateAge(s.dob);
      const ageStr = ageObj ? ageObj.fullText : '';

      return [
        `"${s.regNo}"`,
        `"${s.name.replace(/"/g, '""')}"`,
        `"${s.admissionDate || ''}"`,
        `"${s.firstBillingMonth || ''}"`,
        `"${cls ? cls.name : 'Unassigned'}"`,
        tuition,
        discount,
        netFee,
        `"${s.status}"`,
        `"${s.gender}"`,
        `"${s.dob}"`,
        `"${ageStr}"`,
        `"${s.bFormNo || ''}"`,
        `"${s.mobileNumber || ''}"`,
        `"${s.fatherName.replace(/"/g, '""')}"`,
        `"${s.fatherCnic}"`,
        `"${s.fatherPhone}"`,
        `"${s.motherName || ''}"`,
        `"${s.motherCnic || ''}"`,
        `"${s.motherPhone || ''}"`,
        `"${fam ? fam.familyNo : ''}"`,
        `"${(s.address || '').replace(/"/g, '""')}"`,
        docCount,
        `"${(s.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    downloadCsv(
      `Skooler_Student_Directory_${new Date().toISOString().split('T')[0]}.csv`,
      [headers.join(','), ...rows].join('\n')
    );
  };

  // Copy student list to clipboard
  const handleCopyToClipboard = async () => {
    const headers = [
      'Reg #',
      'Student Name',
      'Admission Date',
      'First Billing Month',
      'Class',
      'Monthly Fee',
      'Discount',
      'Net Fee',
      'Status',
      'Gender',
      'DOB',
      'Age',
      'B-Form / CNIC',
      'Mobile',
      'Father Name',
      'Father CNIC',
      'Father Mobile',
      'Mother Name',
      'Family #',
      'Address',
    ];

    const rows = sortedStudents.map((s) => {
      const cls = classes.find((c) => c.id === s.classId);
      const fam = families.find((f) => f.id === s.familyId);
      const tuition = cls ? cls.monthlyFee : 0;
      const discount = s.monthlyDiscount || 0;
      const netFee = Math.max(0, tuition - discount);
      const ageStr = formatStudentAge(s.dob, 'short');

      return [
        s.regNo,
        s.name,
        s.admissionDate || '',
        s.firstBillingMonth || '',
        cls ? cls.name : 'Unassigned',
        tuition,
        discount,
        netFee,
        s.status,
        s.gender,
        s.dob,
        ageStr,
        s.bFormNo || '',
        s.mobileNumber || '',
        s.fatherName,
        s.fatherCnic,
        s.fatherPhone,
        s.motherName || '',
        fam ? fam.familyNo : '',
        s.address || '',
      ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsvContent);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = tsvContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      showToast('Failed to copy table data.', 'error');
    }
  };

  // CSV Import parsing
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ message: null, error: null });
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setImportStatus({ message: null, error: 'The uploaded file is empty.' });
          return;
        }

        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length <= 1) {
          setImportStatus({
            message: null,
            error: 'CSV must contain a header row and at least one data record.',
          });
          return;
        }

        const headerLine = lines[0].toLowerCase();
        const headerTokens = headerLine.split(',').map((h) => h.replace(/["'\s_]/g, ''));

        const colMap = {
          regNo: headerTokens.findIndex((h) => h.includes('reg') || h.includes('id') || h.includes('roll')),
          name: headerTokens.findIndex((h) => h.includes('name') && !h.includes('father') && !h.includes('mother')),
          admissionDate: headerTokens.findIndex((h) => h.includes('admission') || h.includes('enrolled') || h.includes('admdate')),
          firstBillingMonth: headerTokens.findIndex((h) => h.includes('firstbilling') || h.includes('billingmonth') || h.includes('billingstart') || h.includes('startmonth')),
          class: headerTokens.findIndex((h) => h.includes('class') || h.includes('grade')),
          gender: headerTokens.findIndex((h) => h.includes('gender') || h.includes('sex')),
          dob: headerTokens.findIndex((h) => h.includes('dob') || h.includes('birth')),
          bform: headerTokens.findIndex((h) => h.includes('bform') || h.includes('birthform') || h.includes('studentcnic')),
          mobile: headerTokens.findIndex((h) => (h.includes('studentmobile') || h.includes('studentphone') || h.includes('studentcell') || h.includes('mobile') || h.includes('cell') || h.includes('contact')) && !h.includes('father') && !h.includes('mother')),
          address: headerTokens.findIndex((h) => h.includes('address') || h.includes('residence')),
          fatherName: headerTokens.findIndex((h) => h.includes('fathername') || h.includes('guardianname') || (h.includes('father') && !h.includes('phone') && !h.includes('cnic') && !h.includes('mobile'))),
          fatherCnic: headerTokens.findIndex((h) => h.includes('fathercnic') || (h.includes('father') && h.includes('cnic'))),
          fatherPhone: headerTokens.findIndex((h) => h.includes('fatherphone') || h.includes('fathermobile') || (h.includes('father') && (h.includes('phone') || h.includes('mobile') || h.includes('cell')))),
          fatherOccupation: headerTokens.findIndex((h) => h.includes('occupation') || h.includes('profession')),
          motherName: headerTokens.findIndex((h) => h.includes('mothername') || (h.includes('mother') && !h.includes('phone') && !h.includes('cnic') && !h.includes('mobile'))),
          motherCnic: headerTokens.findIndex((h) => h.includes('mothercnic') || (h.includes('mother') && h.includes('cnic'))),
          motherPhone: headerTokens.findIndex((h) => h.includes('motherphone') || h.includes('mothermobile') || (h.includes('mother') && (h.includes('phone') || h.includes('mobile') || h.includes('cell')))),
          discount: headerTokens.findIndex((h) => h.includes('discount') || h.includes('concession') || h.includes('scholarship')),
        };

        // Requirement 3: Match mandatory fields in student import CSV with those in add/edit student modal
        const requiredHeaderDefs: { key: keyof typeof colMap; label: string }[] = [
          { key: 'name', label: 'Name' },
          { key: 'admissionDate', label: 'AdmissionDate' },
          { key: 'firstBillingMonth', label: 'FirstBillingMonth' },
          { key: 'class', label: 'Class' },
          { key: 'fatherName', label: 'FatherName' },
          { key: 'fatherCnic', label: 'FatherCnic' },
          { key: 'fatherPhone', label: 'FatherPhone' },
          { key: 'discount', label: 'MonthlyDiscount (or Discount)' },
        ];

        const missingHeaders = requiredHeaderDefs
          .filter((def) => colMap[def.key] === -1)
          .map((def) => def.label);

        if (missingHeaders.length > 0) {
          setImportStatus({
            message: null,
            error: `Missing required column(s) in CSV header: ${missingHeaders.join(', ')}. All mandatory columns matching the Student Registration Form (Name, AdmissionDate, FirstBillingMonth, Class, FatherName, FatherCnic, FatherPhone, MonthlyDiscount) must be present in the header.`,
          });
          return;
        }

        const parsedList: PreviewRow[] = [];
        const seenRegInFile = new Map<string, string>();
        const seenBFormInFile = new Map<string, string>();

        for (let i = 1; i < lines.length; i++) {
          const row = parseCsvLine(lines[i]);
          if (row.length === 0 || row.every((c) => c === '')) continue;

          const rawRegNo = colMap.regNo !== -1 ? (row[colMap.regNo] || '').trim() : '';
          const name = colMap.name !== -1 ? (row[colMap.name] || '').trim() : '';
          const rawAdmDate = colMap.admissionDate !== -1 ? (row[colMap.admissionDate] || '').trim() : '';
          const admissionDate = normalizeDateToISO(rawAdmDate) || rawAdmDate.trim();
          const rawFirstBillingMonth = colMap.firstBillingMonth !== -1 ? (row[colMap.firstBillingMonth] || '').trim() : '';
          const firstBillingMonth = normalizeMonthToYYYYMM(rawFirstBillingMonth);

          const rawClassName = colMap.class !== -1 ? (row[colMap.class] || '').trim() : '';
          const rawGender = colMap.gender !== -1 ? (row[colMap.gender] || '').trim() : '';
          const rawDob = colMap.dob !== -1 && row[colMap.dob] ? row[colMap.dob] : '';
          const dob = normalizeDateToISO(rawDob) || rawDob.trim();
          const bFormNo = colMap.bform !== -1 ? (row[colMap.bform] || '').trim() : '';
          const mobileNumber = colMap.mobile !== -1 ? (row[colMap.mobile] || '').trim() : '';
          const address = colMap.address !== -1 ? (row[colMap.address] || '').trim() : '';
          const fatherName = colMap.fatherName !== -1 ? (row[colMap.fatherName] || '').trim() : '';
          const fatherCnic = colMap.fatherCnic !== -1 ? (row[colMap.fatherCnic] || '').trim() : '';
          const fatherPhone = colMap.fatherPhone !== -1 ? (row[colMap.fatherPhone] || '').trim() : '';
          const fatherOccupation = colMap.fatherOccupation !== -1 ? (row[colMap.fatherOccupation] || '').trim() : '';
          const motherName = colMap.motherName !== -1 ? (row[colMap.motherName] || '').trim() : '';
          const motherCnic = colMap.motherCnic !== -1 ? (row[colMap.motherCnic] || '').trim() : '';
          const motherPhone = colMap.motherPhone !== -1 ? (row[colMap.motherPhone] || '').trim() : '';
          const rawDiscount = colMap.discount !== -1 ? (row[colMap.discount] || '').trim() : '';
          const parsedDiscount = parseInt(rawDiscount.replace(/[^\d.-]/g, ''), 10);
          const monthlyDiscount = !isNaN(parsedDiscount) ? Math.max(0, parsedDiscount) : (rawDiscount === '' ? NaN : 0);

          // Requirement 4: No default gender in import CSV parsing
          let gender: 'Male' | 'Female' | '' = '';
          if (/^(female|f|girl|woman)$/i.test(rawGender)) {
            gender = 'Female';
          } else if (/^(male|m|boy|man)$/i.test(rawGender)) {
            gender = 'Male';
          } else {
            gender = '';
          }

          const trimmedRawClass = rawClassName.trim();
          const normalizedRawClass = trimmedRawClass.toLowerCase();

          // Exact match only by class name or class ID (case-insensitive)
          const matchedClass = trimmedRawClass
            ? classes.find(
                (c) =>
                  c.name.trim().toLowerCase() === normalizedRawClass ||
                  c.id.trim().toLowerCase() === normalizedRawClass
              )
            : undefined;

          let isDuplicate = false;
          let duplicateReason: string | undefined = undefined;

          if (rawRegNo) {
            const regLower = rawRegNo.toLowerCase();
            const existsInDb = students.find((s) => s.regNo.toLowerCase() === regLower);
            const existsInFileStudent = seenRegInFile.get(regLower);

            if (existsInDb) {
              isDuplicate = true;
              const existingLabel = [existsInDb.regNo, existsInDb.name].filter(Boolean).join(' ');
              duplicateReason = `Reg # "${rawRegNo}" already exists in system with '${existingLabel}'`;
            } else if (existsInFileStudent) {
              isDuplicate = true;
              duplicateReason = `Reg # "${rawRegNo}" duplicated in CSV with '${existsInFileStudent}'`;
            } else {
              const fileStudentLabel = [rawRegNo, name].filter(Boolean).join(' ') || `Row ${i}`;
              seenRegInFile.set(regLower, fileStudentLabel);
            }
          }

          // Pre-validate B-Form duplicates against existing students and earlier rows in file
          if (!isDuplicate && bFormNo && bFormNo.trim() !== '') {
            const bFormClean = bFormNo.trim().toLowerCase();
            const existsInDb = students.find(
              (s) => s.bFormNo && s.bFormNo.trim().toLowerCase() === bFormClean
            );
            const existsInFileStudent = seenBFormInFile.get(bFormClean);

            if (existsInDb) {
              isDuplicate = true;
              const existingLabel = [existsInDb.regNo, existsInDb.name].filter(Boolean).join(' ');
              duplicateReason = `B-Form "${bFormNo}" already exists in system with '${existingLabel}'`;
            } else if (existsInFileStudent) {
              isDuplicate = true;
              duplicateReason = `B-Form "${bFormNo}" duplicated in CSV with '${existsInFileStudent}'`;
            } else {
              const fileStudentLabel = [rawRegNo, name].filter(Boolean).join(' ') || `Row ${i}`;
              seenBFormInFile.set(bFormClean, fileStudentLabel);
            }
          }

          // Strictly evaluate against all mandatory fields matching the student add modal
          const evalRes = evaluateRowValidation({
            name,
            admissionDate,
            firstBillingMonth,
            classId: matchedClass ? matchedClass.id : '',
            rawClassName,
            fatherName,
            fatherCnic,
            fatherPhone,
            monthlyDiscount: isNaN(monthlyDiscount) ? -1 : monthlyDiscount,
            isDuplicate,
            duplicateReason,
          });

          parsedList.push({
            id: `import-${i}-${Date.now()}`,
            selected: evalRes.isValid && !isDuplicate,
            regNo: rawRegNo,
            name,
            admissionDate: admissionDate || undefined,
            firstBillingMonth: firstBillingMonth || undefined,
            rawClassName,
            classId: matchedClass ? matchedClass.id : '',
            gender,
            dob,
            bFormNo,
            mobileNumber,
            address,
            fatherName,
            fatherCnic,
            fatherPhone,
            fatherOccupation,
            motherName,
            motherCnic,
            motherPhone,
            monthlyDiscount: isNaN(monthlyDiscount) ? 0 : monthlyDiscount,
            isValid: evalRes.isValid,
            isDuplicate,
            hasCaution: false,
            classUnresolved: evalRes.classUnresolved,
            validationMessage: evalRes.validationMessage,
            duplicateReason,
          });
        }

        if (parsedList.length === 0) {
          setImportStatus({ message: null, error: 'No data rows found in CSV file.' });
          return;
        }

        setPreviewRows(parsedList);
        if (e.target) e.target.value = '';
      } catch (err) {
        setImportStatus({
          message: null,
          error: 'An error occurred while reading the CSV file.',
        });
      }
    };

    reader.readAsText(file);
  };

  const handleTogglePreviewSelectAll = () => {
    const visibleValidRows = displayedPreviewRows.filter((r) => r.isValid && !r.isDuplicate);
    if (visibleValidRows.length === 0) return;
    const allVisibleSelected = visibleValidRows.every((r) => r.selected);
    const visibleIds = new Set(visibleValidRows.map((r) => r.id));
    setPreviewRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, selected: !allVisibleSelected } : r))
    );
  };

  // Preview filtering computations
  const previewCounts = useMemo(() => {
    const total = previewRows.length;
    const selected = previewRows.filter((r) => r.selected && r.isValid && !r.isDuplicate).length;
    const duplicates = previewRows.filter((r) => r.isDuplicate).length;
    const invalid = previewRows.filter((r) => !r.isValid && !r.isDuplicate).length;
    const caution = previewRows.filter((r) => r.hasCaution && r.isValid && !r.isDuplicate).length;
    const issues = previewRows.filter((r) => !r.isValid || r.isDuplicate || r.hasCaution).length;
    const valid = previewRows.filter((r) => r.isValid && !r.isDuplicate).length;
    return { total, selected, duplicates, invalid, caution, issues, valid };
  }, [previewRows]);

  const displayedPreviewRows = useMemo(() => {
    return previewRows.filter((r) => {
      if (previewFilter === 'all') return true;
      if (previewFilter === 'issues') return !r.isValid || r.isDuplicate || r.hasCaution;
      if (previewFilter === 'caution') return r.hasCaution && r.isValid && !r.isDuplicate;
      if (previewFilter === 'invalid') return !r.isValid && !r.isDuplicate;
      if (previewFilter === 'duplicates') return r.isDuplicate;
      if (previewFilter === 'valid') return r.isValid && !r.isDuplicate;
      return true;
    });
  }, [previewRows, previewFilter]);

  const handleTogglePreviewRow = (id: string) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.id === id && r.isValid && !r.isDuplicate ? { ...r, selected: !r.selected } : r))
    );
  };


  const handleConfirmImport = () => {
    const rowsToImport = previewRows.filter((r) => r.selected && r.isValid && !r.isDuplicate);
    if (rowsToImport.length === 0) {
      setImportStatus({
        message: null,
        error: 'No valid students selected for import.',
      });
      return;
    }

    let importedCount = 0;
    let errorCount = 0;

    for (const r of rowsToImport) {
      const res = addStudent({
        regNo: r.regNo || undefined,
        name: r.name,
        admissionDate: r.admissionDate,
        firstBillingMonth: r.firstBillingMonth,
        classId: r.classId,
        gender: r.gender ? r.gender : undefined,
        dob: r.dob,
        bFormNo: r.bFormNo,
        mobileNumber: r.mobileNumber || undefined,
        address: r.address,
        fatherName: r.fatherName,
        fatherCnic: r.fatherCnic,
        fatherPhone: r.fatherPhone || '',
        fatherOccupation: r.fatherOccupation,
        motherName: r.motherName,
        motherCnic: r.motherCnic,
        motherPhone: r.motherPhone || '',
        status: 'Active',
        monthlyDiscount: r.monthlyDiscount,
      });

      if (res.success) {
        importedCount++;
      } else {
        errorCount++;
      }
    }

    setPreviewRows([]);
    setImportStatus({
      message: `Successfully imported ${importedCount} student(s) into the system!${
        errorCount > 0 ? ` (${errorCount} failed)` : ''
      }`,
      error: null,
    });
  };

  // Download Sample CSV
  const handleDownloadSampleCsv = () => {
    const sampleCsv = `RegNo,Name,AdmissionDate,FirstBillingMonth,Class,Gender,DOB,BForm,StudentMobile,Address,FatherName,FatherCnic,FatherPhone,MotherName,MotherCnic,MotherPhone,MonthlyDiscount
REG-1007,Ali Raza,2024-03-01,2024-03,Class 1,Male,2017-05-12,37405-1234567-1,+92 300 1234567,"House 12, Sector F-8, Islamabad",Raza Ahmed,37405-1234567-1,+92 300 1234567,Saima Raza,37405-7654321-1,+92 301 7654321,500
REG-1008,Amina Fatima,2024-03-01,2024-03,Class 2,Female,2016-08-20,37405-7654321-2,+92 300 7654321,"House 45, Street 9, Rawalpindi",Fatima Ullah,37405-7654321-2,+92 300 7654322,Noreen Fatima,37405-9988776-2,+92 301 1234567,0`;

    downloadCsv('Skooler_Sample_Student_Import.csv', sampleCsv);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            Student Records Directory
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage 5-section student profiles, documents, parents information, class enrollments, and fee concessions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasPermission('students.manage') && (
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                id="btn-register-new-student"
                onClick={() => {
                  setEditingStudent(null);
                  setShowFormModal(true);
                }}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Register New Student
              </button>
              <button
                type="button"
                id="btn-students-import-csv"
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer border border-slate-200 shadow-xs"
                title="Import student roster from CSV"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                Import CSV
              </button>
            </div>
          )}

          <button
            type="button"
            id="btn-students-export-csv"
            onClick={handleExportCsv}
            disabled={sortedStudents.length === 0}
            title={sortedStudents.length === 0 ? 'No student records to export' : 'Export student roster to CSV'}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Export CSV
          </button>

          <button
            type="button"
            id="btn-students-copy-clipboard"
            onClick={handleCopyToClipboard}
            disabled={sortedStudents.length === 0}
            title={sortedStudents.length === 0 ? 'No student records to copy' : 'Copy student roster to clipboard (pasteable into Excel/Sheets)'}
            className={`flex items-center gap-2 font-semibold px-3.5 py-2 rounded-xl text-xs transition border disabled:opacity-40 disabled:cursor-not-allowed ${
              sortedStudents.length === 0
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : copied
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 cursor-pointer'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200 cursor-pointer'
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
                <span>Copy to Clipboard</span>
              </>
            )}
          </button>

          {selectedIds.length > 0 && hasPermission('students.manage') && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by student name, reg #, father name, CNIC, mobile, B-Form..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        {/* Class Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Class:</span>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <span className="text-slate-500 font-medium">Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Withdrawn">Withdrawn</option>
            <option value="Graduated">Graduated</option>
            <option value="Inactive">Inactive</option>
            <option value="AutoDeactivated">Auto-Deactivated</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider select-none">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      paginatedStudents.length > 0 &&
                      paginatedStudents.every((s) => selectedIds.includes(s.id))
                    }
                    onChange={toggleSelectAll}
                    className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSort('regNo')}
                  className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'regNo' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Registration Number"
                >
                  <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <span>Reg #</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'regNo' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-100/80 ${
                    sortField === 'name' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Student Name"
                >
                  <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <span>Student Profile</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('class')}
                  className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'class' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Class"
                >
                  <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <span>Class</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'class' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('father')}
                  className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-100/80 ${
                    sortField === 'father' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Father Name"
                >
                  <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <span>Father / Guardian</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'father' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('family')}
                  className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'family' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Family"
                >
                  <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <span>Family</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'family' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className={`p-3 cursor-pointer select-none transition-colors hover:bg-slate-100/80 whitespace-nowrap ${
                    sortField === 'status' ? 'text-teal-700 bg-teal-50/50' : 'text-slate-600'
                  }`}
                  title="Sort by Status"
                >
                  <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <span>Status</span>
                    <span className="w-4 h-4 inline-flex items-center justify-center shrink-0">
                      {sortField === 'status' ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-teal-600" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-teal-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                      )}
                    </span>
                  </div>
                </th>
                <th className="p-3 w-20 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedStudents.length > 0 ? (
                paginatedStudents.map((s) => {
                  const cls = classes.find((c) => c.id === s.classId);
                  const fam = families.find((f) => f.id === s.familyId);
                  const isSelected = selectedIds.includes(s.id);

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(s.id)}
                          className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-bold text-xs">
                          {s.regNo}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5 min-w-[170px]">
                          <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="sm" />
                          <div className="min-w-0">
                            <button
                              onClick={() => setDetailStudent(s)}
                              className="font-bold text-slate-900 hover:text-teal-600 hover:underline text-left cursor-pointer truncate max-w-[150px] block"
                            >
                              {s.name}
                            </button>
                            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                              {s.gender && (
                                <>
                                  <span>{s.gender}</span>
                                  <span>&bull;</span>
                                </>
                              )}
                              <span>{s.dob || 'DOB N/A'}</span>
                              {s.dob && (
                                <span className="font-semibold text-teal-700 bg-teal-50 border border-teal-200/60 px-1 py-0.2 rounded text-[10px]" title={`Calculated Age: ${calculateAge(s.dob)?.fullText || ''}`}>
                                  {formatStudentAge(s.dob)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                          {cls?.name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="min-w-[140px]">
                          <span className="font-semibold text-slate-900 block truncate">{s.fatherName}</span>
                          <span className="text-[11px] text-slate-500 block truncate">
                            Ph: {s.fatherPhone || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {fam ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded">
                            <FolderKanban className="w-3 h-3 shrink-0" />
                            {fam.familyNo}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">&mdash;</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            s.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : s.status === 'Graduated'
                              ? 'bg-indigo-100 text-indigo-800'
                              : s.status === 'Withdrawn'
                              ? 'bg-rose-100 text-rose-800'
                              : s.status === 'AutoDeactivated'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <div className="grid grid-cols-2 gap-1 w-fit mx-auto">
                          <button
                            onClick={() => {
                              if (onNavigateToLedger) {
                                onNavigateToLedger(s.id);
                              } else {
                                setViewLedgerStudentId(s.id);
                              }
                            }}
                            title="View Fee Collections & Ledger in Reports"
                            className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDetailStudent(s)}
                            title="View Full 5-Section Profile"
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5" />
                          </button>
                          {hasPermission('students.manage') ? (
                            <>
                              <button
                                onClick={() => {
                                  setEditingStudent(s);
                                  setShowFormModal(true);
                                }}
                                title="Edit Student"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(s)}
                                title="Delete Student"
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="w-6.5 h-6.5" />
                              <div className="w-6.5 h-6.5" />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                    No student records found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {sortedStudents.length > 0 && (
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <RecordsPerPageSelector
                value={itemsPerPage}
                onChange={(newSize) => {
                  setItemsPerPage(newSize);
                  setCurrentPage(1);
                }}
                totalRecords={sortedStudents.length}
                presetOptions={[25, 50, 100]}
                idPrefix="students-per-page"
              />
              <span className="text-slate-400">&bull;</span>
              <span>
                Total: <strong>{sortedStudents.length}</strong> students
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5-Section Add / Edit Student Modal */}
      {showFormModal && (
        <StudentFormModal
          student={editingStudent}
          onClose={() => {
            setShowFormModal(false);
            setEditingStudent(null);
          }}
          onSuccess={() => {
            setShowFormModal(false);
            setEditingStudent(null);
          }}
        />
      )}

      {/* 5-Section Student Detail Modal */}
      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          onClose={() => setDetailStudent(null)}
          onEdit={(s) => {
            setDetailStudent(null);
            setEditingStudent(s);
            setShowFormModal(true);
          }}
          onViewLedger={(id) => {
            setDetailStudent(null);
            if (onNavigateToLedger) {
              onNavigateToLedger(id);
            } else {
              setViewLedgerStudentId(id);
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {(studentToDelete || isBulkDeleting) && (
        <DeleteConfirmationModal
          student={studentToDelete}
          bulkStudents={
            isBulkDeleting ? students.filter((s) => selectedIds.includes(s.id)) : undefined
          }
          onClose={() => {
            setStudentToDelete(null);
            setIsBulkDeleting(false);
          }}
          onConfirmDelete={handleConfirmSingleDelete}
          onConfirmBulkDelete={handleConfirmBulkDelete}
          onViewLedger={(id) => {
            setStudentToDelete(null);
            setIsBulkDeleting(false);
            if (onNavigateToLedger) {
              onNavigateToLedger(id);
            } else {
              setViewLedgerStudentId(id);
            }
          }}
        />
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`bg-white rounded-2xl ${
              previewRows.length > 0 ? 'max-w-4xl' : 'max-w-md'
            } w-full p-6 shadow-2xl space-y-5 transition-all max-h-[90vh] flex flex-col`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                {previewRows.length > 0
                  ? 'Preview & Verify CSV Data'
                  : 'Import Students from CSV'}
              </h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setPreviewRows([]);
                  setImportStatus({ message: null, error: null });
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewRows.length === 0 ? (
              <div className="space-y-3 text-xs text-slate-600">
                <p>
                  Upload a CSV file with student records. First row must contain column headers.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleDownloadSampleCsv}
                    className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Download Sample CSV Format
                  </button>
                </div>

                {/* Status alerts */}
                {importStatus.message && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{importStatus.message}</span>
                  </div>
                )}
                {importStatus.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{importStatus.error}</span>
                  </div>
                )}

                {/* File Dropzone & Click Target */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-teal-300 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/60 rounded-xl p-6 text-center transition cursor-pointer group"
                >
                  <Upload className="w-8 h-8 text-teal-600 group-hover:scale-110 transition mx-auto mb-2" />
                  <span className="font-bold text-slate-800 block text-sm">
                    Click to select CSV File
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Supports standard comma-separated .csv files
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2 bg-slate-100 text-slate-600 rounded-md text-[11px] font-medium border border-slate-200">
                    <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Accepted Date formats: <strong>YYYY-MM-DD</strong> or <strong>DD/MM/YYYY</strong> (for Admission Date & DOB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse CSV File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvFileUpload}
                  />
                </div>
              </div>
            ) : (
              /* Preview View with Interactive Table */
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Compact Status & Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 text-xs shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer ${
                        previewFilter === 'all'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200 shadow-2xs'
                      }`}
                      title="Show all records"
                    >
                      <span className={previewFilter === 'all' ? 'text-slate-300 font-semibold text-[11px]' : 'text-slate-500 font-semibold text-[11px]'}>
                        Total Rows:
                      </span>
                      <span className="font-bold">{previewCounts.total}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter(previewFilter === 'valid' ? 'all' : 'valid')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer ${
                        previewFilter === 'valid'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200/80 shadow-2xs'
                      }`}
                      title="Filter valid records"
                    >
                      <span className={previewFilter === 'valid' ? 'text-emerald-100 font-semibold text-[11px]' : 'text-emerald-700 font-semibold text-[11px]'}>
                        Selected:
                      </span>
                      <span className="font-bold">{previewCounts.selected}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter(previewFilter === 'duplicates' ? 'all' : 'duplicates')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer ${
                        previewFilter === 'duplicates'
                          ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                          : previewCounts.duplicates > 0
                          ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border-rose-200/80 shadow-2xs ring-1 ring-rose-300/60'
                          : 'bg-rose-50/50 text-rose-700 hover:bg-rose-50 border-rose-200/50 shadow-2xs'
                      }`}
                      title="Show duplicate records"
                    >
                      <span className={previewFilter === 'duplicates' ? 'text-rose-100 font-semibold text-[11px]' : 'text-rose-700 font-semibold text-[11px]'}>
                        Duplicates:
                      </span>
                      <span className="font-bold">{previewCounts.duplicates}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter(previewFilter === 'invalid' ? 'all' : 'invalid')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer ${
                        previewFilter === 'invalid'
                          ? 'bg-rose-800 text-white border-rose-800 shadow-xs'
                          : previewCounts.invalid > 0
                          ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border-rose-200/80 shadow-2xs ring-1 ring-rose-300/60'
                          : 'bg-rose-50/50 text-rose-700 hover:bg-rose-50 border-rose-200/50 shadow-2xs'
                      }`}
                      title="Show invalid records"
                    >
                      <span className={previewFilter === 'invalid' ? 'text-rose-100 font-semibold text-[11px]' : 'text-rose-700 font-semibold text-[11px]'}>
                        Invalid:
                      </span>
                      <span className="font-bold">{previewCounts.invalid}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter(previewFilter === 'caution' ? 'all' : 'caution')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left transition cursor-pointer ${
                        previewFilter === 'caution'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : previewCounts.caution > 0
                          ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200/80 shadow-2xs ring-1 ring-amber-300/60'
                          : 'bg-amber-50/50 text-amber-700 hover:bg-amber-50 border-amber-200/50 shadow-2xs'
                      }`}
                      title="Show caution items"
                    >
                      <span className={previewFilter === 'caution' ? 'text-amber-100 font-semibold text-[11px]' : 'text-amber-700 font-semibold text-[11px]'}>
                        Caution:
                      </span>
                      <span className="font-bold">{previewCounts.caution}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleTogglePreviewSelectAll}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-teal-600" />
                      <span>Toggle Visible Valid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewRows([]);
                        setPreviewFilter('all');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg font-semibold text-xs transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload New File</span>
                    </button>
                  </div>
                </div>

                {/* Filter Selector Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                      Show Filter:
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                        previewFilter === 'all'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All ({previewCounts.total})
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('issues')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                        previewFilter === 'issues'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : previewCounts.issues > 0
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>Caution & Invalid ({previewCounts.issues})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('caution')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                        previewFilter === 'caution'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : previewCounts.caution > 0
                          ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <span>Caution Only ({previewCounts.caution})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('invalid')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                        previewFilter === 'invalid'
                          ? 'bg-rose-700 text-white shadow-xs'
                          : previewCounts.invalid > 0
                          ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <span>Invalid Only ({previewCounts.invalid})</span>
                    </button>

                    {previewCounts.duplicates > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('duplicates')}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                          previewFilter === 'duplicates'
                            ? 'bg-rose-700 text-white shadow-xs'
                            : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                        }`}
                      >
                        <span>Duplicates ({previewCounts.duplicates})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setPreviewFilter('valid')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                        previewFilter === 'valid'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Valid Only ({previewCounts.valid})
                    </button>
                  </div>

                  {previewFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className="text-xs text-teal-700 hover:text-teal-900 font-bold underline cursor-pointer"
                    >
                      Reset Filter (Show All)
                    </button>
                  )}
                </div>

                {importStatus.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{importStatus.error}</span>
                  </div>
                )}

                {/* Table container */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[52vh] flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200 whitespace-nowrap">
                      <tr>
                        <th className="p-3 w-10 text-center">Import</th>
                        <th className="p-3">Reg #</th>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">Class</th>
                        <th className="p-3">Adm Date</th>
                        <th className="p-3">First Billing</th>
                        <th className="p-3">Father Name</th>
                        <th className="p-3">Father CNIC</th>
                        <th className="p-3">Father Phone</th>
                        <th className="p-3">Discount</th>
                        <th className="p-3">Gender</th>
                        <th className="p-3">DOB</th>
                        <th className="p-3">B-Form</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                      {displayedPreviewRows.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="p-8 text-center bg-white text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <AlertCircle className="w-6 h-6 text-slate-400" />
                              <p className="font-semibold text-slate-700 text-sm">
                                No records match the current filter: <span className="font-bold capitalize">{previewFilter}</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => setPreviewFilter('all')}
                                className="mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                              >
                                View All ({previewCounts.total}) Records
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        displayedPreviewRows.map((r) => {
                          const resolvedClass = classes.find((c) => c.id === r.classId);
                          return (
                            <tr
                              key={r.id}
                              className={`hover:bg-slate-50/80 transition ${
                                r.isDuplicate
                                  ? 'bg-rose-50/60 text-slate-700'
                                  : !r.isValid
                                  ? 'bg-rose-50/40'
                                  : r.hasCaution
                                  ? 'bg-amber-50/40'
                                  : r.selected
                                  ? 'bg-teal-50/20'
                                  : ''
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!r.isValid || r.isDuplicate}
                                  checked={r.selected && r.isValid && !r.isDuplicate}
                                  onChange={() => handleTogglePreviewRow(r.id)}
                                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-800">
                                {r.regNo ? (
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    {r.regNo}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">(Auto)</span>
                                )}
                              </td>
                              <td className="p-3 font-medium text-slate-900">
                                {r.name || <span className="text-rose-600 font-bold italic">MISSING *</span>}
                              </td>
                              <td className="p-3 font-medium">
                                {resolvedClass ? (
                                  <span className="text-slate-800">{resolvedClass.name}</span>
                                ) : r.rawClassName ? (
                                  <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-semibold text-[11px]">
                                    {r.rawClassName}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 font-bold italic">MISSING *</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                {r.admissionDate ? (
                                  r.admissionDate
                                ) : (
                                  <span className="text-rose-600 font-bold italic">MISSING *</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                {r.firstBillingMonth ? (
                                  r.firstBillingMonth
                                ) : (
                                  <span className="text-rose-600 font-bold italic">MISSING *</span>
                                )}
                              </td>
                              <td className="p-3 font-medium text-slate-800">
                                {r.fatherName || <span className="text-rose-600 font-bold italic">MISSING *</span>}
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                {r.fatherCnic || <span className="text-rose-600 font-bold italic">MISSING *</span>}
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                {r.fatherPhone || <span className="text-rose-600 font-bold italic">MISSING *</span>}
                              </td>
                              <td className="p-3 font-mono font-medium text-emerald-700">
                                {formatCurrency(r.monthlyDiscount || 0)}
                              </td>
                              <td className="p-3 text-slate-700">
                                {r.gender ? (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      r.gender === 'Female'
                                        ? 'bg-pink-50 text-pink-700 border-pink-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}
                                  >
                                    {r.gender}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">-</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                {r.dob || <span className="text-slate-400 italic text-[11px]">-</span>}
                              </td>
                              <td className="p-3 font-mono text-slate-700">
                                {r.bFormNo || <span className="text-slate-400 italic text-[11px]">-</span>}
                              </td>
                              <td className="p-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${
                                    r.isDuplicate
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                      : !r.isValid
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                      : r.hasCaution
                                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  {r.hasCaution && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
                                  {r.validationMessage}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {previewRows.length > 0 && (
              <div className="flex justify-end items-center border-t border-slate-200 pt-3 shrink-0">
                <button
                  onClick={handleConfirmImport}
                  disabled={previewRows.filter((r) => r.selected && r.isValid).length === 0}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Confirm & Import {previewRows.filter((r) => r.selected && r.isValid).length} Selected Student(s)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Student Fee Collections & Ledger Modal */}
      {viewLedgerStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-6 border border-slate-200 animate-in fade-in duration-200">
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Student Fee Collections & Ledger</h3>
                  <p className="text-xs text-slate-500">
                    Comprehensive billing, payment records, and account statement.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewLedgerStudentId(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <StudentFeeLedger
              initialStudentId={viewLedgerStudentId}
              inModal
              onClose={() => setViewLedgerStudentId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
