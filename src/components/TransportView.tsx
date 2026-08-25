import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { TransportAssignment, TransportBus, TransportStop } from '../types';
import { calculateTransportFee, formatCurrency, getDaysInMonth, roundBusFareUp } from '../utils/feeMath';
import { StudentAvatar } from './StudentAvatar';
import { ConfirmModal } from './ConfirmModal';
import { Bus, CalendarDays, Copy, CheckCircle, AlertCircle, LayoutGrid, List, MapPin, Pencil, Plus, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Info, Check, ChevronsUpDown, ChevronDown, Upload, FileSpreadsheet, Download, GripVertical } from 'lucide-react';

export const TransportView: React.FC = () => {
  const {
    activeMonth,
    buses,
    stops,
    transportAssignments,
    students,
    classes,
    addBus,
    updateBus,
    deleteBus,
    reorderBuses,
    addStop,
    updateStop,
    deleteStop,
    reorderStops,
    saveTransportAssignment,
    bulkSaveTransportAssignments,
    deleteTransportAssignment,
    copyTransportAssignmentsFromPreviousMonth,
    bulkUpdateTransportDaysForMonth,
    hasPermission,
    showToast,
  } = useApp();

  const [subTab, setSubTab] = useState<'buses' | 'stops' | 'assignments'>('assignments');
  const [busesViewMode, setBusesViewMode] = useState<'grid' | 'list'>('grid');
  const [stopsViewMode, setStopsViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [showBusModal, setShowBusModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [showAsgnModal, setShowAsgnModal] = useState(false);
  const [showBulkCsvModal, setShowBulkCsvModal] = useState(false);

  // Bulk CSV Upload State
  interface BulkTransportPreviewRow {
    id: string;
    regNo: string;
    student?: (typeof students)[0];
    studentClass?: (typeof classes)[0];
    busInput: string;
    bus?: TransportBus;
    stopInput: string;
    stop?: TransportStop;
    tripType: 'RoundTrip' | 'OneWay';
    daysCharged: number;
    discount: number;
    effectiveFare: number;
    existingAsgn?: TransportAssignment;
    isValid: boolean;
    isDuplicateInCsv: boolean;
    selected: boolean;
    errorMsg?: string;
  }

  // Global Active Days in Month state
  const totalDaysInMonth = getDaysInMonth(activeMonth);
  const [globalMonthDays, setGlobalMonthDays] = useState<number>(totalDaysInMonth);

  // Synchronize globalMonthDays whenever activeMonth changes
  useEffect(() => {
    const monthDays = getDaysInMonth(activeMonth);
    const currentAssignments = transportAssignments.filter(
      (a) => a.month === activeMonth && students.some((s) => s.id === a.studentId)
    );
    const firstDays = currentAssignments[0]?.daysCharged;
    const initialDays = firstDays !== undefined && !isNaN(firstDays) ? firstDays : monthDays;
    setGlobalMonthDays(Math.min(Math.max(initialDays, 0), monthDays));
  }, [activeMonth, students, transportAssignments]);

  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [bulkPreviewRows, setBulkPreviewRows] = useState<BulkTransportPreviewRow[]>([]);
  const [bulkImportStatus, setBulkImportStatus] = useState<{ message: string | null; error: string | null }>({
    message: null,
    error: null,
  });
  const [isBulkDragging, setIsBulkDragging] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [csvTargetMonth, setCsvTargetMonth] = useState<string>(activeMonth);
  const [csvDefaultDays, setCsvDefaultDays] = useState<number>(totalDaysInMonth);

  useEffect(() => {
    setCsvTargetMonth(activeMonth);
    setCsvDefaultDays(globalMonthDays);
  }, [activeMonth, globalMonthDays]);

  // Deletion Confirmation States
  const [busToDelete, setBusToDelete] = useState<TransportBus | null>(null);
  const [stopToDelete, setStopToDelete] = useState<TransportStop | null>(null);
  const [asgnToDelete, setAsgnToDelete] = useState<TransportAssignment | null>(null);

  // Copy status feedback
  const [copyFeedback, setCopyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Selected assignment IDs for checkbox selection
  const [selectedAsgnIds, setSelectedAsgnIds] = useState<string[]>([]);

  // Student search filter & combobox state in assignment modal
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [isStudentComboOpen, setIsStudentComboOpen] = useState(false);
  const studentComboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (studentComboRef.current && !studentComboRef.current.contains(event.target as Node)) {
        setIsStudentComboOpen(false);
      }
    };
    if (isStudentComboOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStudentComboOpen]);

  // Sorting state for assignments list
  type AsgnSortField = 'student' | 'class' | 'bus' | 'stop' | 'tripType' | 'days' | 'discount' | 'fare';
  const [sortField, setSortField] = useState<AsgnSortField>('student');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: AsgnSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Edit targets state
  const [editingBus, setEditingBus] = useState<TransportBus | null>(null);
  const [editingStop, setEditingStop] = useState<TransportStop | null>(null);
  const [editingAsgn, setEditingAsgn] = useState<TransportAssignment | null>(null);

  // Bus search and drag/drop sort state
  const [busSearchQuery, setBusSearchQuery] = useState('');
  const [draggedBusId, setDraggedBusId] = useState<string | null>(null);
  const [dragOverBusId, setDragOverBusId] = useState<string | null>(null);

  // Stop search and drag/drop sort state
  const [stopSearchQuery, setStopSearchQuery] = useState('');
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [dragOverStopId, setDragOverStopId] = useState<string | null>(null);

  const filteredBuses = buses.filter((bus) => {
    const q = busSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      bus.busNumber.toLowerCase().includes(q) ||
      bus.model.toLowerCase().includes(q) ||
      (bus.regNumber && bus.regNumber.toLowerCase().includes(q)) ||
      (bus.routeName && bus.routeName.toLowerCase().includes(q)) ||
      (bus.driverName && bus.driverName.toLowerCase().includes(q)) ||
      (bus.driverPhone && bus.driverPhone.toLowerCase().includes(q))
    );
  });

  const filteredStops = stops.filter((stop) => {
    const q = stopSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      stop.name.toLowerCase().includes(q) ||
      (stop.area && stop.area.toLowerCase().includes(q)) ||
      (stop.landmark && stop.landmark.toLowerCase().includes(q))
    );
  });

  // Drag and drop handlers for Buses
  const handleBusDragStart = (e: React.DragEvent, bus: TransportBus) => {
    if (!hasPermission('transport.manage')) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', bus.id);
    setDraggedBusId(bus.id);
  };

  const handleBusDragOver = (e: React.DragEvent, targetBus: TransportBus) => {
    if (!hasPermission('transport.manage') || !draggedBusId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverBusId !== targetBus.id) {
      setDragOverBusId(targetBus.id);
    }
  };

  const handleBusDrop = (e: React.DragEvent, targetBus: TransportBus) => {
    if (!hasPermission('transport.manage')) return;
    e.preventDefault();
    const sourceId = draggedBusId || e.dataTransfer.getData('text/plain');

    if (!sourceId || sourceId === targetBus.id) {
      setDraggedBusId(null);
      setDragOverBusId(null);
      return;
    }

    const currentBuses = [...buses];
    const fromIndex = currentBuses.findIndex((b) => b.id === sourceId);
    const toIndex = currentBuses.findIndex((b) => b.id === targetBus.id);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedBus] = currentBuses.splice(fromIndex, 1);
      currentBuses.splice(toIndex, 0, movedBus);
      reorderBuses(currentBuses);
    }

    setDraggedBusId(null);
    setDragOverBusId(null);
  };

  const handleBusDragEnd = () => {
    setDraggedBusId(null);
    setDragOverBusId(null);
  };

  // Drag and drop handlers for Stops
  const handleStopDragStart = (e: React.DragEvent, stop: TransportStop) => {
    if (!hasPermission('transport.manage')) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stop.id);
    setDraggedStopId(stop.id);
  };

  const handleStopDragOver = (e: React.DragEvent, targetStop: TransportStop) => {
    if (!hasPermission('transport.manage') || !draggedStopId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStopId !== targetStop.id) {
      setDragOverStopId(targetStop.id);
    }
  };

  const handleStopDrop = (e: React.DragEvent, targetStop: TransportStop) => {
    if (!hasPermission('transport.manage')) return;
    e.preventDefault();
    const sourceId = draggedStopId || e.dataTransfer.getData('text/plain');

    if (!sourceId || sourceId === targetStop.id) {
      setDraggedStopId(null);
      setDragOverStopId(null);
      return;
    }

    const currentStops = [...stops];
    const fromIndex = currentStops.findIndex((s) => s.id === sourceId);
    const toIndex = currentStops.findIndex((s) => s.id === targetStop.id);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedStop] = currentStops.splice(fromIndex, 1);
      currentStops.splice(toIndex, 0, movedStop);
      reorderStops(currentStops);
    }

    setDraggedStopId(null);
    setDragOverStopId(null);
  };

  const handleStopDragEnd = () => {
    setDraggedStopId(null);
    setDragOverStopId(null);
  };

  // Bus Form
  const [busData, setBusData] = useState({
    busNumber: '',
    model: '',
    regNumber: '',
    driverName: '',
    driverPhone: '',
    routeName: '',
    active: true,
    sortOrder: buses.length + 1,
  });

  // Stop Form
  const [stopData, setStopData] = useState({
    name: '',
    area: '',
    landmark: '',
    monthlyFare: 0,
    sortOrder: stops.length + 1,
  });

  // Assignment Form
  const daysInCurrentMonth = getDaysInMonth(activeMonth);
  const [asgnData, setAsgnData] = useState({
    studentId: students[0]?.id || '',
    busId: buses[0]?.id || '',
    stopId: stops[0]?.id || '',
    tripType: 'RoundTrip' as 'RoundTrip' | 'OneWay',
    daysCharged: daysInCurrentMonth,
    discount: 0,
    active: true,
  });

  const [formError, setFormError] = useState('');

  // Handlers for opening Modals in Add vs Edit mode
  const handleOpenAddBus = () => {
    setEditingBus(null);
    setBusData({
      busNumber: '',
      model: '',
      regNumber: '',
      driverName: '',
      driverPhone: '',
      routeName: '',
      active: true,
      sortOrder: buses.length + 1,
    });
    setFormError('');
    setShowBusModal(true);
  };

  const handleOpenEditBus = (bus: TransportBus) => {
    setEditingBus(bus);
    setBusData({
      busNumber: bus.busNumber,
      model: bus.model,
      regNumber: bus.regNumber,
      driverName: bus.driverName,
      driverPhone: bus.driverPhone,
      routeName: bus.routeName,
      active: bus.active,
      sortOrder: bus.sortOrder,
    });
    setFormError('');
    setShowBusModal(true);
  };

  const handleOpenAddStop = () => {
    setEditingStop(null);
    setStopData({
      name: '',
      area: '',
      landmark: '',
      monthlyFare: 0,
      sortOrder: stops.length + 1,
    });
    setFormError('');
    setShowStopModal(true);
  };

  const handleOpenEditStop = (stop: TransportStop) => {
    setEditingStop(stop);
    setStopData({
      name: stop.name,
      area: stop.area,
      landmark: stop.landmark,
      monthlyFare: stop.monthlyFare,
      sortOrder: stop.sortOrder,
    });
    setFormError('');
    setShowStopModal(true);
  };

  const handleOpenAddAssignment = () => {
    setEditingAsgn(null);
    setStudentSearchQuery('');
    setIsStudentComboOpen(false);

    setAsgnData({
      studentId: '',
      busId: buses[0]?.id || '',
      stopId: stops[0]?.id || '',
      tripType: 'RoundTrip',
      daysCharged: globalMonthDays,
      discount: 0,
      active: true,
    });
    setFormError('');
    setShowAsgnModal(true);
  };

  const handleOpenEditAssignment = (a: TransportAssignment) => {
    setEditingAsgn(a);
    setStudentSearchQuery('');
    setIsStudentComboOpen(false);
    const targetMonth = a.month || activeMonth;
    const totalDays = getDaysInMonth(targetMonth);
    setAsgnData({
      studentId: a.studentId,
      busId: a.busId,
      stopId: a.stopId,
      tripType: a.tripType,
      daysCharged: a.daysCharged !== undefined ? a.daysCharged : totalDays,
      discount: a.discount || 0,
      active: a.active,
    });
    setFormError('');
    setShowAsgnModal(true);
  };

  const handleSelectStudentForAssignment = (studentId: string) => {
    const targetMonth = editingAsgn ? editingAsgn.month : activeMonth;
    const existing = transportAssignments.find(
      (a) => a.studentId === studentId && a.month === targetMonth && a.id !== editingAsgn?.id
    );

    if (existing) {
      // Auto-populate with existing assignment values to make editing seamless
      setAsgnData({
        studentId: existing.studentId,
        busId: existing.busId || buses[0]?.id || '',
        stopId: existing.stopId || stops[0]?.id || '',
        tripType: existing.tripType || 'RoundTrip',
        daysCharged: existing.daysCharged !== undefined ? existing.daysCharged : globalMonthDays,
        discount: existing.discount || 0,
        active: existing.active,
      });
    } else {
      setAsgnData((prev) => ({
        ...prev,
        studentId,
      }));
    }
  };

  const handleGlobalDaysChange = (newDays: number) => {
    const maxDays = getDaysInMonth(activeMonth);
    const clamped = isNaN(newDays) ? 0 : Math.min(Math.max(newDays, 0), maxDays);
    setGlobalMonthDays(clamped);
  };

  const handleApplyGlobalDaysToAll = () => {
    const res = bulkUpdateTransportDaysForMonth(activeMonth, globalMonthDays);
    if (res.success && res.updatedCount > 0) {
      setCopyFeedback({
        type: 'success',
        message: `Applied ${globalMonthDays} active days to all ${res.updatedCount} transport assignment${
          res.updatedCount === 1 ? '' : 's'
        } in ${activeMonth}. Prorated fares updated.`,
      });
    } else {
      setCopyFeedback({
        type: 'error',
        message: `No transport assignments found in ${activeMonth} to update.`,
      });
    }
  };

  const handleCopyPreviousMonth = () => {
    setCopyFeedback(null);
    const res = copyTransportAssignmentsFromPreviousMonth(activeMonth, globalMonthDays);
    if (res.success) {
      setCopyFeedback({
        type: 'success',
        message: `Successfully copied ${res.copiedCount} active student assignment${res.copiedCount === 1 ? '' : 's'} with ${globalMonthDays} active days.${
          res.skippedCount > 0 ? ` (${res.skippedCount} already assigned)` : ''
        }${res.inactiveSkippedCount > 0 ? ` (${res.inactiveSkippedCount} inactive students skipped)` : ''}`,
      });
    } else {
      setCopyFeedback({
        type: 'error',
        message: res.error || 'Failed to copy previous month assignments.',
      });
    }
  };

  // Bulk CSV Handlers
  const handleOpenBulkCsvModal = () => {
    setBulkCsvFile(null);
    setBulkPreviewRows([]);
    setBulkImportStatus({ message: null, error: null });
    setCsvTargetMonth(activeMonth);
    setCsvDefaultDays(globalMonthDays);
    setShowBulkCsvModal(true);
  };

  const handleDownloadSampleTransportCsv = () => {
    const sampleStudents = students.filter((s) => s.status === 'Active').slice(0, 3);
    const sampleBus = buses[0]?.busNumber || 'BUS-01';
    const sampleStop1 = stops[0]?.name || 'Saddar';
    const sampleStop2 = stops[1]?.name || stops[0]?.name || 'G-10 Markaz';
    const targetMonth = csvTargetMonth || activeMonth;
    const sampleMonthDays = getDaysInMonth(targetMonth);

    const headers = ['RegNo', 'BusNumber', 'StopName', 'TripType', 'DaysAvailed', 'Discount'];
    const rows = [
      [sampleStudents[0]?.regNo || 'REG-1001', sampleBus, sampleStop1, 'RoundTrip', String(sampleMonthDays), '0'],
      [sampleStudents[1]?.regNo || 'REG-1002', sampleBus, sampleStop2, 'OneWay', String(sampleMonthDays), '200'],
      [sampleStudents[2]?.regNo || 'REG-1003', sampleBus, sampleStop1, 'RoundTrip', String(Math.min(22, sampleMonthDays)), '0'],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sample_transport_assignments_${targetMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processTransportCsvFile = (file: File) => {
    setBulkCsvFile(file);
    setBulkImportStatus({ message: null, error: null });
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || !text.trim()) {
          setBulkImportStatus({ message: null, error: 'The uploaded file is empty.' });
          return;
        }

        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length <= 1) {
          setBulkImportStatus({
            message: null,
            error: 'CSV must contain a header row and at least one student transport assignment record.',
          });
          return;
        }

        const headerLine = lines[0].toLowerCase();
        const headerTokens = headerLine.split(',').map((h) => h.replace(/["'\s_]/g, ''));

        const colMap = {
          regNo: headerTokens.findIndex((h) => h.includes('reg') || h.includes('student') || h.includes('roll') || h.includes('id')),
          bus: headerTokens.findIndex((h) => h.includes('bus') || h.includes('vehicle') || h.includes('van') || h.includes('fleet')),
          stop: headerTokens.findIndex((h) => h.includes('stop') || h.includes('station') || h.includes('route') || h.includes('location')),
          tripType: headerTokens.findIndex((h) => h.includes('trip') || h.includes('type') || h.includes('direction')),
          days: headerTokens.findIndex((h) => h.includes('day') || h.includes('availed') || h.includes('charged')),
          discount: headerTokens.findIndex((h) => h.includes('discount') || h.includes('concession') || h.includes('scholarship') || h.includes('deduction')),
        };

        if (colMap.regNo === -1) {
          setBulkImportStatus({
            message: null,
            error: 'Missing required column: "RegNo" (Student Registration #) must be present in the CSV header.',
          });
          return;
        }

        const parseCsvLine = (line: string): string[] => {
          const result: string[] = [];
          let insideQuotes = false;
          let current = '';
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result.map((s) => s.replace(/^["']|["']$/g, '').trim());
        };

        const targetMonth = csvTargetMonth || activeMonth;
        const targetMonthDays = getDaysInMonth(targetMonth);
        const parsedRows: BulkTransportPreviewRow[] = [];
        const seenRegNos = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          if (cols.length === 0 || cols.every((c) => !c)) continue;

          const rawRegNo = cols[colMap.regNo] || '';
          const rawBus = colMap.bus !== -1 ? cols[colMap.bus] || '' : '';
          const rawStop = colMap.stop !== -1 ? cols[colMap.stop] || '' : '';
          const rawTripType = colMap.tripType !== -1 ? cols[colMap.tripType] || '' : '';
          const rawDays = colMap.days !== -1 ? cols[colMap.days] || '' : '';
          const rawDiscount = colMap.discount !== -1 ? cols[colMap.discount] || '' : '';

          if (!rawRegNo) continue;

          // 1. Match Student
          const cleanReg = rawRegNo.trim().toLowerCase();
          const cleanRegAlpha = cleanReg.replace(/[^a-z0-9]/g, '');
          const student = students.find((s) => {
            const sReg = s.regNo.toLowerCase();
            const sNum = s.studentNo.toLowerCase();
            return (
              sReg === cleanReg ||
              sNum === cleanReg ||
              sReg.replace(/[^a-z0-9]/g, '') === cleanRegAlpha ||
              sNum.replace(/[^a-z0-9]/g, '') === cleanRegAlpha
            );
          });
          const studentClass = student ? classes.find((c) => c.id === student.classId) : undefined;

          // 2. Match Bus (fallback to first active bus if omitted or matches)
          let bus: TransportBus | undefined;
          if (rawBus.trim()) {
            const cleanBus = rawBus.trim().toLowerCase();
            const cleanBusAlpha = cleanBus.replace(/[^a-z0-9]/g, '');
            bus = buses.find((b) => {
              const bNum = b.busNumber.toLowerCase();
              return (
                bNum === cleanBus ||
                bNum.replace(/[^a-z0-9]/g, '') === cleanBusAlpha ||
                b.model.toLowerCase().includes(cleanBus) ||
                b.routeName.toLowerCase().includes(cleanBus)
              );
            });
          } else if (buses.length > 0) {
            bus = buses[0];
          }

          // 3. Match Stop (fallback to first stop if omitted or matches)
          let stop: TransportStop | undefined;
          if (rawStop.trim()) {
            const cleanStop = rawStop.trim().toLowerCase();
            const cleanStopAlpha = cleanStop.replace(/[^a-z0-9]/g, '');
            stop = stops.find((sp) => {
              const spName = sp.name.toLowerCase();
              return (
                spName === cleanStop ||
                spName.replace(/[^a-z0-9]/g, '') === cleanStopAlpha ||
                sp.area.toLowerCase().includes(cleanStop)
              );
            });
          } else if (stops.length > 0) {
            stop = stops[0];
          }

          // 4. Trip Type
          let tripType: 'RoundTrip' | 'OneWay' = 'RoundTrip';
          if (/one|1|single/i.test(rawTripType)) {
            tripType = 'OneWay';
          }

          // 5. Days Availed
          let daysCharged = csvDefaultDays;
          if (rawDays.trim()) {
            const numDays = parseInt(rawDays.trim(), 10);
            if (!isNaN(numDays)) {
              daysCharged = Math.min(Math.max(numDays, 0), targetMonthDays);
            }
          }

          // 6. Discount
          let discount = 0;
          if (rawDiscount.trim()) {
            const numDisc = parseFloat(rawDiscount.replace(/[^0-9.]/g, ''));
            if (!isNaN(numDisc) && numDisc >= 0) {
              discount = numDisc;
            }
          }

          // 7. Duplicate in CSV
          const isDuplicateInCsv = seenRegNos.has(cleanReg);
          if (!isDuplicateInCsv) {
            seenRegNos.add(cleanReg);
          }

          // 8. Existing assignment check
          const existingAsgn = student
            ? transportAssignments.find((a) => a.studentId === student.id && a.month === targetMonth)
            : undefined;

          // 9. Validation & Error message
          let isValid = true;
          let errorMsg = '';

          if (!student) {
            isValid = false;
            errorMsg = `Student '${rawRegNo}' not found`;
          } else if (student.status === 'Inactive' || student.status === 'Passout') {
            isValid = false;
            errorMsg = `Student is ${student.status}`;
          } else if (!bus) {
            isValid = false;
            errorMsg = rawBus ? `Bus '${rawBus}' not found` : 'No fleet bus available';
          } else if (!stop) {
            isValid = false;
            errorMsg = rawStop ? `Stop '${rawStop}' not found` : 'No bus stop available';
          } else if (isDuplicateInCsv) {
            isValid = false;
            errorMsg = 'Duplicate Reg # in CSV';
          }

          // Calculate effective fee
          const mockAsgn: TransportAssignment = {
            id: existingAsgn ? existingAsgn.id : 'temp',
            studentId: student?.id || '',
            month: targetMonth,
            busId: bus?.id || '',
            stopId: stop?.id || '',
            tripType,
            daysCharged,
            discount,
            active: true,
          };
          const effectiveFare = stop ? calculateTransportFee(mockAsgn, stop) : 0;

          parsedRows.push({
            id: `csv-row-${i}-${Date.now()}`,
            regNo: rawRegNo,
            student,
            studentClass,
            busInput: rawBus,
            bus,
            stopInput: rawStop,
            stop,
            tripType,
            daysCharged,
            discount,
            effectiveFare,
            existingAsgn,
            isValid,
            isDuplicateInCsv,
            selected: isValid,
            errorMsg: errorMsg || undefined,
          });
        }

        if (parsedRows.length === 0) {
          setBulkImportStatus({ message: null, error: 'No data rows found in CSV.' });
          return;
        }

        setBulkPreviewRows(parsedRows);
        const validCount = parsedRows.filter((r) => r.isValid && !r.isDuplicateInCsv).length;
        setBulkImportStatus({
          message: `Parsed ${parsedRows.length} rows. ${validCount} valid assignment record${validCount === 1 ? '' : 's'} ready for verification.`,
          error: null,
        });
      } catch (err: any) {
        setBulkImportStatus({
          message: null,
          error: `Failed to parse CSV file: ${err.message || 'Unknown error'}`,
        });
      }
    };

    reader.readAsText(file);
  };

  const handleBulkCsvFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processTransportCsvFile(file);
    }
  };

  const handleBulkCsvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsBulkDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) {
      processTransportCsvFile(file);
    } else {
      setBulkImportStatus({ message: null, error: 'Please drop a valid .csv file.' });
    }
  };

  const handleToggleSelectRow = (rowId: string) => {
    setBulkPreviewRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleToggleSelectAllValid = () => {
    const validRows = bulkPreviewRows.filter((r) => r.isValid && !r.isDuplicateInCsv);
    const allSelected = validRows.every((r) => r.selected);
    setBulkPreviewRows((prev) =>
      prev.map((r) => (r.isValid && !r.isDuplicateInCsv ? { ...r, selected: !allSelected } : r))
    );
  };

  const handleClearBulkCsv = () => {
    setBulkCsvFile(null);
    setBulkPreviewRows([]);
    setBulkImportStatus({ message: null, error: null });
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = '';
    }
  };

  const handleCommitBulkImport = () => {
    const validSelected = bulkPreviewRows.filter(
      (r) => r.selected && r.isValid && !r.isDuplicateInCsv && r.student && r.bus && r.stop
    );
    if (validSelected.length === 0) {
      setBulkImportStatus({ message: null, error: 'No valid rows selected for import.' });
      return;
    }

    const targetMonth = csvTargetMonth || activeMonth;
    const assignmentsToSave = validSelected.map((r) => ({
      ...(r.existingAsgn ? { id: r.existingAsgn.id } : {}),
      studentId: r.student!.id,
      month: targetMonth,
      busId: r.bus!.id,
      stopId: r.stop!.id,
      tripType: r.tripType,
      daysCharged: r.daysCharged,
      discount: r.discount,
      active: true,
    }));

    bulkSaveTransportAssignments(assignmentsToSave);

    showToast(
      `Successfully recorded ${validSelected.length} transport assignment${
        validSelected.length === 1 ? '' : 's'
      } for ${targetMonth}.`,
      'success'
    );

    setShowBulkCsvModal(false);
    setBulkPreviewRows([]);
    setBulkCsvFile(null);
    setBulkImportStatus({ message: null, error: null });
  };

  const activeMonthAssignments = transportAssignments.filter(
    (a) => a.month === activeMonth && students.some((s) => s.id === a.studentId)
  );

  const sortedAssignments = [...activeMonthAssignments].sort((a, b) => {
    const sA = students.find((st) => st.id === a.studentId);
    const sB = students.find((st) => st.id === b.studentId);
    const clsA = classes.find((c) => c.id === sA?.classId);
    const clsB = classes.find((c) => c.id === sB?.classId);
    const busA = buses.find((bs) => bs.id === a.busId);
    const busB = buses.find((bs) => bs.id === b.busId);
    const stopA = stops.find((sp) => sp.id === a.stopId);
    const stopB = stops.find((sp) => sp.id === b.stopId);

    let valA: string | number = '';
    let valB: string | number = '';

    switch (sortField) {
      case 'student':
        valA = (sA?.name || '').toLowerCase();
        valB = (sB?.name || '').toLowerCase();
        break;
      case 'class':
        valA = (clsA?.name || '').toLowerCase();
        valB = (clsB?.name || '').toLowerCase();
        break;
      case 'bus':
        valA = (busA?.busNumber || '').toLowerCase();
        valB = (busB?.busNumber || '').toLowerCase();
        break;
      case 'stop':
        valA = (stopA?.name || '').toLowerCase();
        valB = (stopB?.name || '').toLowerCase();
        break;
      case 'tripType':
        valA = a.tripType || '';
        valB = b.tripType || '';
        break;
      case 'days':
        valA = a.daysCharged !== undefined ? a.daysCharged : getDaysInMonth(a.month);
        valB = b.daysCharged !== undefined ? b.daysCharged : getDaysInMonth(b.month);
        break;
      case 'discount':
        valA = a.discount || 0;
        valB = b.discount || 0;
        break;
      case 'fare':
        valA = calculateTransportFee(a, stopA);
        valB = calculateTransportFee(b, stopB);
        break;
      default:
        valA = (sA?.name || '').toLowerCase();
        valB = (sB?.name || '').toLowerCase();
    }

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  const renderSortIcon = (field: AsgnSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1 inline-block" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-teal-700 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-teal-700 ml-1 inline-block" />
    );
  };

  const toggleSelectAllAsgns = () => {
    if (selectedAsgnIds.length === activeMonthAssignments.length && activeMonthAssignments.length > 0) {
      setSelectedAsgnIds([]);
    } else {
      setSelectedAsgnIds(activeMonthAssignments.map((a) => a.id));
    }
  };

  const toggleSelectAsgn = (id: string) => {
    setSelectedAsgnIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkDeleteSelectedAsgns = () => {
    if (selectedAsgnIds.length === 0) return;
    const count = selectedAsgnIds.length;
    selectedAsgnIds.forEach((id) => deleteTransportAssignment(id));
    setSelectedAsgnIds([]);
    setCopyFeedback({
      type: 'success',
      message: `Removed ${count} transport assignment${count === 1 ? '' : 's'}.`,
    });
  };

  const handleSaveBus = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (editingBus) {
      const res = updateBus(editingBus.id, {
        busNumber: busData.busNumber.trim(),
        model: busData.model.trim(),
        regNumber: busData.regNumber.trim(),
        driverName: busData.driverName.trim(),
        driverPhone: busData.driverPhone.trim(),
        routeName: busData.routeName.trim(),
        active: busData.active,
        sortOrder: Number(busData.sortOrder) || 1,
      });
      if (res.success) {
        setShowBusModal(false);
        setEditingBus(null);
      } else {
        setFormError(res.error || 'Failed to update bus');
      }
    } else {
      const res = addBus({
        busNumber: busData.busNumber.trim(),
        model: busData.model.trim(),
        regNumber: busData.regNumber.trim(),
        driverName: busData.driverName.trim(),
        driverPhone: busData.driverPhone.trim(),
        routeName: busData.routeName.trim(),
        active: busData.active,
        sortOrder: Number(busData.sortOrder) || 1,
      });
      if (res.success) {
        setShowBusModal(false);
      } else {
        setFormError(res.error || 'Failed to add bus');
      }
    }
  };

  const handleSaveStop = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (editingStop) {
      const res = updateStop(editingStop.id, {
        name: stopData.name.trim(),
        area: stopData.area.trim(),
        landmark: stopData.landmark.trim(),
        monthlyFare: Number(stopData.monthlyFare) || 0,
        sortOrder: Number(stopData.sortOrder) || 1,
      });
      if (res.success) {
        setShowStopModal(false);
        setEditingStop(null);
      } else {
        setFormError(res.error || 'Failed to update stop');
      }
    } else {
      const res = addStop({
        name: stopData.name.trim(),
        area: stopData.area.trim(),
        landmark: stopData.landmark.trim(),
        monthlyFare: Number(stopData.monthlyFare) || 0,
        sortOrder: Number(stopData.sortOrder) || 1,
      });
      if (res.success) {
        setShowStopModal(false);
      } else {
        setFormError(res.error || 'Failed to add stop');
      }
    }
  };

  const handleSaveAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    const assignmentMonth = editingAsgn ? editingAsgn.month : activeMonth;
    const maxDays = getDaysInMonth(assignmentMonth);
    const chargedDays = Math.min(Math.max(Number(asgnData.daysCharged) || 0, 0), maxDays);

    saveTransportAssignment({
      ...(editingAsgn ? { id: editingAsgn.id } : {}),
      studentId: asgnData.studentId,
      month: assignmentMonth,
      busId: asgnData.busId,
      stopId: asgnData.stopId,
      tripType: asgnData.tripType,
      daysCharged: chargedDays,
      discount: Math.max(0, Number(asgnData.discount) || 0),
      active: asgnData.active,
    });
    setShowAsgnModal(false);
    setEditingAsgn(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bus className="w-6 h-6 text-teal-600" />
            Transport Fleet & Route Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage school buses, bus stop fares, and per-student transport assignments.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setSubTab('buses')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'buses' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Buses Fleet ({buses.length})
          </button>
          <button
            onClick={() => setSubTab('stops')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'stops' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Bus Stops & Fares ({stops.length})
          </button>
          <button
            onClick={() => setSubTab('assignments')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              subTab === 'assignments' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Student Assignments ({activeMonthAssignments.length})
          </button>
        </div>
      </div>

      {/* Subtab Content: Buses */}
      {subTab === 'buses' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">School Buses Fleet Directory</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage registered fleet vehicles, vehicle models, assigned drivers, and custom sort order.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => setBusesViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    busesViewMode === 'grid'
                      ? 'bg-white text-teal-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setBusesViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    busesViewMode === 'list'
                      ? 'bg-white text-teal-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                  <span>List</span>
                </button>
              </div>

              {hasPermission('transport.manage') && (
                <button
                  onClick={handleOpenAddBus}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add New Bus
                </button>
              )}
            </div>
          </div>

          {/* Filter / Search Bar for Buses */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search buses by number, route, model..."
                value={busSearchQuery}
                onChange={(e) => setBusSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {hasPermission('transport.manage') && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-teal-700 bg-teal-50/80 border border-teal-200 px-2.5 py-1 rounded-lg font-medium">
                  <GripVertical className="w-3.5 h-3.5 text-teal-600" />
                  <span>Drag to reorder sort positions</span>
                </span>
              )}
              <div className="text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-800">{filteredBuses.length}</span> of{' '}
                <span className="font-bold text-slate-800">{buses.length}</span> buses
              </div>
            </div>
          </div>

          {/* Buses Grid View */}
          {busesViewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBuses.length === 0 ? (
                <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 italic">
                  {busSearchQuery ? 'No buses match your search filter.' : 'No buses registered in the fleet yet.'}
                </div>
              ) : (
                filteredBuses.map((bus) => {
                  const isDragged = draggedBusId === bus.id;
                  const isDragOver = dragOverBusId === bus.id && !isDragged;

                  return (
                    <div
                      key={bus.id}
                      draggable={hasPermission('transport.manage')}
                      onDragStart={(e) => handleBusDragStart(e, bus)}
                      onDragOver={(e) => handleBusDragOver(e, bus)}
                      onDrop={(e) => handleBusDrop(e, bus)}
                      onDragEnd={handleBusDragEnd}
                      className={`group relative p-5 rounded-2xl border transition-all space-y-3 select-none ${
                        isDragged
                          ? 'opacity-40 scale-[0.98] border-dashed border-teal-500 bg-teal-50/40 ring-2 ring-teal-400/50 shadow-md'
                          : isDragOver
                          ? 'border-teal-500 ring-2 ring-teal-500/50 bg-teal-50/30 transform -translate-y-1 shadow-lg'
                          : bus.active
                          ? 'bg-white border-slate-200/80 shadow-xs hover:shadow-md hover:border-slate-300'
                          : 'bg-slate-50 border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {hasPermission('transport.manage') && (
                            <div
                              title="Drag card to reorder position"
                              className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition mt-0.5 shrink-0"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-teal-700 text-xs bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                {bus.busNumber}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.2 rounded font-mono">
                                  #{bus.sortOrder}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">Sort Position</span>
                              </div>
                              {!bus.active && (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded shrink-0">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-900 text-base mt-1 truncate">{bus.model}</h4>
                            <p className="text-xs text-slate-500 font-mono">Reg #: {bus.regNumber || '—'}</p>
                          </div>
                        </div>

                        {hasPermission('transport.manage') && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleOpenEditBus(bus)}
                              className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                              title="Edit Bus"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setBusToDelete(bus)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                              title="Delete Bus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                        <p className="font-semibold text-slate-800 truncate">
                          <span className="text-slate-400 font-normal mr-1">Route:</span>
                          {bus.routeName || '—'}
                        </p>
                        <p className="text-slate-600">
                          <span className="text-slate-400 font-normal mr-1">Driver:</span>
                          <span className="font-medium text-slate-800">{bus.driverName}</span>
                          {bus.driverPhone && (
                            <span className="text-slate-400 font-mono text-[11px] ml-1.5">
                              ({bus.driverPhone})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Buses List Table View */}
          {busesViewMode === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    <tr>
                      <th className="p-3.5 text-center w-28 whitespace-nowrap">Sort Position</th>
                      <th className="p-3.5 w-28">Bus #</th>
                      <th className="p-3.5">Model / Vehicle</th>
                      <th className="p-3.5">Reg Number</th>
                      <th className="p-3.5">Route Description</th>
                      <th className="p-3.5">Driver Name & Phone</th>
                      {hasPermission('transport.manage') && (
                        <th className="p-3.5 text-right w-24">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBuses.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hasPermission('transport.manage') ? 7 : 6}
                          className="p-8 text-center text-slate-400 italic"
                        >
                          {busSearchQuery ? 'No buses match your search filter.' : 'No buses registered in the fleet yet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredBuses.map((bus) => {
                        const isDragged = draggedBusId === bus.id;
                        const isDragOver = dragOverBusId === bus.id && !isDragged;

                        return (
                          <tr
                            key={bus.id}
                            draggable={hasPermission('transport.manage')}
                            onDragStart={(e) => handleBusDragStart(e, bus)}
                            onDragOver={(e) => handleBusDragOver(e, bus)}
                            onDrop={(e) => handleBusDrop(e, bus)}
                            onDragEnd={handleBusDragEnd}
                            className={`transition select-none ${
                              isDragged
                                ? 'opacity-40 bg-teal-50/60 border-y-2 border-teal-500'
                                : isDragOver
                                ? 'bg-teal-50/80 border-t-2 border-teal-600 shadow-xs'
                                : !bus.active
                                ? 'bg-slate-50/50 opacity-75 hover:bg-slate-100/80'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {hasPermission('transport.manage') && (
                                  <span
                                    title="Drag row to reorder position"
                                    className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </span>
                                )}
                                <span className="font-mono font-bold text-[11px] text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.5 rounded">
                                  #{bus.sortOrder}
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5 font-mono font-bold text-teal-700 whitespace-nowrap">
                              <span className="bg-teal-50 px-2 py-0.5 rounded border border-teal-200/60">
                                {bus.busNumber}
                              </span>
                            </td>
                            <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                              {bus.model}
                            </td>
                            <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">
                              {bus.regNumber || '—'}
                            </td>
                            <td className="p-3.5 text-slate-700 font-medium whitespace-nowrap">
                              {bus.routeName || '—'}
                            </td>
                            <td className="p-3.5 text-slate-600 whitespace-nowrap">
                              <span className="font-semibold text-slate-800">{bus.driverName}</span>
                              {bus.driverPhone && (
                                <span className="text-slate-400 font-mono text-[11px] ml-1.5">
                                  ({bus.driverPhone})
                                </span>
                              )}
                            </td>
                            {hasPermission('transport.manage') && (
                              <td className="p-3.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleOpenEditBus(bus)}
                                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                    title="Edit Bus"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setBusToDelete(bus)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                    title="Delete Bus"
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
        </div>
      )}

      {/* Subtab Content: Stops */}
      {subTab === 'stops' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Bus Stops & Monthly Fare Rates</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define route stop locations, landmarks, standard monthly fare tiers, and reorder sequence.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => setStopsViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    stopsViewMode === 'grid'
                      ? 'bg-white text-teal-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setStopsViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    stopsViewMode === 'list'
                      ? 'bg-white text-teal-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                  <span>List</span>
                </button>
              </div>

              {hasPermission('transport.manage') && (
                <button
                  onClick={handleOpenAddStop}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Bus Stop
                </button>
              )}
            </div>
          </div>

          {/* Filter / Search Bar for Stops */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search stops by name, area, landmark..."
                value={stopSearchQuery}
                onChange={(e) => setStopSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {hasPermission('transport.manage') && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-teal-700 bg-teal-50/80 border border-teal-200 px-2.5 py-1 rounded-lg font-medium">
                  <GripVertical className="w-3.5 h-3.5 text-teal-600" />
                  <span>Drag to reorder sort positions</span>
                </span>
              )}
              <div className="text-slate-500 font-medium">
                Showing <span className="font-bold text-slate-800">{filteredStops.length}</span> of{' '}
                <span className="font-bold text-slate-800">{stops.length}</span> bus stops
              </div>
            </div>
          </div>

          {/* Stops Grid View */}
          {stopsViewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredStops.length === 0 ? (
                <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 italic">
                  {stopSearchQuery ? 'No bus stops match your search filter.' : 'No bus stops registered yet.'}
                </div>
              ) : (
                filteredStops.map((stop) => {
                  const isDragged = draggedStopId === stop.id;
                  const isDragOver = dragOverStopId === stop.id && !isDragged;

                  return (
                    <div
                      key={stop.id}
                      draggable={hasPermission('transport.manage')}
                      onDragStart={(e) => handleStopDragStart(e, stop)}
                      onDragOver={(e) => handleStopDragOver(e, stop)}
                      onDrop={(e) => handleStopDrop(e, stop)}
                      onDragEnd={handleStopDragEnd}
                      className={`group relative p-5 rounded-2xl border transition-all space-y-2 select-none ${
                        isDragged
                          ? 'opacity-40 scale-[0.98] border-dashed border-teal-500 bg-teal-50/40 ring-2 ring-teal-400/50 shadow-md'
                          : isDragOver
                          ? 'border-teal-500 ring-2 ring-teal-500/50 bg-teal-50/30 transform -translate-y-1 shadow-lg'
                          : 'bg-white border-slate-200/80 shadow-xs hover:shadow-md hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {hasPermission('transport.manage') && (
                            <div
                              title="Drag card to reorder position"
                              className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition mt-0.5 shrink-0"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <h4 className="font-bold text-slate-900 text-sm truncate">{stop.name}</h4>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.2 rounded font-mono">
                                #{stop.sortOrder}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">Sort Position</span>
                            </div>
                          </div>
                        </div>

                        {hasPermission('transport.manage') && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleOpenEditStop(stop)}
                              className="p-1 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded cursor-pointer transition"
                              title="Edit Bus Stop"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setStopToDelete(stop)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer transition"
                              title="Delete Bus Stop"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {[stop.area, stop.landmark].filter(Boolean).join(' • ') || '—'}
                      </p>
                      <p className="font-bold text-teal-700 text-sm pt-2 border-t border-slate-100">
                        {formatCurrency(stop.monthlyFare)} / mo
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Stops List Table View */}
          {stopsViewMode === 'list' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    <tr>
                      <th className="p-3.5 text-center w-28 whitespace-nowrap">Sort Position</th>
                      <th className="p-3.5">Stop Name</th>
                      <th className="p-3.5">Area / Sector</th>
                      <th className="p-3.5">Landmark</th>
                      <th className="p-3.5 text-right">Monthly Fare Rate</th>
                      {hasPermission('transport.manage') && (
                        <th className="p-3.5 text-right w-24">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStops.length === 0 ? (
                      <tr>
                        <td
                          colSpan={hasPermission('transport.manage') ? 6 : 5}
                          className="p-8 text-center text-slate-400 italic"
                        >
                          {stopSearchQuery ? 'No bus stops match your search filter.' : 'No bus stops registered yet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredStops.map((stop) => {
                        const isDragged = draggedStopId === stop.id;
                        const isDragOver = dragOverStopId === stop.id && !isDragged;

                        return (
                          <tr
                            key={stop.id}
                            draggable={hasPermission('transport.manage')}
                            onDragStart={(e) => handleStopDragStart(e, stop)}
                            onDragOver={(e) => handleStopDragOver(e, stop)}
                            onDrop={(e) => handleStopDrop(e, stop)}
                            onDragEnd={handleStopDragEnd}
                            className={`transition select-none ${
                              isDragged
                                ? 'opacity-40 bg-teal-50/60 border-y-2 border-teal-500'
                                : isDragOver
                                ? 'bg-teal-50/80 border-t-2 border-teal-600 shadow-xs'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {hasPermission('transport.manage') && (
                                  <span
                                    title="Drag row to reorder position"
                                    className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </span>
                                )}
                                <span className="font-mono font-bold text-[11px] text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.5 rounded">
                                  #{stop.sortOrder}
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                                <span className="font-bold text-slate-900">{stop.name}</span>
                              </div>
                            </td>
                            <td className="p-3.5 text-slate-700 whitespace-nowrap">
                              {stop.area || '—'}
                            </td>
                            <td className="p-3.5 text-slate-500 whitespace-nowrap">
                              {stop.landmark || '—'}
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-teal-700 text-sm whitespace-nowrap">
                              {formatCurrency(stop.monthlyFare)} / mo
                            </td>
                            {hasPermission('transport.manage') && (
                              <td className="p-3.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => handleOpenEditStop(stop)}
                                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                    title="Edit Bus Stop"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setStopToDelete(stop)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                    title="Delete Bus Stop"
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
        </div>
      )}

      {/* Subtab Content: Student Assignments */}
      {subTab === 'assignments' && (
        <div className="space-y-4">
          {/* Copy feedback alert */}
          {copyFeedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-fadeIn ${
                copyFeedback.type === 'success'
                  ? 'bg-teal-50 border-teal-200 text-teal-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {copyFeedback.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{copyFeedback.message}</span>
              </div>
              <button
                onClick={() => setCopyFeedback(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Student Transport Assignments ({activeMonth})
              </h3>
              <p className="text-[11px] text-slate-500">
                Prorated fare formula: (Base Stop Fare − Discount) × (Days Availed ÷ {totalDaysInMonth} Days) × Trip Factor (rounded up to nearest multiple of 50)
              </p>
            </div>

            {hasPermission('transport.manage') && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Global Active Days Input Text + Dropdown Field */}
                <div
                  id="transport-global-active-days-control"
                  className="flex items-center bg-slate-50 border border-slate-300 rounded-xl p-1 shadow-2xs"
                >
                  <div className="flex items-center gap-1.5 px-2 text-slate-700 font-bold text-xs">
                    <CalendarDays className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="whitespace-nowrap">Active Days:</span>
                  </div>

                  {/* Number / Text Input */}
                  <input
                    type="number"
                    min="0"
                    max={totalDaysInMonth}
                    value={globalMonthDays}
                    onChange={(e) => handleGlobalDaysChange(Number(e.target.value))}
                    className="w-14 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                    title={`Enter active days in ${activeMonth} (0 to ${totalDaysInMonth})`}
                  />

                  <span className="text-[11px] font-semibold text-slate-500 px-1">/ {totalDaysInMonth}d</span>

                  {/* Quick Preset Dropdown */}
                  <select
                    value={globalMonthDays}
                    onChange={(e) => handleGlobalDaysChange(Number(e.target.value))}
                    className="bg-white text-slate-800 font-semibold text-xs py-1 px-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer text-[11px] shadow-2xs"
                    title="Select active days preset"
                  >
                    <option value={totalDaysInMonth}>Full ({totalDaysInMonth}d)</option>
                    <option value={Math.round(totalDaysInMonth / 2)}>Half ({Math.round(totalDaysInMonth / 2)}d)</option>
                    <option value={26}>26 days</option>
                    <option value={24}>24 days</option>
                    <option value={22}>22 days (Working)</option>
                    <option value={20}>20 days</option>
                    <option value={15}>15 days</option>
                    <option value={10}>10 days</option>
                    <option value={0}>0 days</option>
                    {![
                      totalDaysInMonth,
                      Math.round(totalDaysInMonth / 2),
                      26,
                      24,
                      22,
                      20,
                      15,
                      10,
                      0,
                    ].includes(globalMonthDays) && (
                      <option value={globalMonthDays}>Custom ({globalMonthDays}d)</option>
                    )}
                  </select>

                  {/* Apply to existing month assignments button */}
                  {activeMonthAssignments.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplyGlobalDaysToAll}
                      className="ml-1 px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-bold transition cursor-pointer whitespace-nowrap shadow-2xs"
                      title={`Apply ${globalMonthDays} days to all ${activeMonthAssignments.length} assignments in ${activeMonth}`}
                    >
                      Apply to All
                    </button>
                  )}
                </div>

                {/* Copy Previous Month Button */}
                <button
                  type="button"
                  onClick={handleCopyPreviousMonth}
                  className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold px-3 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                  title={`Copy transport assignments from previous month with ${globalMonthDays} active days`}
                >
                  <Copy className="w-3.5 h-3.5 text-teal-600" />
                  <span>Copy Previous Month</span>
                </button>

                {/* Import CSV Button */}
                <button
                  type="button"
                  onClick={handleOpenBulkCsvModal}
                  className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-teal-700 border border-teal-200 hover:border-teal-300 font-bold px-3 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                  title="Upload student transport assignments via CSV"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-600" />
                  <span>Import CSV</span>
                </button>

                <button
                  onClick={handleOpenAddAssignment}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Assign Student</span>
                </button>
              </div>
            )}
          </div>

          {/* Bulk Selection Action Bar */}
          {selectedAsgnIds.length > 0 && hasPermission('transport.manage') && (
            <div className="bg-teal-50 border border-teal-200 p-3 rounded-xl flex items-center justify-between animate-fadeIn text-xs shadow-xs">
              <div className="flex items-center gap-2">
                <span className="bg-teal-700 text-white font-bold px-2 py-0.5 rounded-md text-[11px]">
                  {selectedAsgnIds.length}
                </span>
                <span className="font-bold text-teal-900">
                  assignment{selectedAsgnIds.length === 1 ? '' : 's'} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAsgnIds([])}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteSelectedAsgns}
                  className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-lg shadow-2xs transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Selected ({selectedAsgnIds.length})</span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 min-w-[850px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider select-none whitespace-nowrap">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          activeMonthAssignments.length > 0 &&
                          selectedAsgnIds.length === activeMonthAssignments.length
                        }
                        onChange={toggleSelectAllAsgns}
                        className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        title="Select all transport assignments in current month"
                      />
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('student')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Student Name</span>
                        {renderSortIcon('student')}
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('class')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Class</span>
                        {renderSortIcon('class')}
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('bus')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Bus Number</span>
                        {renderSortIcon('bus')}
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('stop')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Bus Stop</span>
                        {renderSortIcon('stop')}
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('tripType')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Trip Type</span>
                        {renderSortIcon('tripType')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-center cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('days')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Days Availed</span>
                        {renderSortIcon('days')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-right cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('discount')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Discount</span>
                        {renderSortIcon('discount')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-right cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                      onClick={() => handleSort('fare')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Effective Fare</span>
                        {renderSortIcon('fare')}
                      </div>
                    </th>
                    <th className="p-3 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAssignments.map((a) => {
                    const s = students.find((st) => st.id === a.studentId);
                    const cls = classes.find((c) => c.id === s?.classId);
                    const bus = buses.find((b) => b.id === a.busId);
                    const stop = stops.find((sp) => sp.id === a.stopId);
                    const totalMonthDays = getDaysInMonth(a.month);
                    const daysAvailed = a.daysCharged !== undefined ? a.daysCharged : totalMonthDays;
                    const calculatedFee = calculateTransportFee(a, stop);
                    const isSelected = selectedAsgnIds.includes(a.id);

                    return (
                      <tr
                        key={a.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isSelected ? 'bg-teal-50/50' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectAsgn(a.id)}
                            className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <StudentAvatar photoUrl={s?.photoUrl} name={s?.name || 'Student'} size="xs" />
                            <div>
                              <span className="font-bold text-slate-900 block">{s?.name}</span>
                              <span className="text-[10px] text-slate-500">{s?.regNo}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">{cls?.name}</td>
                        <td className="p-3 font-mono font-bold text-teal-700 whitespace-nowrap">{bus?.busNumber}</td>
                        <td className="p-3 text-slate-800 whitespace-nowrap">
                          <div>
                            <span className="font-medium">{stop?.name}</span>
                            <span className="block text-[10px] text-slate-400">
                              Base: {stop ? formatCurrency(stop.monthlyFare) : 'Rs. 0'}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              a.tripType === 'OneWay'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : 'bg-teal-50 text-teal-700 border border-teal-200'
                            }`}
                          >
                            {a.tripType === 'OneWay' ? 'One Way' : 'Round Trip'}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="font-semibold text-slate-800">
                            {daysAvailed} / {totalMonthDays} d
                          </span>
                        </td>
                        <td className="p-3 text-right text-slate-600 whitespace-nowrap">
                          {a.discount ? formatCurrency(a.discount) : '-'}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <span className="font-bold text-slate-900">{formatCurrency(calculatedFee)}</span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {hasPermission('transport.manage') && (
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => handleOpenEditAssignment(a)}
                                className="flex items-center gap-1 text-teal-600 hover:text-teal-800 font-bold cursor-pointer"
                                title="Edit Assignment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => setAsgnToDelete(a)}
                                className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {activeMonthAssignments.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">
                        No transport assignments created for {activeMonth} yet. Click "Copy Previous Month" or "Assign Student" to add.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bus Modal */}
      {showBusModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingBus ? 'Edit School Bus' : 'Add School Bus'}
              </h3>
              <button onClick={() => setShowBusModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && <p className="text-xs text-rose-600">{formError}</p>}

            <form onSubmit={handleSaveBus} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Bus Number *</label>
                <input
                  type="text"
                  required
                  value={busData.busNumber}
                  onChange={(e) => setBusData({ ...busData, busNumber: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Model & Registration</label>
                <input
                  type="text"
                  value={busData.model}
                  onChange={(e) => setBusData({ ...busData, model: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Driver Name & Phone</label>
                <input
                  type="text"
                  value={busData.driverName}
                  onChange={(e) => setBusData({ ...busData, driverName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Route Description</label>
                <input
                  type="text"
                  value={busData.routeName}
                  onChange={(e) => setBusData({ ...busData, routeName: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Sort Position #</label>
                <input
                  type="number"
                  min="1"
                  value={busData.sortOrder}
                  onChange={(e) => setBusData({ ...busData, sortOrder: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBusModal(false)}
                  className="px-4 py-2 border rounded-xl"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-teal-600 text-white font-bold rounded-xl">
                  {editingBus ? 'Update Bus' : 'Save Bus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stop Modal */}
      {showStopModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingStop ? 'Edit Bus Stop' : 'Add Bus Stop'}
              </h3>
              <button onClick={() => setShowStopModal(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && <p className="text-xs text-rose-600">{formError}</p>}

            <form onSubmit={handleSaveStop} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Stop Name *</label>
                <input
                  type="text"
                  required
                  value={stopData.name}
                  onChange={(e) => setStopData({ ...stopData, name: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Area / Sector</label>
                <input
                  type="text"
                  value={stopData.area}
                  onChange={(e) => setStopData({ ...stopData, area: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Landmark</label>
                <input
                  type="text"
                  value={stopData.landmark}
                  onChange={(e) => setStopData({ ...stopData, landmark: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Monthly Fare (Rs.) *</label>
                <input
                  type="number"
                  step="50"
                  required
                  value={stopData.monthlyFare}
                  onChange={(e) => setStopData({ ...stopData, monthlyFare: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Sort Position #</label>
                <input
                  type="number"
                  min="1"
                  value={stopData.sortOrder}
                  onChange={(e) => setStopData({ ...stopData, sortOrder: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowStopModal(false)}
                  className="px-4 py-2 border rounded-xl"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-teal-600 text-white font-bold rounded-xl">
                  {editingStop ? 'Update Stop' : 'Save Stop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAsgnModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-fadeIn">
            {/* Modal Header */}
            <div className="px-6 py-3.5 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                  <Bus className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 leading-none">
                      {editingAsgn ? 'Edit Transport Assignment' : 'Assign Student Transport'}
                    </h3>
                    <span className="bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {editingAsgn ? editingAsgn.month : activeMonth}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configure student route, stop fare, trip type, and monthly proration.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAsgnModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="flex flex-col text-xs">
              {/* Form Body - 2 Columns */}
              <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left Column: Student & Fleet Configuration */}
                <div className="space-y-3.5">
                  {/* Student Grouped Combobox */}
                  {(() => {
                    const targetMonth = editingAsgn ? editingAsgn.month : activeMonth;
                    const activeStudentsList = students.filter((s) => s.status === 'Active');
                    const q = studentSearchQuery.toLowerCase().trim();
                    const filteredStudents = activeStudentsList.filter((s) => {
                      if (!q) return true;
                      const cls = classes.find((c) => c.id === s.classId);
                      return (
                        s.name.toLowerCase().includes(q) ||
                        s.regNo.toLowerCase().includes(q) ||
                        (cls?.name && cls.name.toLowerCase().includes(q))
                      );
                    });

                    const unassignedStudents = filteredStudents.filter(
                      (s) =>
                        !transportAssignments.some(
                          (a) => a.studentId === s.id && a.month === targetMonth && a.id !== editingAsgn?.id
                        )
                    );

                    const assignedStudents = filteredStudents.filter(
                      (s) =>
                        transportAssignments.some(
                          (a) => a.studentId === s.id && a.month === targetMonth && a.id !== editingAsgn?.id
                        )
                    );

                    const selectedStudent = students.find((s) => s.id === asgnData.studentId);
                    const selectedClass = classes.find((c) => c.id === selectedStudent?.classId);
                    const isSelectedAssigned = selectedStudent
                      ? transportAssignments.some(
                          (a) => a.studentId === selectedStudent.id && a.month === targetMonth && a.id !== editingAsgn?.id
                        )
                      : false;

                    return (
                      <div className="relative space-y-1" ref={studentComboRef}>
                        <div className="flex items-center justify-between">
                          <label className="block font-bold text-slate-800">Student *</label>
                          {selectedStudent && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isSelectedAssigned
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {isSelectedAssigned ? 'Assigned' : 'Unassigned'}
                            </span>
                          )}
                        </div>

                        {/* Combobox Trigger Button */}
                        <button
                          type="button"
                          onClick={() => !editingAsgn && setIsStudentComboOpen((prev) => !prev)}
                          disabled={!!editingAsgn}
                          className={`w-full flex items-center justify-between p-2 bg-slate-50 border rounded-xl text-left transition cursor-pointer shadow-2xs ${
                            editingAsgn
                              ? 'border-slate-200 opacity-80 cursor-not-allowed bg-slate-100'
                              : isStudentComboOpen
                              ? 'border-teal-500 ring-2 ring-teal-500/20 bg-white'
                              : 'border-slate-200 hover:border-teal-400 hover:bg-white'
                          }`}
                        >
                          {selectedStudent ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <StudentAvatar photoUrl={selectedStudent.photoUrl} name={selectedStudent.name} size="xs" />
                              <div className="truncate">
                                <span className="font-bold text-slate-900 block truncate leading-tight">
                                  {selectedStudent.name}
                                </span>
                                <span className="text-[10px] text-slate-500 leading-tight">
                                  {selectedStudent.regNo} &bull; {selectedClass?.name || 'Class'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-500 py-0.5">
                              <Search className="w-4 h-4 text-teal-600 shrink-0" />
                              <span className="text-xs font-medium text-slate-600">
                                Select student here...
                              </span>
                            </div>
                          )}
                          {!editingAsgn && (
                            <ChevronsUpDown
                              className={`w-4 h-4 text-slate-400 shrink-0 ml-1 transition-transform duration-200 ${
                                isStudentComboOpen ? 'text-teal-600 rotate-180' : ''
                              }`}
                            />
                          )}
                        </button>

                        {/* Combobox Dropdown Popover */}
                        {isStudentComboOpen && !editingAsgn && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-fadeIn">
                            {/* Search Input Box */}
                            <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                              <div className="relative">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Search by name, roll # (e.g. 1001), class..."
                                  value={studentSearchQuery}
                                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                                />
                                {studentSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setStudentSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Grouped Options List */}
                            <div className="max-h-48 overflow-y-auto scroll-smooth p-1 divide-y divide-slate-100">
                              {/* Group 1: Unassigned */}
                              <div className="sticky top-0 bg-slate-100/95 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-emerald-800 rounded-md flex items-center justify-between z-10 my-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                  <span>Unassigned</span>
                                </div>
                                <span className="bg-emerald-200/80 text-emerald-900 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                                  {unassignedStudents.length}
                                </span>
                              </div>

                              {unassignedStudents.length === 0 ? (
                                <div className="p-2 text-center text-slate-400 text-[11px] italic">
                                  No unassigned students {studentSearchQuery ? 'matching search' : 'available'}
                                </div>
                              ) : (
                                unassignedStudents.map((s) => {
                                  const cls = classes.find((c) => c.id === s.classId);
                                  const isSelected = asgnData.studentId === s.id;
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectStudentForAssignment(s.id);
                                        setIsStudentComboOpen(false);
                                      }}
                                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer text-xs ${
                                        isSelected
                                          ? 'bg-teal-50 border border-teal-300 font-bold text-teal-950 shadow-2xs'
                                          : 'hover:bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                                        <div className="truncate">
                                          <span className="font-semibold block truncate text-slate-900">{s.name}</span>
                                          <span className="text-[10px] text-slate-500">
                                            {s.regNo} &bull; {cls?.name || 'No Class'}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 ml-2">
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                          Unassigned
                                        </span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 ml-1" />}
                                      </div>
                                    </button>
                                  );
                                })
                              )}

                              {/* Group 2: Assigned - Update Assignment */}
                              <div className="sticky top-0 bg-slate-100/95 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-amber-800 rounded-md flex items-center justify-between z-10 my-0.5 mt-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  <span>Assigned</span>
                                </div>
                                <span className="bg-amber-200/80 text-amber-900 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                                  {assignedStudents.length}
                                </span>
                              </div>

                              {assignedStudents.length === 0 ? (
                                <div className="p-2 text-center text-slate-400 text-[11px] italic">
                                  No assigned students {studentSearchQuery ? 'matching search' : ''}
                                </div>
                              ) : (
                                assignedStudents.map((s) => {
                                  const cls = classes.find((c) => c.id === s.classId);
                                  const isSelected = asgnData.studentId === s.id;
                                  const currentAsgn = transportAssignments.find(
                                    (a) => a.studentId === s.id && a.month === targetMonth && a.id !== editingAsgn?.id
                                  );
                                  const bus = buses.find((b) => b.id === currentAsgn?.busId);
                                  const stop = stops.find((sp) => sp.id === currentAsgn?.stopId);

                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectStudentForAssignment(s.id);
                                        setIsStudentComboOpen(false);
                                      }}
                                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer text-xs ${
                                        isSelected
                                          ? 'bg-amber-50 border border-amber-300 font-bold text-amber-950 shadow-2xs'
                                          : 'hover:bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <StudentAvatar photoUrl={s.photoUrl} name={s.name} size="xs" />
                                        <div className="truncate">
                                          <span className="font-semibold block truncate text-slate-900">{s.name}</span>
                                          <span className="text-[10px] text-slate-500">
                                            {s.regNo} &bull; {cls?.name || 'Class'} &bull;{' '}
                                            <span className="text-amber-700 font-medium">
                                              {bus?.busNumber || 'Bus'} ({stop?.name || 'Stop'})
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 ml-2">
                                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                          Assigned
                                        </span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 ml-1" />}
                                      </div>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Bus & Stop Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Bus *</label>
                      <select
                        value={asgnData.busId}
                        onChange={(e) => setAsgnData({ ...asgnData, busId: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      >
                        {buses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.busNumber} - {b.routeName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Stop & Fare *</label>
                      <select
                        value={asgnData.stopId}
                        onChange={(e) => setAsgnData({ ...asgnData, stopId: e.target.value })}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                      >
                        {stops.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name} ({formatCurrency(sp.monthlyFare)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Trip Type Selector */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Trip Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAsgnData({ ...asgnData, tripType: 'RoundTrip' })}
                        className={`p-2 rounded-xl border text-center font-semibold transition cursor-pointer text-xs ${
                          asgnData.tripType === 'RoundTrip'
                            ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-500'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        🔄 Round Trip (1.0×)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAsgnData({ ...asgnData, tripType: 'OneWay' })}
                        className={`p-2 rounded-xl border text-center font-semibold transition cursor-pointer text-xs ${
                          asgnData.tripType === 'OneWay'
                            ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-500'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        ➡️ One Way (0.5×)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Billing, Proration & Calculation Summary */}
                {(() => {
                  const targetMonth = editingAsgn ? editingAsgn.month : activeMonth;
                  const totalDaysInMonth = getDaysInMonth(targetMonth);
                  const selectedStop = stops.find((s) => s.id === asgnData.stopId);
                  const baseFare = selectedStop ? selectedStop.monthlyFare : 0;
                  const discount = Math.max(0, Number(asgnData.discount) || 0);
                  const baseDiscounted = Math.max(0, baseFare - discount);
                  const daysAvailed = Math.min(Math.max(Number(asgnData.daysCharged) || 0, 0), totalDaysInMonth);
                  const tripFactor = asgnData.tripType === 'OneWay' ? 0.5 : 1.0;
                  const calculatedFare = roundBusFareUp(baseDiscounted * (daysAvailed / totalDaysInMonth) * tripFactor);

                  return (
                    <div className="space-y-3 flex flex-col justify-between">
                      {/* Days Availed & Discount Row */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block font-bold text-slate-700">Days Availed *</label>
                            <span className="text-[10px] text-slate-400 font-mono">Max: {totalDaysInMonth}d</span>
                          </div>
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="0"
                              max={totalDaysInMonth}
                              value={asgnData.daysCharged}
                              onChange={(e) =>
                                setAsgnData({
                                  ...asgnData,
                                  daysCharged: Math.min(Math.max(Number(e.target.value) || 0, 0), totalDaysInMonth),
                                })
                              }
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                              placeholder="Days"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setAsgnData({ ...asgnData, daysCharged: totalDaysInMonth })}
                                className={`flex-1 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                                  asgnData.daysCharged === totalDaysInMonth
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                                }`}
                              >
                                Full ({totalDaysInMonth}d)
                              </button>
                              <button
                                type="button"
                                onClick={() => setAsgnData({ ...asgnData, daysCharged: Math.round(totalDaysInMonth / 2) })}
                                className={`flex-1 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                                  asgnData.daysCharged === Math.round(totalDaysInMonth / 2)
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                                }`}
                              >
                                Half ({Math.round(totalDaysInMonth / 2)}d)
                              </button>
                              <button
                                type="button"
                                onClick={() => setAsgnData({ ...asgnData, daysCharged: 0 })}
                                className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition cursor-pointer ${
                                  asgnData.daysCharged === 0
                                    ? 'bg-teal-600 text-white border-teal-600'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                                }`}
                              >
                                0d
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Discount (Rs.)</label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={asgnData.discount}
                            onChange={(e) =>
                              setAsgnData({
                                ...asgnData,
                                discount: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                            placeholder="0"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Pre-proration deduction</p>
                        </div>
                      </div>

                      {/* Live Calculation Summary Card */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] space-y-2">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                          <div className="flex justify-between">
                            <span>Base Stop:</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(baseFare)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Discount:</span>
                            <span className={`font-semibold ${discount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                              {discount > 0 ? `- ${formatCurrency(discount)}` : 'Rs. 0'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Days Prorated:</span>
                            <span className="font-semibold text-slate-800">
                              {daysAvailed}/{totalDaysInMonth}d ({((daysAvailed / totalDaysInMonth) * 100).toFixed(0)}%)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Trip Factor:</span>
                            <span className="font-semibold text-slate-800">
                              {asgnData.tripType === 'OneWay' ? '0.5×' : '1.0×'}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-xs">Effective Monthly Fare:</span>
                          <span className="text-base font-extrabold text-teal-700">{formatCurrency(calculatedFare)}</span>
                        </div>
                        <div className="text-[9.5px] text-slate-400 font-mono text-center truncate">
                          ({baseFare} − {discount}) × ({daysAvailed}/{totalDaysInMonth}) × {tripFactor} = Rs. {calculatedFare.toLocaleString()} (rounded up to 50)
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-slate-50/90 border-t border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
                  <span>Target Month: <strong className="text-slate-800">{editingAsgn ? editingAsgn.month : activeMonth}</strong></span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAsgnModal(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 transition cursor-pointer shadow-2xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingAsgn ? 'Update Assignment' : 'Save Assignment'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Transport Assignments CSV Import Modal */}
      {showBulkCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className={`bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden transition-all duration-200 my-8 w-full ${
            bulkPreviewRows.length > 0 ? 'max-w-5xl' : 'max-w-xl'
          }`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center text-teal-700">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm md:text-base">
                    Import Student Transport Assignments via CSV
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bulk assign fleet buses, bus stop fares, and active days for target month <strong className="text-teal-700 font-bold">{csvTargetMonth || activeMonth}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBulkCsvModal(false);
                  handleClearBulkCsv();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Feedback messages */}
              {bulkImportStatus.error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">{bulkImportStatus.error}</div>
                </div>
              )}

              {bulkImportStatus.message && (
                <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex items-start gap-2.5 text-xs text-teal-800 animate-fadeIn">
                  <CheckCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div className="flex-1">{bulkImportStatus.message}</div>
                </div>
              )}

              {/* State 1: Upload Dropzone & Setup */}
              {bulkPreviewRows.length === 0 ? (
                <div className="space-y-4">
                  {/* Target Month & Default Active Days Settings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">
                        Target Fee Month
                      </label>
                      <input
                        type="month"
                        value={csvTargetMonth}
                        onChange={(e) => {
                          setCsvTargetMonth(e.target.value);
                          const days = getDaysInMonth(e.target.value);
                          setCsvDefaultDays(days);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">
                        Default Active Days (if omitted in CSV)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={getDaysInMonth(csvTargetMonth)}
                          value={csvDefaultDays}
                          onChange={(e) => setCsvDefaultDays(Number(e.target.value) || 0)}
                          className="w-20 bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-center text-slate-800 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        />
                        <span className="text-slate-500 text-[11px]">
                          / {getDaysInMonth(csvTargetMonth)} days max
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Drag & Drop File Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsBulkDragging(true);
                    }}
                    onDragLeave={() => setIsBulkDragging(false)}
                    onDrop={handleBulkCsvDrop}
                    onClick={() => bulkFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-150 ${
                      isBulkDragging
                        ? 'border-teal-500 bg-teal-50/60 scale-[1.01]'
                        : 'border-slate-300 hover:border-teal-400 bg-slate-50/50 hover:bg-teal-50/20'
                    }`}
                  >
                    <input
                      ref={bulkFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleBulkCsvFileInputChange}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-2xs">
                      <Upload className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Click to browse or drag & drop CSV file
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Upload your transport assignments spreadsheet with student registration numbers, buses, and stops.
                    </p>
                  </div>

                  {/* Sample Format & Template Download */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Supported CSV Columns:</span>
                      <button
                        type="button"
                        onClick={handleDownloadSampleTransportCsv}
                        className="flex items-center gap-1 text-teal-700 hover:text-teal-800 font-bold hover:underline cursor-pointer text-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Sample CSV</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-teal-700">RegNo *</span>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">e.g. REG-1001</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-800">BusNumber</span>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">e.g. BUS-01</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-800">StopName</span>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">e.g. Saddar</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-800">TripType</span>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">RoundTrip / OneWay</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-800">DaysAvailed</span>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">e.g. 31 or 22</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-800">Discount</span>
                        <p className="text-[10px] text-slate-500 font-sans mt-0.5">e.g. 0 or 200</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* State 2: Verification Preview Table */
                <div className="space-y-4">
                  {/* Summary Metric Cards */}
                  {(() => {
                    const validSelected = bulkPreviewRows.filter(
                      (r) => r.selected && r.isValid && !r.isDuplicateInCsv
                    );
                    const totalEstFee = validSelected.reduce((sum, r) => sum + r.effectiveFare, 0);
                    const updateCount = validSelected.filter((r) => !!r.existingAsgn).length;
                    const newCount = validSelected.filter((r) => !r.existingAsgn).length;
                    const errorCount = bulkPreviewRows.filter((r) => !r.isValid || r.isDuplicateInCsv).length;

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                          <span className="text-slate-500">Total Rows</span>
                          <p className="text-lg font-bold text-slate-900 mt-0.5">
                            {bulkPreviewRows.length}
                          </p>
                        </div>
                        <div className="bg-teal-50 p-3 rounded-xl border border-teal-200 text-xs">
                          <span className="text-teal-700 font-bold">Ready to Assign</span>
                          <p className="text-lg font-bold text-teal-900 mt-0.5">
                            {validSelected.length}{' '}
                            <span className="text-xs font-normal text-teal-700">
                              ({newCount} new, {updateCount} updates)
                            </span>
                          </p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                          <span className="text-slate-500">Est. Transport Revenue</span>
                          <p className="text-lg font-bold text-slate-900 mt-0.5">
                            {formatCurrency(totalEstFee)}
                          </p>
                        </div>
                        <div className={`p-3 rounded-xl border text-xs ${
                          errorCount > 0
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}>
                          <span className="font-bold">Errors / Unmatched</span>
                          <p className="text-lg font-bold mt-0.5">
                            {errorCount}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions Bar above Table */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllValid}
                      className="flex items-center gap-1.5 font-bold text-teal-700 hover:text-teal-800 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Toggle Select All Valid</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearBulkCsv}
                      className="text-slate-500 hover:text-rose-600 font-semibold cursor-pointer transition"
                    >
                      Clear & Upload Another CSV
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="max-h-[380px] overflow-y-auto border border-slate-200 rounded-2xl overflow-x-auto shadow-2xs">
                    <table className="w-full text-left text-xs min-w-[750px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10 whitespace-nowrap">
                        <tr>
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                bulkPreviewRows.filter((r) => r.isValid && !r.isDuplicateInCsv).length > 0 &&
                                bulkPreviewRows.filter((r) => r.isValid && !r.isDuplicateInCsv).every((r) => r.selected)
                              }
                              onChange={handleToggleSelectAllValid}
                              className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                            />
                          </th>
                          <th className="p-3">Student</th>
                          <th className="p-3">Class</th>
                          <th className="p-3">Bus</th>
                          <th className="p-3">Bus Stop</th>
                          <th className="p-3 text-center">Trip</th>
                          <th className="p-3 text-center">Days</th>
                          <th className="p-3 text-right">Discount</th>
                          <th className="p-3 text-right">Net Fare</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkPreviewRows.map((row) => {
                          const isRowValid = row.isValid && !row.isDuplicateInCsv;
                          return (
                            <tr
                              key={row.id}
                              className={`transition-colors ${
                                !isRowValid
                                  ? 'bg-rose-50/40 text-slate-400'
                                  : row.selected
                                  ? 'bg-teal-50/40 hover:bg-teal-50/70'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!isRowValid}
                                  checked={row.selected && isRowValid}
                                  onChange={() => handleToggleSelectRow(row.id)}
                                  className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30"
                                />
                              </td>

                              <td className="p-3">
                                {row.student ? (
                                  <div>
                                    <span className="font-bold text-slate-900 block">
                                      {row.student.name}
                                    </span>
                                    <span className="font-mono text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                                      {row.student.regNo}
                                    </span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="font-mono font-bold text-rose-700">
                                      {row.regNo}
                                    </span>
                                    <span className="text-[10px] text-rose-500 block">Unmatched</span>
                                  </div>
                                )}
                              </td>

                              <td className="p-3 text-slate-600">
                                {row.studentClass?.name || '—'}
                              </td>

                              <td className="p-3">
                                {row.bus ? (
                                  <span className="font-bold font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {row.bus.busNumber}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 italic text-[11px]">
                                    {row.busInput || 'None'}
                                  </span>
                                )}
                              </td>

                              <td className="p-3">
                                {row.stop ? (
                                  <div>
                                    <span className="font-bold text-slate-900 block">
                                      {row.stop.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      Base: {formatCurrency(row.stop.monthlyFare)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-rose-600 italic text-[11px]">
                                    {row.stopInput || 'None'}
                                  </span>
                                )}
                              </td>

                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                                  row.tripType === 'RoundTrip'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {row.tripType === 'RoundTrip' ? 'Round' : 'One Way'}
                                </span>
                              </td>

                              <td className="p-3 text-center font-bold text-slate-700">
                                {row.daysCharged}d
                              </td>

                              <td className="p-3 text-right font-mono text-slate-600">
                                {row.discount > 0 ? formatCurrency(row.discount) : '—'}
                              </td>

                              <td className="p-3 text-right font-mono font-bold text-teal-700 text-sm">
                                {isRowValid ? formatCurrency(row.effectiveFare) : '—'}
                              </td>

                              <td className="p-3 text-center">
                                {!isRowValid ? (
                                  <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">
                                    {row.errorMsg || 'Invalid'}
                                  </span>
                                ) : row.existingAsgn ? (
                                  <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                                    Update Existing
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-teal-50 text-teal-800 border border-teal-200 whitespace-nowrap">
                                    New Assignment
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setShowBulkCsvModal(false);
                  handleClearBulkCsv();
                }}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>

              {bulkPreviewRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleCommitBulkImport}
                  disabled={
                    bulkPreviewRows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length === 0
                  }
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Confirm & Save {
                      bulkPreviewRows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length
                    } Assignment(s)
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Bus Confirmation Modal */}
      {(() => {
        const assignedStudents = busToDelete
          ? transportAssignments.filter(
              (a) => a.busId === busToDelete.id && a.month === activeMonth && students.some((s) => s.id === a.studentId)
            )
          : [];
        const hasAssigned = assignedStudents.length > 0;

        return (
          <ConfirmModal
            isOpen={!!busToDelete}
            title={hasAssigned ? 'Cannot Delete Bus' : 'Delete Fleet Bus'}
            message={
              busToDelete ? (
                <div className="space-y-2">
                  <p>
                    Are you sure you want to remove bus <strong className="text-slate-900">{busToDelete.busNumber}</strong> ({busToDelete.model})?
                  </p>
                  {hasAssigned && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                      <strong>{assignedStudents.length} student(s)</strong> are currently assigned to this bus in {activeMonth}. You must reassign them before deleting this bus.
                    </div>
                  )}
                </div>
              ) : (
                ''
              )
            }
            confirmLabel={hasAssigned ? 'Understood' : 'Delete Bus'}
            confirmDisabled={hasAssigned}
            variant={hasAssigned ? 'warning' : 'danger'}
            onConfirm={() => {
              if (hasAssigned || !busToDelete) {
                setBusToDelete(null);
                return;
              }
              const res = deleteBus(busToDelete.id);
              if (!res.success) {
                showToast(res.error || 'Failed to delete bus', 'error');
              } else {
                showToast(`Bus ${busToDelete.busNumber} removed.`, 'success');
              }
              setBusToDelete(null);
            }}
            onClose={() => setBusToDelete(null)}
          />
        );
      })()}

      {/* Delete Stop Confirmation Modal */}
      {(() => {
        const assignedStudents = stopToDelete
          ? transportAssignments.filter(
              (a) => a.stopId === stopToDelete.id && a.month === activeMonth && students.some((s) => s.id === a.studentId)
            )
          : [];
        const hasAssigned = assignedStudents.length > 0;

        return (
          <ConfirmModal
            isOpen={!!stopToDelete}
            title={hasAssigned ? 'Cannot Delete Bus Stop' : 'Delete Bus Stop'}
            message={
              stopToDelete ? (
                <div className="space-y-2">
                  <p>
                    Are you sure you want to remove bus stop <strong className="text-slate-900">{stopToDelete.name}</strong> ({stopToDelete.area})?
                  </p>
                  {hasAssigned && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                      <strong>{assignedStudents.length} student(s)</strong> are currently assigned to this bus stop in {activeMonth}. You must reassign them before deleting this stop.
                    </div>
                  )}
                </div>
              ) : (
                ''
              )
            }
            confirmLabel={hasAssigned ? 'Understood' : 'Delete Stop'}
            confirmDisabled={hasAssigned}
            variant={hasAssigned ? 'warning' : 'danger'}
            onConfirm={() => {
              if (hasAssigned || !stopToDelete) {
                setStopToDelete(null);
                return;
              }
              const res = deleteStop(stopToDelete.id);
              if (!res.success) {
                showToast(res.error || 'Failed to delete bus stop', 'error');
              } else {
                showToast(`Bus stop "${stopToDelete.name}" removed.`, 'success');
              }
              setStopToDelete(null);
            }}
            onClose={() => setStopToDelete(null)}
          />
        );
      })()}

      {/* Delete Assignment Confirmation Modal */}
      {(() => {
        const assignedStudent = asgnToDelete ? students.find((s) => s.id === asgnToDelete.studentId) : null;
        return (
          <ConfirmModal
            isOpen={!!asgnToDelete}
            title="Remove Transport Assignment"
            message={
              asgnToDelete ? (
                <p>
                  Are you sure you want to remove transport service for <strong className="text-slate-900">{assignedStudent?.name || 'this student'}</strong> for month <strong>{asgnToDelete.month}</strong>?
                </p>
              ) : (
                ''
              )
            }
            confirmLabel="Remove Assignment"
            variant="danger"
            onConfirm={() => {
              if (!asgnToDelete) return;
              deleteTransportAssignment(asgnToDelete.id);
              showToast(`Transport assignment removed for ${assignedStudent?.name || 'student'}.`, 'info');
              setAsgnToDelete(null);
            }}
            onClose={() => setAsgnToDelete(null)}
          />
        );
      })()}
    </div>
  );
};
