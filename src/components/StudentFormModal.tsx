import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Student, StudentDocument, StudentStatus } from '../types';
import { formatCurrency, calculateAge, normalizeDateToISO, normalizeNationalId, getCurrencyCode } from '../utils/feeMath';
import { MonthPicker } from './MonthPicker';
import { DatePicker } from './DatePicker';
import { StudentAvatar } from './StudentAvatar';
import {
  AlertCircle,
  Camera,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Link as LinkIcon,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';

interface StudentFormModalProps {
  student: Student | null; // If null, adding new student
  onClose: () => void;
  onSuccess: () => void;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  student,
  onClose,
  onSuccess,
}) => {
  const {
    students,
    classes,
    families,
    themeConfig,
    addStudent,
    updateStudent,
  } = useApp();

  const isEdit = !!student;
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const [showPhotoUrlInput, setShowPhotoUrlInput] = useState(false);

  // Document file input refs
  const doc1FileInputRef = useRef<HTMLInputElement>(null);
  const doc2FileInputRef = useRef<HTMLInputElement>(null);
  const doc3FileInputRef = useRef<HTMLInputElement>(null);

  // Both "Last used" and "Suggested" come from the highest-numbered Reg #
  type ParsedRegNo = { prefix: string; num: number; width: number; padded: boolean; raw: string };
  const parseRegNo = (regNo?: string): ParsedRegNo | null => {
    if (!regNo) return null;
    const m = regNo.trim().match(/^(.*?)(\d+)$/);
    if (!m) return null;
    return {
      prefix: m[1],
      num: parseInt(m[2], 10),
      width: m[2].length,
      padded: m[2].length > 1 && m[2][0] === '0',
      raw: regNo.trim(),
    };
  };

  const highestNumberedReg = useMemo(() => {
    let best: ParsedRegNo | null = null;
    for (const s of students || []) {
      const parsed = parseRegNo(s.regNo);
      if (parsed && (!best || parsed.num > best.num)) {
        best = parsed;
      }
    }
    return best;
  }, [students]);

  const lastUsedRegNo = useMemo(() => {
    return highestNumberedReg ? highestNumberedReg.raw : 'None';
  }, [highestNumberedReg]);

  const computeNextRegNo = () => {
    if (!highestNumberedReg) return 'REG-1001';
    const next = highestNumberedReg.padded
      ? String(highestNumberedReg.num + 1).padStart(highestNumberedReg.width, '0')
      : String(highestNumberedReg.num + 1);
    return `${highestNumberedReg.prefix}${next}`;
  };

  const suggestedRegNo = useMemo(() => {
    return computeNextRegNo();
  }, [highestNumberedReg]);

  const [formData, setFormData] = useState({
    // 1. Basic Information
    photoUrl: student?.photoUrl || '',
    name: student?.name || '',
    regNo: student?.regNo || computeNextRegNo(),
    admissionDate: student?.admissionDate
      ? (normalizeDateToISO(student.admissionDate) || student.admissionDate)
      : new Date().toISOString().split('T')[0],
    firstBillingMonth: (() => {
      if (student?.firstBillingMonth) return student.firstBillingMonth;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const normAdm = student?.admissionDate ? normalizeDateToISO(student.admissionDate) : null;
      const admMonth = normAdm ? normAdm.substring(0, 7) : (student?.admissionDate ? student.admissionDate.substring(0, 7) : currentMonth);
      return admMonth > currentMonth ? admMonth : currentMonth;
    })(),
    classId: student
      ? classes.some((c) => c.id === student.classId)
        ? student.classId
        : ''
      : classes[0]?.id || '',
    monthlyDiscount: student?.monthlyDiscount ?? 0,
    mobileNumber: student?.mobileNumber || '',
    notes: student?.notes || '',
    status: student?.status || ('Active' as StudentStatus),

    // 2. Other Information
    dob: student?.dob ? (normalizeDateToISO(student.dob) || student.dob) : '',
    gender: ((student?.gender === 'Female') ? 'Female' : 'Male') as 'Male' | 'Female',
    studentNationalId: student?.studentNationalId || '',
    familyId: student?.familyId || '',
    address: student?.address || '',

    // 3. Father’s/ Guardian’s Information
    fatherName: student?.fatherName || '',
    fatherNationalId: student?.fatherNationalId || '',
    fatherPhone: student?.fatherPhone || '',

    // 4. Mother’s Information
    motherName: student?.motherName || '',
    motherNationalId: student?.motherNationalId || '',
    motherPhone: student?.motherPhone || '',

    // 5. Documents Upload
    document1: student?.document1 as StudentDocument | undefined,
    document2: student?.document2 as StudentDocument | undefined,
    document3: student?.document3 as StudentDocument | undefined,
  });

  const [formError, setFormError] = useState('');

  const [isAutoPopulatedFamily, setIsAutoPopulatedFamily] = useState(false);
  const [matchedFamilyInfo, setMatchedFamilyInfo] = useState<{
    id: string;
    familyNo: string;
    headName: string;
  } | null>(null);

  // Document preview state
  const [previewDoc, setPreviewDoc] = useState<{ title: string; fileData?: string; fileType?: string } | null>(null);

  // Close top-level modal on Escape if no preview doc is open, or close previewDoc if open
  useEscapeKey(() => {
    if (previewDoc) {
      setPreviewDoc(null);
    } else {
      onClose();
    }
  }, true, 1);

  const findMatchingFamily = (nationalIdInput: string) => {
    const raw = nationalIdInput.trim();
    if (!raw || raw.length < 5) return null;

    const normInput = normalizeNationalId(raw);

    // Strict direct match on Family's own fatherNationalId
    const directFamily = families.find((f) => {
      if (!f.fatherNationalId) return false;
      return (
        f.fatherNationalId.trim().toLowerCase() === raw.toLowerCase() ||
        (normalizeNationalId(f.fatherNationalId).length >= 5 && normalizeNationalId(f.fatherNationalId) === normInput)
      );
    });
    return directFamily || null;
  };

  const handleFatherNationalIdChange = (nationalIdValue: string) => {
    const match = findMatchingFamily(nationalIdValue);
    if (match) {
      setFormData((prev) => ({
        ...prev,
        fatherNationalId: nationalIdValue,
        familyId: match.id,
        fatherName: prev.fatherName.trim() ? prev.fatherName : match.headName,
        fatherPhone: prev.fatherPhone.trim() ? prev.fatherPhone : (match.contactPhone || ''),
      }));
      setIsAutoPopulatedFamily(true);
      setMatchedFamilyInfo({ id: match.id, familyNo: match.familyNo, headName: match.headName });
    } else {
      setFormData((prev) => {
        if (isAutoPopulatedFamily) {
          return { ...prev, fatherNationalId: nationalIdValue, familyId: '' };
        }
        return { ...prev, fatherNationalId: nationalIdValue };
      });
      if (isAutoPopulatedFamily) {
        setIsAutoPopulatedFamily(false);
        setMatchedFamilyInfo(null);
      }
    }
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 500 * 1024) {
      setFormError('Image size exceeds 500KB limit. Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setFormData((prev) => ({ ...prev, photoUrl: dataUrl }));
        setFormError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, photoUrl: '' }));
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = '';
    }
  };

  // Generic document file upload handler
  const handleDocumentUpload = (
    slotKey: 'document1' | 'document2' | 'document3',
    defaultName: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setFormError('File size exceeds 1MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const fileSizeStr =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`;

      setFormData((prev) => ({
        ...prev,
        [slotKey]: {
          name: file.name || defaultName,
          fileData: dataUrl,
          fileType: file.type || 'application/octet-stream',
          fileSize: fileSizeStr,
          uploadDate: new Date().toISOString().split('T')[0],
        },
      }));
      setFormError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = (slotKey: 'document1' | 'document2' | 'document3') => {
    setFormData((prev) => ({ ...prev, [slotKey]: undefined }));
  };

  const handleDocumentNameChange = (
    slotKey: 'document1' | 'document2' | 'document3',
    newName: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [slotKey]: prev[slotKey]
        ? { ...prev[slotKey]!, name: newName }
        : { name: newName, uploadDate: new Date().toISOString().split('T')[0] },
    }));
  };

  const isDuplicateRegNo = useMemo(() => {
    if (!formData.regNo.trim()) return false;
    const target = formData.regNo.trim().toLowerCase();
    return students.some(
      (s) => s.regNo.toLowerCase() === target && (!student || s.id !== student.id)
    );
  }, [formData.regNo, students, student]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.regNo.trim()) {
      setFormError('Student registration number (Reg #) is required.');
      return;
    }

    if (isDuplicateRegNo) {
      setFormError(`Duplicate Registration ID! '${formData.regNo.trim()}' is already in use.`);
      return;
    }

    if (!formData.name.trim()) {
      setFormError('Student Name is required.');
      return;
    }

    if (!formData.admissionDate) {
      setFormError('Date of Admission is required.');
      return;
    }

    if (!formData.firstBillingMonth) {
      setFormError('First Fee Billing Month is required.');
      return;
    }

    if (!formData.classId) {
      setFormError('Class Enrollment is required.');
      return;
    }

    if (formData.monthlyDiscount === undefined || isNaN(Number(formData.monthlyDiscount))) {
      setFormError('Discount in Fee is required (enter 0 if no discount).');
      return;
    }

    if (!formData.fatherName.trim()) {
      setFormError('Father Name is required.');
      return;
    }

    if (!formData.fatherNationalId.trim()) {
      setFormError('Father National ID is required.');
      return;
    }

    if (!formData.fatherPhone.trim()) {
      setFormError('Father Contact Mobile No is required.');
      return;
    }

    const payload = {
      regNo: formData.regNo.trim(),
      studentNo: formData.regNo.trim(),
      name: formData.name.trim(),
      admissionDate: normalizeDateToISO(formData.admissionDate) || formData.admissionDate,
      firstBillingMonth: formData.firstBillingMonth?.trim() || undefined,
      classId: formData.classId,
      monthlyDiscount: Math.max(0, Number(formData.monthlyDiscount) || 0),
      mobileNumber: formData.mobileNumber.trim() || undefined,
      notes: formData.notes.trim() || undefined,
      photoUrl: formData.photoUrl.trim() || undefined,

      dob: normalizeDateToISO(formData.dob) || formData.dob,
      gender: formData.gender,
      studentNationalId: formData.studentNationalId.trim() || undefined,
      familyId: formData.familyId || undefined,
      address: formData.address.trim() || undefined,

      fatherName: formData.fatherName.trim(),
      fatherNationalId: formData.fatherNationalId.trim(),
      fatherPhone: formData.fatherPhone.trim(),

      motherName: formData.motherName.trim(),
      motherNationalId: formData.motherNationalId.trim() || undefined,
      motherPhone: formData.motherPhone.trim(),

      document1: formData.document1?.fileData || formData.document1?.name ? formData.document1 : undefined,
      document2: formData.document2?.fileData || formData.document2?.name ? formData.document2 : undefined,
      document3: formData.document3?.fileData || formData.document3?.name ? formData.document3 : undefined,

      status: formData.status,
    };

    if (isEdit && student) {
      const res = updateStudent(student.id, payload);
      if (res.success) {
        onSuccess();
      } else {
        setFormError(res.error || 'Failed to update student.');
      }
    } else {
      const res = addStudent(payload);
      if (res.success) {
        onSuccess();
      } else {
        setFormError(res.error || 'Failed to register student.');
      }
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <User className="w-5 h-5 text-teal-600" />
              {isEdit ? `Edit Student: ${student.name}` : 'Register New Student'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Fill in the 5 required information sections below.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{formError}</span>
          </div>
        )}

        {/* Scrollable Form Content */}
        <form id="student-form" onSubmit={handleSubmit} className="space-y-5 overflow-y-auto flex-1 pr-1 text-xs">
          
          {/* SECTION 1: Basic Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">1</span>
                Basic Information
              </h4>
              <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                Required Section
              </span>
            </div>

            {/* Picture Upload Box */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
              <div className="relative group shrink-0">
                <StudentAvatar
                  photoUrl={formData.photoUrl}
                  name={formData.name || 'Student Photo'}
                  size="xl"
                />
                {formData.photoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute -top-1 -right-1 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 shadow-md transition cursor-pointer"
                    title="Remove Photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-1.5 w-full">
                <div>
                  <label className="block font-bold text-slate-800 text-xs">
                    Student Picture
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Upload image (PNG, JPG, WEBP up to 500KB) or enter image URL
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => photoFileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {formData.photoUrl ? 'Change Picture' : 'Upload Picture'}
                  </button>

                  <input
                    ref={photoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={handlePhotoFileChange}
                  />

                  {formData.photoUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowPhotoUrlInput(!showPhotoUrlInput)}
                    className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                  >
                    <LinkIcon className="w-3 h-3" />
                    {showPhotoUrlInput ? 'Hide URL' : 'Image URL'}
                  </button>
                </div>

                {showPhotoUrlInput && (
                  <div className="mt-2">
                    <input
                      type="url"
                      placeholder="Paste image link, e.g. https://.../photo.jpg"
                      value={formData.photoUrl}
                      onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Basic Information Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Student Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Student Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Reg # */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reg # *
                </label>
                <input
                  type="text"
                  required
                  disabled={isEdit}
                  placeholder="e.g. 1001"
                  value={formData.regNo}
                  onChange={(e) => setFormData({ ...formData, regNo: e.target.value })}
                  className={`w-full p-2 rounded-lg font-mono font-bold ${
                    isEdit
                      ? 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed'
                      : isDuplicateRegNo
                      ? 'bg-rose-50 border-2 border-rose-400 text-rose-900'
                      : 'bg-white border border-slate-200 text-slate-900 focus:ring-2 focus:ring-teal-500/20'
                  }`}
                />
                {!isEdit && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                      Last used: {lastUsedRegNo}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, regNo: suggestedRegNo }))}
                      title="Click to apply suggested Reg #"
                      className="text-[10px] text-teal-700 font-semibold bg-teal-50 hover:bg-teal-100 px-1.5 py-0.5 rounded border border-teal-200 whitespace-nowrap truncate cursor-pointer transition"
                    >
                      Suggested: {suggestedRegNo}
                    </button>
                  </div>
                )}
                {isDuplicateRegNo && !isEdit && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">
                    Duplicate ID! Already in use.
                  </p>
                )}
              </div>

              {/* Date of Admission */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Date of Admission *
                </label>
                <DatePicker
                  value={formData.admissionDate}
                  required
                  themeColor={themeConfig?.color || 'teal'}
                  onChange={(newAdmDate) => {
                    setFormData((prev) => ({
                      ...prev,
                      admissionDate: newAdmDate,
                      firstBillingMonth: prev.firstBillingMonth || (newAdmDate ? newAdmDate.substring(0, 7) : ''),
                    }));
                  }}
                  idPrefix="student-admission-date"
                  placeholder="Select Admission Date"
                  className="w-full"
                />
              </div>

              {/* First Fee Billing Month */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  First Fee Billing Month *
                </label>
                <MonthPicker
                  value={formData.firstBillingMonth}
                  onChange={(newMonth) => setFormData({ ...formData, firstBillingMonth: newMonth })}
                  themeColor={themeConfig?.color || 'teal'}
                  isLight={true}
                  showSteppers={false}
                  variant="input"
                  className="w-full"
                  idPrefix="student-first-billing-month"
                  placeholder="Select Starting Month"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Voucher generation begins from this month
                </p>
              </div>

              {/* Class */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Class *</label>
                <select
                  required
                  value={formData.classId}
                  onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold text-slate-900"
                >
                  <option value="" disabled>
                    -- Select Class --
                  </option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatCurrency(c.monthlyFee)}/mo)
                    </option>
                  ))}
                </select>
              </div>

              {/* Discount in Fee */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Discount in Fee ({getCurrencyCode()}) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="0"
                  value={formData.monthlyDiscount}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) =>
                    setFormData({ ...formData, monthlyDiscount: Number(e.target.value) })
                  }
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-bold text-emerald-700"
                />
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +1 555 010 1234"
                  value={formData.mobileNumber}
                  onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as StudentStatus })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                >
                  <option value="Active">Active</option>
                  <option value="Withdrawn">Withdrawn</option>
                  <option value="Graduated">Graduated</option>
                  <option value="Inactive">Inactive</option>
                  <option value="AutoDeactivated">Auto-Deactivated</option>
                </select>
              </div>

              {/* Other Notes */}
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Other Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional remarks, academic background, medical notes, etc."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Other Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                Other Information
              </h4>
              <span className="text-[11px] font-medium text-slate-500">
                Personal & Family Link
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Date of Birth */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Date of Birth</label>
                  {formData.dob && calculateAge(formData.dob) && (
                    <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200/80">
                      Age: {calculateAge(formData.dob)?.fullText}
                    </span>
                  )}
                </div>
                <DatePicker
                  value={formData.dob}
                  minYear={1960}
                  maxYear={new Date().getFullYear()}
                  themeColor={themeConfig?.color || 'teal'}
                  onChange={(newDob) => setFormData((prev) => ({ ...prev, dob: newDob }))}
                  idPrefix="student-dob"
                  placeholder="Select Date of Birth"
                  className="w-full"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) =>
                    setFormData({ ...formData, gender: e.target.value as 'Male' | 'Female' })
                  }
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Student ID / Birth Cert. No. */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Student ID / Birth Cert. No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. 00000-1234567-1"
                  value={formData.studentNationalId}
                  onChange={(e) => setFormData({ ...formData, studentNationalId: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Family */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Family
                </label>
                <select
                  value={formData.familyId || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, familyId: e.target.value });
                    setIsAutoPopulatedFamily(false);
                    setMatchedFamilyInfo(null);
                  }}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-semibold text-slate-900"
                >
                  <option value="">No Family (Unlinked)</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.familyNo} &bull; {f.headName}
                    </option>
                  ))}
                </select>
                {isAutoPopulatedFamily && matchedFamilyInfo && formData.familyId === matchedFamilyInfo.id && (
                  <p className="text-[10px] text-teal-700 font-semibold flex items-center gap-1 mt-1">
                    <Sparkles className="w-3 h-3 text-teal-600 shrink-0" />
                    Auto-set via Father National ID
                  </p>
                )}
              </div>

              {/* Address */}
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="e.g. House #, Street XX, City"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Father’s/ Guardian’s Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">3</span>
                Father’s / Guardian’s Information
              </h4>
              <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                Required Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Father Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Father Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Father Name "
                  value={formData.fatherName}
                  onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Father's National ID */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Father’s National ID *</label>
                <input
                  type="text"
                  required
                  placeholder="00000-1234567-1"
                  value={formData.fatherNationalId}
                  onChange={(e) => handleFatherNationalIdChange(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <p className="text-[10px] text-slate-400 mt-1">Auto-links family by National ID if matched</p>
              </div>

              {/* Mobile No */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile No *</label>
                <input
                  type="tel"
                  required
                  placeholder="+1 555 010 1234"
                  value={formData.fatherPhone}
                  onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Mother’s Information */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">4</span>
                Mother’s Information
              </h4>
              <span className="text-[11px] font-medium text-slate-500">
                Optional Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Mother Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mother Name</label>
                <input
                  type="text"
                  placeholder="Mother Name"
                  value={formData.motherName}
                  onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Mother's National ID */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mother’s National ID</label>
                <input
                  type="text"
                  placeholder="00000-1234567-1"
                  value={formData.motherNationalId}
                  onChange={(e) => setFormData({ ...formData, motherNationalId: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Mobile No */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile No</label>
                <input
                  type="tel"
                  placeholder="+1 555 010 1234"
                  value={formData.motherPhone}
                  onChange={(e) => setFormData({ ...formData, motherPhone: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>
          </div>

          {/* SECTION 5: Documents Upload */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">5</span>
                Documents Upload
              </h4>
              <span className="text-[11px] font-medium text-slate-500">
                PDF, JPG, PNG up to 1MB
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Document 1 Slot */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800 text-xs">Document 1</span>
                    {formData.document1?.fileData ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Uploaded
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Empty</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Birth Certificate / Student ID"
                    value={formData.document1?.name || ''}
                    onChange={(e) => handleDocumentNameChange('document1', e.target.value)}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                {formData.document1?.fileData ? (
                  <div className="space-y-2 bg-teal-50/40 p-2.5 rounded-lg border border-teal-200/60">
                    <div className="flex items-center gap-2 text-slate-800">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[11px] truncate">{formData.document1.name}</p>
                        <p className="text-[10px] text-slate-500">{formData.document1.fileSize || 'Attached'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: formData.document1?.name || 'Document 1',
                            fileData: formData.document1?.fileData,
                            fileType: formData.document1?.fileType,
                          })
                        }
                        className="px-2 py-1 bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => doc1FileInputRef.current?.click()}
                        className="px-2 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium transition cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument('document1')}
                        className="p-1 text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => doc1FileInputRef.current?.click()}
                    className="w-full py-3 border border-dashed border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/30 rounded-lg text-slate-600 hover:text-teal-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-[11px]">Upload Document 1</span>
                  </button>
                )}

                <input
                  ref={doc1FileInputRef}
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleDocumentUpload('document1', 'Document 1 (Birth Cert / Student ID)', e)}
                />
              </div>

              {/* Document 2 Slot */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800 text-xs">Document 2</span>
                    {formData.document2?.fileData ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Uploaded
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Empty</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Leaving Certificate"
                    value={formData.document2?.name || ''}
                    onChange={(e) => handleDocumentNameChange('document2', e.target.value)}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                {formData.document2?.fileData ? (
                  <div className="space-y-2 bg-teal-50/40 p-2.5 rounded-lg border border-teal-200/60">
                    <div className="flex items-center gap-2 text-slate-800">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[11px] truncate">{formData.document2.name}</p>
                        <p className="text-[10px] text-slate-500">{formData.document2.fileSize || 'Attached'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: formData.document2?.name || 'Document 2',
                            fileData: formData.document2?.fileData,
                            fileType: formData.document2?.fileType,
                          })
                        }
                        className="px-2 py-1 bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => doc2FileInputRef.current?.click()}
                        className="px-2 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium transition cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument('document2')}
                        className="p-1 text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => doc2FileInputRef.current?.click()}
                    className="w-full py-3 border border-dashed border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/30 rounded-lg text-slate-600 hover:text-teal-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-[11px]">Upload Document 2</span>
                  </button>
                )}

                <input
                  ref={doc2FileInputRef}
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleDocumentUpload('document2', 'Document 2 (Leaving Certificate)', e)}
                />
              </div>

              {/* Document 3 Slot */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800 text-xs">Document 3</span>
                    {formData.document3?.fileData ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Uploaded
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Empty</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. National ID Copy / Other"
                    value={formData.document3?.name || ''}
                    onChange={(e) => handleDocumentNameChange('document3', e.target.value)}
                    className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                {formData.document3?.fileData ? (
                  <div className="space-y-2 bg-teal-50/40 p-2.5 rounded-lg border border-teal-200/60">
                    <div className="flex items-center gap-2 text-slate-800">
                      <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[11px] truncate">{formData.document3.name}</p>
                        <p className="text-[10px] text-slate-500">{formData.document3.fileSize || 'Attached'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            title: formData.document3?.name || 'Document 3',
                            fileData: formData.document3?.fileData,
                            fileType: formData.document3?.fileType,
                          })
                        }
                        className="px-2 py-1 bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => doc3FileInputRef.current?.click()}
                        className="px-2 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium transition cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument('document3')}
                        className="p-1 text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => doc3FileInputRef.current?.click()}
                    className="w-full py-3 border border-dashed border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/30 rounded-lg text-slate-600 hover:text-teal-700 transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-[11px]">Upload Document 3</span>
                  </button>
                )}

                <input
                  ref={doc3FileInputRef}
                  type="file"
                  accept="application/pdf,image/*,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleDocumentUpload('document3', 'Document 3 (National ID / Other)', e)}
                />
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer font-semibold text-xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="student-form"
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer text-xs"
          >
            {isEdit ? 'Save Student Updates' : 'Register Student'}
          </button>
        </div>
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h4 className="font-bold text-slate-900 text-sm truncate flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                {previewDoc.title}
              </h4>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center min-h-[300px] bg-slate-50 rounded-xl p-4 border border-slate-200">
              {previewDoc.fileData ? (
                previewDoc.fileType?.startsWith('image/') ? (
                  <img
                    src={previewDoc.fileData}
                    alt={previewDoc.title}
                    className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-xs"
                  />
                ) : (
                  <iframe
                    src={previewDoc.fileData}
                    title={previewDoc.title}
                    className="w-full h-[60vh] rounded-lg border border-slate-200"
                  />
                )
              ) : (
                <p className="text-slate-400 italic">No document file data attached to preview.</p>
              )}
            </div>

            <div className="flex justify-between items-center border-t border-slate-200 pt-3 shrink-0">
              {previewDoc.fileData ? (
                <a
                  href={previewDoc.fileData}
                  download={previewDoc.title}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </a>
              ) : (
                <div />
              )}
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
