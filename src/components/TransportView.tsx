import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { TransportAssignment, TransportBus, TransportStop } from '../types';
import { calculateTransportFee, formatCurrency, formatMonthName, getDaysInMonth } from '../utils/feeMath';
import { parseCsvLine, downloadCsv } from '../utils/csv';
import { StudentAvatar } from './StudentAvatar';
import { ConfirmModal } from './ConfirmModal';
import { Bus, CalendarDays, Copy, CheckCircle, AlertCircle, AlertTriangle, LayoutGrid, List, MapPin, Pencil, Plus, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Info, Check, ChevronsUpDown, ChevronDown, Upload, FileSpreadsheet, Download, GripVertical } from 'lucide-react';

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
    bulkSaveTransportStops,
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
  const [showBulkStopsModal, setShowBulkStopsModal] = useState(false);

  // Bulk Bus Stops CSV Upload State
  interface BulkStopPreviewRow {
    id: string;
    name: string;
    area: string;
    landmark: string;
    monthlyFare: number;
    sortOrder: number;
    existingStop?: TransportStop;
    isValid: boolean;
    isDuplicateInCsv: boolean;
    selected: boolean;
    errorMsg?: string;
  }

  const [bulkStopsCsvFile, setBulkStopsCsvFile] = useState<File | null>(null);
  const [bulkStopsPreviewRows, setBulkStopsPreviewRows] = useState<BulkStopPreviewRow[]>([]);
  const [stopsPreviewFilter, setStopsPreviewFilter] = useState<'all' | 'valid' | 'invalid' | 'duplicates' | 'updates'>('all');
  const [bulkStopsImportStatus, setBulkStopsImportStatus] = useState<{ message: string | null; error: string | null }>({
    message: null,
    error: null,
  });
  const [isBulkStopsDragging, setIsBulkStopsDragging] = useState(false);
  const bulkStopsFileInputRef = useRef<HTMLInputElement>(null);

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

  // Synchronize globalMonthDays only when activeMonth changes. Running on every
  // assignment/students change would re-read an arbitrary first assignment's
  // daysCharged and silently overwrite a manually-entered global day count.
  useEffect(() => {
    const monthDays = getDaysInMonth(activeMonth);
    const currentAssignments = transportAssignments.filter(
      (a) => a.month === activeMonth && students.some((s) => s.id === a.studentId)
    );
    const firstDays = currentAssignments[0]?.daysCharged;
    const initialDays = firstDays !== undefined && !isNaN(firstDays) ? firstDays : monthDays;
    setGlobalMonthDays(Math.min(Math.max(initialDays, 0), monthDays));
  }, [activeMonth]);

  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [bulkPreviewRows, setBulkPreviewRows] = useState<BulkTransportPreviewRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'invalid' | 'duplicates' | 'updates'>('all');
  const [bulkImportStatus, setBulkImportStatus] = useState<{ message: string | null; error: string | null }>({
    message: null,
    error: null,
  });
  const [isBulkDragging, setIsBulkDragging] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

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

  // Close the top-most open modal/overlay when Escape is pressed. Declared
  // after all the state it references so the active flag evaluates cleanly.
  useEscapeKey(() => {
    if (isStudentComboOpen) {
      setIsStudentComboOpen(false);
    } else if (showBulkStopsModal) {
      setShowBulkStopsModal(false);
      setBulkStopsPreviewRows([]);
      setBulkStopsCsvFile(null);
    } else if (showBulkCsvModal) {
      setShowBulkCsvModal(false);
      setBulkPreviewRows([]);
      setBulkCsvFile(null);
    } else if (showAsgnModal || editingAsgn) {
      setShowAsgnModal(false);
      setEditingAsgn(null);
    } else if (showStopModal || editingStop) {
      setShowStopModal(false);
      setEditingStop(null);
    } else if (showBusModal || editingBus) {
      setShowBusModal(false);
      setEditingBus(null);
    }
  }, !!(
    isStudentComboOpen ||
    showBulkStopsModal ||
    showBulkCsvModal ||
    showAsgnModal ||
    editingAsgn ||
    showStopModal ||
    editingStop ||
    showBusModal ||
    editingBus
  ));

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
    setShowBulkCsvModal(true);
  };

  const handleDownloadSampleTransportCsv = () => {
    const sampleStudents = students.filter((s) => s.status === 'Active').slice(0, 3);
    const sampleBus = buses[0]?.busNumber || 'BUS-01';
    const sampleStop1 = stops[0]?.name || 'Saddar';
    const sampleStop2 = stops[1]?.name || stops[0]?.name || 'G-10 Markaz';
    const targetMonth = activeMonth;
    const sampleMonthDays = getDaysInMonth(targetMonth);

    const headers = ['RegNo', 'BusNumber', 'StopName', 'TripType', 'DaysAvailed', 'Discount'];
    const rows = [
      [sampleStudents[0]?.regNo || 'REG-1001', sampleBus, sampleStop1, 'RoundTrip', String(sampleMonthDays), '0'],
      [sampleStudents[1]?.regNo || 'REG-1002', sampleBus, sampleStop2, 'OneWay', String(sampleMonthDays), '200'],
      [sampleStudents[2]?.regNo || 'REG-1003', sampleBus, sampleStop1, 'RoundTrip', String(Math.min(22, sampleMonthDays)), '0'],
    ];

    downloadCsv(
      `sample_transport_assignments_${targetMonth}.csv`,
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    );
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

        const targetMonth = activeMonth;
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

          // 2. Match Bus: exact Bus # first, then exact Route name. No substring guessing.
          let bus: TransportBus | undefined;
          let busError: string | undefined;
          if (rawBus.trim()) {
            const cleanBus = rawBus.trim().toLowerCase();
            const cleanBusAlpha = cleanBus.replace(/[^a-z0-9]/g, '');
            const byNumber = buses.filter(
              (b) =>
                b.busNumber.toLowerCase() === cleanBus ||
                b.busNumber.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanBusAlpha
            );
            const byRoute = buses.filter(
              (b) =>
                b.routeName.toLowerCase() === cleanBus ||
                b.routeName.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanBusAlpha
            );
            const candidates = byNumber.length > 0 ? byNumber : byRoute;
            if (candidates.length === 1) {
              bus = candidates[0];
            } else if (candidates.length > 1) {
              busError = `Bus '${rawBus.trim()}' matches ${candidates.length} buses. Use the exact Bus #.`;
            } else {
              busError = `Bus '${rawBus.trim()}' not found (must exactly match a Bus # or Route name)`;
            }
          } else if (buses.length === 1) {
            bus = buses[0];
          } else {
            busError = `Bus is required (${buses.length} buses in fleet)`;
          }

          // 3. Match Stop: exact Stop name first, then exact Area. No substring guessing.
          let stop: TransportStop | undefined;
          let stopError: string | undefined;
          if (rawStop.trim()) {
            const cleanStop = rawStop.trim().toLowerCase();
            const cleanStopAlpha = cleanStop.replace(/[^a-z0-9]/g, '');
            const byName = stops.filter(
              (sp) =>
                sp.name.toLowerCase() === cleanStop ||
                sp.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanStopAlpha
            );
            const byArea = stops.filter(
              (sp) =>
                sp.area.toLowerCase() === cleanStop ||
                sp.area.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanStopAlpha
            );
            const candidates = byName.length > 0 ? byName : byArea;
            if (candidates.length === 1) {
              stop = candidates[0];
            } else if (candidates.length > 1) {
              stopError = `Stop '${rawStop.trim()}' matches ${candidates.length} stops. Use the exact stop name.`;
            } else {
              stopError = `Stop '${rawStop.trim()}' not found (must exactly match a Stop name or Area)`;
            }
          } else if (stops.length === 1) {
            stop = stops[0];
          } else {
            stopError = `Stop is required (${stops.length} stops defined)`;
          }

          // 4. Trip Type
          let tripType: 'RoundTrip' | 'OneWay' = 'RoundTrip';
          if (/one|1|single/i.test(rawTripType)) {
            tripType = 'OneWay';
          }

          // 5. Days Availed (assume default active days full month unless specified in CSV)
          let daysCharged = targetMonthDays;
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
            errorMsg = busError || (rawBus ? `Bus '${rawBus}' not found` : 'No fleet bus available');
          } else if (!stop) {
            isValid = false;
            errorMsg = stopError || (rawStop ? `Stop '${rawStop}' not found` : 'No bus stop available');
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

    const targetMonth = activeMonth;
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

  // Bulk Bus Stops CSV Handlers
  const handleOpenBulkStopsCsvModal = () => {
    setBulkStopsCsvFile(null);
    setBulkStopsPreviewRows([]);
    setBulkStopsImportStatus({ message: null, error: null });
    setStopsPreviewFilter('all');
    setShowBulkStopsModal(true);
  };

  const handleDownloadSampleStopsCsv = () => {
    const headers = ['StopName', 'Area', 'Landmark', 'MonthlyFare', 'SortPosition'];
    const rows = [
      ['Saddar', 'Rawalpindi Cantt', 'Near Metro Station', '3500', '1'],
      ['G-10 Markaz', 'Islamabad', 'Near Post Office', '4000', '2'],
      ['F-8 Markaz', 'Islamabad', 'Near Ayub Market', '4500', '3'],
      ['Commercial Market', 'Satellite Town', 'Near Shell Pump', '3200', '4'],
      ['Bahria Town Phase 4', 'Rawalpindi', 'Civic Center', '5000', '5'],
    ];

    downloadCsv(
      'sample_bus_stops.csv',
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    );
  };

  const processStopsCsvFile = (file: File) => {
    setBulkStopsCsvFile(file);
    setBulkStopsImportStatus({ message: null, error: null });
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || !text.trim()) {
          setBulkStopsImportStatus({ message: null, error: 'The uploaded file is empty.' });
          return;
        }

        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length <= 1) {
          setBulkStopsImportStatus({
            message: null,
            error: 'CSV must contain a header row and at least one bus stop record.',
          });
          return;
        }

        const headerLine = lines[0].toLowerCase();
        const headerTokens = headerLine.split(',').map((h) => h.replace(/["'\s_]/g, ''));

        const colMap = {
          name: headerTokens.findIndex((h) => h.includes('stop') || h.includes('name') || h.includes('location') || h.includes('station') || h.includes('point')),
          area: headerTokens.findIndex((h) => h.includes('area') || h.includes('sector') || h.includes('zone') || h.includes('city') || h.includes('town')),
          landmark: headerTokens.findIndex((h) => h.includes('landmark') || h.includes('place') || h.includes('note') || h.includes('desc')),
          fare: headerTokens.findIndex((h) => h.includes('fare') || h.includes('rate') || h.includes('amount') || h.includes('monthly') || h.includes('fee') || h.includes('price')),
          sortOrder: headerTokens.findIndex((h) => h.includes('sort') || h.includes('order') || h.includes('position') || h.includes('pos') || h.includes('seq')),
        };

        if (colMap.name === -1) {
          setBulkStopsImportStatus({
            message: null,
            error: 'Missing required column: "StopName" or "Name" must be present in the CSV header.',
          });
          return;
        }

        const parsedRows: BulkStopPreviewRow[] = [];
        const seenStopNames = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          if (cols.length === 0 || cols.every((c) => !c)) continue;

          const rawName = cols[colMap.name] || '';
          const rawArea = colMap.area !== -1 ? cols[colMap.area] || '' : '';
          const rawLandmark = colMap.landmark !== -1 ? cols[colMap.landmark] || '' : '';
          const rawFare = colMap.fare !== -1 ? cols[colMap.fare] || '' : '';
          const rawSort = colMap.sortOrder !== -1 ? cols[colMap.sortOrder] || '' : '';

          if (!rawName.trim()) continue;

          const cleanName = rawName.trim();
          const cleanNameLower = cleanName.toLowerCase();

          // 1. Duplicate within CSV
          const isDuplicateInCsv = seenStopNames.has(cleanNameLower);
          if (!isDuplicateInCsv) {
            seenStopNames.add(cleanNameLower);
          }

          // 2. Existing Stop match (by name)
          const existingStop = stops.find(
            (s) => s.name.trim().toLowerCase() === cleanNameLower
          );

          // 3. Monthly Fare
          let monthlyFare = 0;
          if (rawFare.trim()) {
            const numFare = parseFloat(rawFare.replace(/[^0-9.]/g, ''));
            if (!isNaN(numFare) && numFare >= 0) {
              monthlyFare = numFare;
            }
          } else if (existingStop) {
            monthlyFare = existingStop.monthlyFare;
          }

          // 4. Sort Order
          let sortOrder = existingStop ? existingStop.sortOrder : stops.length + parsedRows.length + 1;
          if (rawSort.trim()) {
            const numSort = parseInt(rawSort.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(numSort) && numSort > 0) {
              sortOrder = numSort;
            }
          }

          // 5. Validation & Error message
          let isValid = true;
          let errorMsg = '';

          if (!cleanName) {
            isValid = false;
            errorMsg = 'Stop Name is required';
          } else if (monthlyFare < 0) {
            isValid = false;
            errorMsg = 'Monthly Fare cannot be negative';
          } else if (isDuplicateInCsv) {
            isValid = false;
            errorMsg = 'Duplicate Stop Name in CSV';
          }

          parsedRows.push({
            id: `csv-stop-${i}-${Date.now()}`,
            name: cleanName,
            area: rawArea.trim(),
            landmark: rawLandmark.trim(),
            monthlyFare,
            sortOrder,
            existingStop,
            isValid,
            isDuplicateInCsv,
            selected: isValid && !isDuplicateInCsv,
            errorMsg: errorMsg || undefined,
          });
        }

        if (parsedRows.length === 0) {
          setBulkStopsImportStatus({ message: null, error: 'No data rows found in CSV.' });
          return;
        }

        setBulkStopsPreviewRows(parsedRows);
        const validCount = parsedRows.filter((r) => r.isValid && !r.isDuplicateInCsv).length;
        setBulkStopsImportStatus({
          message: `Parsed ${parsedRows.length} rows. ${validCount} valid bus stop record${validCount === 1 ? '' : 's'} ready for verification.`,
          error: null,
        });
      } catch (err: any) {
        setBulkStopsImportStatus({
          message: null,
          error: `Failed to parse CSV file: ${err.message || 'Unknown error'}`,
        });
      }
    };

    reader.readAsText(file);
  };

  const handleBulkStopsCsvFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processStopsCsvFile(file);
    }
  };

  const handleBulkStopsCsvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsBulkStopsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.csv')) {
      processStopsCsvFile(file);
    } else {
      setBulkStopsImportStatus({ message: null, error: 'Please drop a valid .csv file.' });
    }
  };

  const handleToggleSelectStopRow = (rowId: string) => {
    setBulkStopsPreviewRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleToggleSelectAllValidStops = () => {
    const validRows = bulkStopsPreviewRows.filter((r) => r.isValid && !r.isDuplicateInCsv);
    const allSelected = validRows.every((r) => r.selected);
    setBulkStopsPreviewRows((prev) =>
      prev.map((r) => (r.isValid && !r.isDuplicateInCsv ? { ...r, selected: !allSelected } : r))
    );
  };

  const handleClearBulkStopsCsv = () => {
    setBulkStopsCsvFile(null);
    setBulkStopsPreviewRows([]);
    setBulkStopsImportStatus({ message: null, error: null });
    if (bulkStopsFileInputRef.current) {
      bulkStopsFileInputRef.current.value = '';
    }
  };

  const handleCommitBulkStopsImport = () => {
    const validSelected = bulkStopsPreviewRows.filter(
      (r) => r.selected && r.isValid && !r.isDuplicateInCsv && r.name
    );
    if (validSelected.length === 0) {
      setBulkStopsImportStatus({ message: null, error: 'No valid rows selected for import.' });
      return;
    }

    const stopsToSave = validSelected.map((r) => ({
      ...(r.existingStop ? { id: r.existingStop.id } : {}),
      name: r.name,
      area: r.area,
      landmark: r.landmark,
      monthlyFare: r.monthlyFare,
      sortOrder: r.sortOrder,
    }));

    const result = bulkSaveTransportStops(stopsToSave);

    showToast(
      `Successfully imported ${result.addedCount} new stop${result.addedCount === 1 ? '' : 's'}${
        result.updatedCount > 0 ? ` and updated ${result.updatedCount} existing stop${result.updatedCount === 1 ? '' : 's'}` : ''
      }.`,
      'success'
    );

    setShowBulkStopsModal(false);
    setBulkStopsPreviewRows([]);
    setBulkStopsCsvFile(null);
    setBulkStopsImportStatus({ message: null, error: null });
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenBulkStopsCsvModal}
                    className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-teal-700 border border-teal-200 hover:border-teal-300 font-bold px-3 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                    title="Upload bus stops and monthly fare rates via CSV"
                  >
                    <Upload className="w-3.5 h-3.5 text-teal-600" />
                    <span>Import Stops CSV</span>
                  </button>

                  <button
                    onClick={handleOpenAddStop}
                    className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Bus Stop</span>
                  </button>
                </div>
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
                Prorated fare formula: (Base Stop Fare − Discount) × (Days Availed ÷ {totalDaysInMonth} Days) × Trip Factor
              </p>
            </div>

            {hasPermission('transport.manage') && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Compact Integrated Active Days Control with Presets and Apply Button */}
                <div
                  id="transport-global-active-days-control"
                  className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 text-xs shadow-2xs gap-1.5"
                >
                  <div className="flex items-center gap-1 pl-1.5 text-slate-700 font-bold text-xs">
                    <CalendarDays className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="text-[11px] whitespace-nowrap">Days:</span>
                  </div>

                  <input
                    type="number"
                    min="0"
                    max={totalDaysInMonth}
                    value={globalMonthDays}
                    onChange={(e) => handleGlobalDaysChange(Number(e.target.value))}
                    className="w-10 text-center font-bold text-slate-900 text-xs py-1 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-2xs"
                    title={`Active days in ${activeMonth} (0 to ${totalDaysInMonth})`}
                  />

                  <span className="text-[11px] font-semibold text-slate-400">/{totalDaysInMonth}d</span>

                  <select
                    value={globalMonthDays}
                    onChange={(e) => handleGlobalDaysChange(Number(e.target.value))}
                    className="bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[11px] py-1 px-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer shadow-2xs"
                    title="Quick select preset days"
                  >
                    <option value={totalDaysInMonth}>Full ({totalDaysInMonth}d)</option>
                    <option value={22}>22d (Working)</option>
                    <option value={Math.round(totalDaysInMonth / 2)}>Half ({Math.round(totalDaysInMonth / 2)}d)</option>
                    <option value={26}>26d</option>
                    <option value={24}>24d</option>
                    <option value={20}>20d</option>
                    <option value={15}>15d</option>
                    <option value={10}>10d</option>
                    <option value={0}>0d</option>
                    {![
                      totalDaysInMonth,
                      22,
                      Math.round(totalDaysInMonth / 2),
                      26,
                      24,
                      20,
                      15,
                      10,
                      0,
                    ].includes(globalMonthDays) && (
                      <option value={globalMonthDays}>{globalMonthDays}d (Custom)</option>
                    )}
                  </select>

                  {/* Apply to All Button */}
                  {activeMonthAssignments.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplyGlobalDaysToAll}
                      className="inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                      title={`Apply ${globalMonthDays} active days to all ${activeMonthAssignments.length} transport assignments in ${activeMonth}`}
                    >
                      <Check className="w-3 h-3 shrink-0" />
                      <span>Apply All ({activeMonthAssignments.length})</span>
                    </button>
                  )}
                </div>

                {/* Copy Previous Month Button */}
                <button
                  type="button"
                  onClick={handleCopyPreviousMonth}
                  className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap"
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
                  const calculatedFare = baseDiscounted * (daysAvailed / totalDaysInMonth) * tripFactor;

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
                          ({baseFare} − {discount}) × ({daysAvailed}/{totalDaysInMonth}) × {tripFactor} = Rs. {Math.round(calculatedFare).toLocaleString()}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`bg-white rounded-2xl ${
              bulkPreviewRows.length > 0 ? 'max-w-5xl' : 'max-w-md'
            } w-full p-6 shadow-2xl space-y-5 transition-all max-h-[90vh] flex flex-col`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                {bulkPreviewRows.length > 0
                  ? 'Preview & Verify Transport Assignments'
                  : 'Import Transport Assignments from CSV'}
              </h3>
              <button
                onClick={() => {
                  setShowBulkCsvModal(false);
                  handleClearBulkCsv();
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkPreviewRows.length === 0 ? (
              <div className="space-y-4 text-xs text-slate-600">
                <p>
                  Upload a CSV file with student transport assignments for <strong>{formatMonthName(activeMonth)}</strong>. First row must contain column headers.
                </p>

                <button
                  type="button"
                  onClick={handleDownloadSampleTransportCsv}
                  className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Sample Transport CSV Format</span>
                </button>

                {/* Status alerts */}
                {bulkImportStatus.message && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{bulkImportStatus.message}</span>
                  </div>
                )}
                {bulkImportStatus.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{bulkImportStatus.error}</span>
                  </div>
                )}

                {/* File Dropzone & Click Target */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsBulkDragging(true);
                  }}
                  onDragLeave={() => setIsBulkDragging(false)}
                  onDrop={handleBulkCsvDrop}
                  onClick={() => bulkFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer group ${
                    isBulkDragging
                      ? 'border-teal-500 bg-teal-50/60'
                      : 'border-teal-300 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/60'
                  }`}
                >
                  <Upload className="w-8 h-8 text-teal-600 group-hover:scale-110 transition mx-auto mb-2" />
                  <span className="font-bold text-slate-800 block text-sm">
                    Click to select CSV File or drag & drop
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Supports standard comma-separated .csv files
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      bulkFileInputRef.current?.click();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse CSV File
                  </button>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleBulkCsvFileInputChange}
                  />
                </div>
              </div>
            ) : (
              /* Preview View with Interactive Table & Filters */
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Metric Summary Bar */}
                {(() => {
                  const total = bulkPreviewRows.length;
                  const validRows = bulkPreviewRows.filter((r) => r.isValid && !r.isDuplicateInCsv);
                  const selectedCount = validRows.filter((r) => r.selected).length;
                  const updateCount = validRows.filter((r) => !!r.existingAsgn).length;
                  const duplicateCount = bulkPreviewRows.filter((r) => r.isDuplicateInCsv).length;
                  const invalidCount = bulkPreviewRows.filter((r) => !r.isValid && !r.isDuplicateInCsv).length;
                  const totalIssues = duplicateCount + invalidCount;
                  const totalEstRevenue = validRows.filter((r) => r.selected).reduce((sum, r) => sum + r.effectiveFare, 0);

                  const filteredRows = bulkPreviewRows.filter((r) => {
                    if (previewFilter === 'valid') return r.isValid && !r.isDuplicateInCsv;
                    if (previewFilter === 'invalid') return !r.isValid || r.isDuplicateInCsv;
                    if (previewFilter === 'duplicates') return r.isDuplicateInCsv;
                    if (previewFilter === 'updates') return r.isValid && !r.isDuplicateInCsv && !!r.existingAsgn;
                    return true;
                  });

                  return (
                    <>
                      {/* Compact Status & Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 text-xs shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            <span className="text-slate-500 font-semibold text-[11px]">Total Rows:</span>
                            <span className="font-bold text-slate-900">{total}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 shadow-2xs">
                            <span className="text-emerald-700 font-semibold text-[11px]">Selected:</span>
                            <span className="font-bold text-emerald-800">{selectedCount}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs">
                            <span className="text-teal-700 font-semibold text-[11px]">Est. Revenue:</span>
                            <span className="font-bold text-teal-800">{formatCurrency(totalEstRevenue)}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 shadow-2xs">
                            <span className="text-amber-700 font-semibold text-[11px]">Updates:</span>
                            <span className="font-bold text-amber-800">{updateCount}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                            <span className="text-rose-700 font-semibold text-[11px]">Duplicates:</span>
                            <span className="font-bold text-rose-800">{duplicateCount}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                            <span className="text-rose-700 font-semibold text-[11px]">Invalid:</span>
                            <span className="font-bold text-rose-800">{invalidCount}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleToggleSelectAllValid}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 text-teal-600" />
                            <span>Toggle Select All</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearBulkCsv}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg font-semibold text-xs transition cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload New File</span>
                          </button>
                        </div>
                      </div>

                      {/* Filter Selector Tabs */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewFilter('all')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              previewFilter === 'all'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            All ({total})
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreviewFilter('valid')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              previewFilter === 'valid'
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Valid Only ({validRows.length})
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreviewFilter('updates')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              previewFilter === 'updates'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Updates ({updateCount})
                          </button>

                          <button
                            type="button"
                            onClick={() => setPreviewFilter('invalid')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              previewFilter === 'invalid'
                                ? 'bg-rose-700 text-white shadow-xs'
                                : totalIssues > 0
                                ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            Issues ({totalIssues})
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

                      {/* Error Alert */}
                      {bulkImportStatus.error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{bulkImportStatus.error}</span>
                        </div>
                      )}

                      {/* Interactive Preview Table Container */}
                      <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[50vh] flex-1">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                              <th className="p-3 w-10 text-center">Import</th>
                              <th className="p-3">Student (Reg #)</th>
                              <th className="p-3">Class</th>
                              <th className="p-3">Bus & Stop</th>
                              <th className="p-3 text-center">Trip</th>
                              <th className="p-3 text-center">Days</th>
                              <th className="p-3 text-right">Discount</th>
                              <th className="p-3 text-right">Net Fare</th>
                              <th className="p-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredRows.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-8 text-center bg-white text-slate-500">
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
                                      View All ({total}) Records
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              filteredRows.map((row) => {
                                const isRowValid = row.isValid && !row.isDuplicateInCsv;
                                return (
                                  <tr
                                    key={row.id}
                                    className={`hover:bg-slate-50/80 transition ${
                                      row.isDuplicateInCsv
                                        ? 'bg-rose-50/60 text-slate-700'
                                        : !row.isValid
                                        ? 'bg-rose-50/40'
                                        : row.existingAsgn
                                        ? 'bg-amber-50/40'
                                        : row.selected
                                        ? 'bg-teal-50/20'
                                        : ''
                                    }`}
                                  >
                                    <td className="p-3 text-center">
                                      <input
                                        type="checkbox"
                                        disabled={!isRowValid}
                                        checked={row.selected && isRowValid}
                                        onChange={() => handleToggleSelectRow(row.id)}
                                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                      />
                                    </td>

                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                                          {row.regNo}
                                        </span>
                                        <span className="font-bold text-slate-900">
                                          {row.student?.name || <span className="text-rose-500 italic">Unmatched</span>}
                                        </span>
                                      </div>
                                    </td>

                                    <td className="p-3 text-slate-600">
                                      {row.studentClass?.name || <span className="text-slate-400">—</span>}
                                    </td>

                                    <td className="p-3">
                                      <div className="flex items-center gap-1.5">
                                        {row.bus ? (
                                          <span className="font-bold font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                            {row.bus.busNumber}
                                          </span>
                                        ) : (
                                          <span className="text-rose-600 italic text-[11px]">{row.busInput || 'No Bus'}</span>
                                        )}
                                        <span className="font-bold text-slate-800">
                                          {row.stop?.name || <span className="text-rose-600 italic text-[11px]">{row.stopInput || 'No Stop'}</span>}
                                        </span>
                                      </div>
                                      {row.stop && (
                                        <span className="text-[10px] text-slate-500 block mt-0.5">
                                          Base: {formatCurrency(row.stop.monthlyFare)}
                                        </span>
                                      )}
                                    </td>

                                    <td className="p-3 text-center">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                          row.tripType === 'RoundTrip'
                                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}
                                      >
                                        {row.tripType === 'RoundTrip' ? 'Round' : 'One Way'}
                                      </span>
                                    </td>

                                    <td className="p-3 text-center font-bold text-slate-700 font-mono">
                                      {row.daysCharged}d
                                    </td>

                                    <td className="p-3 text-right font-mono text-slate-600">
                                      {row.discount > 0 ? formatCurrency(row.discount) : '—'}
                                    </td>

                                    <td className="p-3 text-right font-mono font-bold text-teal-700">
                                      {isRowValid ? formatCurrency(row.effectiveFare) : '—'}
                                    </td>

                                    <td className="p-3">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                          row.isDuplicateInCsv
                                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                            : !row.isValid
                                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                            : row.existingAsgn
                                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        }`}
                                      >
                                        {!row.isValid && <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />}
                                        {row.existingAsgn && !row.isDuplicateInCsv && row.isValid && (
                                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                        )}
                                        {row.errorMsg
                                          ? row.errorMsg
                                          : row.existingAsgn
                                          ? 'Updates Existing'
                                          : 'New Assignment'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}

                {/* Modal Footer Controls */}
                {bulkPreviewRows.length > 0 && (
                  <div className="flex justify-end items-center border-t border-slate-200 pt-3 shrink-0">
                    <button
                      type="button"
                      onClick={handleCommitBulkImport}
                      disabled={
                        bulkPreviewRows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length === 0
                      }
                      className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        Confirm & Save {
                          bulkPreviewRows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length
                        } Selected Assignment(s)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Bus Stops CSV Import Modal */}
      {showBulkStopsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`bg-white rounded-2xl ${
              bulkStopsPreviewRows.length > 0 ? 'max-w-5xl' : 'max-w-md'
            } w-full p-6 shadow-2xl space-y-5 transition-all max-h-[90vh] flex flex-col`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                {bulkStopsPreviewRows.length > 0
                  ? 'Preview & Verify Bus Stops'
                  : 'Import Bus Stops from CSV'}
              </h3>
              <button
                onClick={() => {
                  setShowBulkStopsModal(false);
                  handleClearBulkStopsCsv();
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkStopsPreviewRows.length === 0 ? (
              <div className="space-y-4 text-xs text-slate-600">
                <p>
                  Upload a CSV file containing route bus stops, area/sectors, landmarks, and standard monthly fare tiers. First row must contain column headers.
                </p>

                <button
                  type="button"
                  onClick={handleDownloadSampleStopsCsv}
                  className="flex items-center gap-2 text-teal-600 font-bold hover:underline cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Sample Bus Stops CSV Format</span>
                </button>

                {/* Status alerts */}
                {bulkStopsImportStatus.message && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{bulkStopsImportStatus.message}</span>
                  </div>
                )}
                {bulkStopsImportStatus.error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{bulkStopsImportStatus.error}</span>
                  </div>
                )}

                {/* File Dropzone & Click Target */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsBulkStopsDragging(true);
                  }}
                  onDragLeave={() => setIsBulkStopsDragging(false)}
                  onDrop={handleBulkStopsCsvDrop}
                  onClick={() => bulkStopsFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer group ${
                    isBulkStopsDragging
                      ? 'border-teal-500 bg-teal-50/60'
                      : 'border-teal-300 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/60'
                  }`}
                >
                  <Upload className="w-8 h-8 text-teal-600 group-hover:scale-110 transition mx-auto mb-2" />
                  <span className="font-bold text-slate-800 block text-sm">
                    Click to select CSV File or drag & drop
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Supports standard comma-separated .csv files
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      bulkStopsFileInputRef.current?.click();
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Browse CSV File
                  </button>
                  <input
                    ref={bulkStopsFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleBulkStopsCsvFileInputChange}
                  />
                </div>
              </div>
            ) : (
              /* Preview View with Interactive Table & Filters */
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Metric Summary Bar */}
                {(() => {
                  const total = bulkStopsPreviewRows.length;
                  const validRows = bulkStopsPreviewRows.filter((r) => r.isValid && !r.isDuplicateInCsv);
                  const selectedCount = validRows.filter((r) => r.selected).length;
                  const updateCount = validRows.filter((r) => !!r.existingStop).length;
                  const duplicateCount = bulkStopsPreviewRows.filter((r) => r.isDuplicateInCsv).length;
                  const invalidCount = bulkStopsPreviewRows.filter((r) => !r.isValid && !r.isDuplicateInCsv).length;
                  const totalIssues = duplicateCount + invalidCount;
                  const avgMonthlyFare = validRows.length > 0
                    ? Math.round(validRows.reduce((sum, r) => sum + r.monthlyFare, 0) / validRows.length)
                    : 0;

                  const filteredRows = bulkStopsPreviewRows.filter((r) => {
                    if (stopsPreviewFilter === 'valid') return r.isValid && !r.isDuplicateInCsv;
                    if (stopsPreviewFilter === 'invalid') return !r.isValid || r.isDuplicateInCsv;
                    if (stopsPreviewFilter === 'duplicates') return r.isDuplicateInCsv;
                    if (stopsPreviewFilter === 'updates') return r.isValid && !r.isDuplicateInCsv && !!r.existingStop;
                    return true;
                  });

                  return (
                    <>
                      {/* Compact Status & Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 text-xs shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <div className="inline-flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            <span className="text-slate-500 font-semibold text-[11px]">Total Rows:</span>
                            <span className="font-bold text-slate-900">{total}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 shadow-2xs">
                            <span className="text-emerald-700 font-semibold text-[11px]">Selected:</span>
                            <span className="font-bold text-emerald-800">{selectedCount}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/80 shadow-2xs">
                            <span className="text-teal-700 font-semibold text-[11px]">Avg. Fare:</span>
                            <span className="font-bold text-teal-800">{formatCurrency(avgMonthlyFare)}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 shadow-2xs">
                            <span className="text-amber-700 font-semibold text-[11px]">Updates:</span>
                            <span className="font-bold text-amber-800">{updateCount}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                            <span className="text-rose-700 font-semibold text-[11px]">Duplicates:</span>
                            <span className="font-bold text-rose-800">{duplicateCount}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200/80 shadow-2xs">
                            <span className="text-rose-700 font-semibold text-[11px]">Invalid:</span>
                            <span className="font-bold text-rose-800">{invalidCount}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleToggleSelectAllValidStops}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 text-teal-600" />
                            <span>Toggle Select All</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearBulkStopsCsv}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg font-semibold text-xs transition cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload New File</span>
                          </button>
                        </div>
                      </div>

                      {/* Filter Selector Tabs */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs shrink-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setStopsPreviewFilter('all')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              stopsPreviewFilter === 'all'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            All ({total})
                          </button>

                          <button
                            type="button"
                            onClick={() => setStopsPreviewFilter('valid')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              stopsPreviewFilter === 'valid'
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Valid Only ({validRows.length})
                          </button>

                          <button
                            type="button"
                            onClick={() => setStopsPreviewFilter('updates')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              stopsPreviewFilter === 'updates'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Updates ({updateCount})
                          </button>

                          <button
                            type="button"
                            onClick={() => setStopsPreviewFilter('invalid')}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                              stopsPreviewFilter === 'invalid'
                                ? 'bg-rose-700 text-white shadow-xs'
                                : totalIssues > 0
                                ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            Issues ({totalIssues})
                          </button>
                        </div>

                        {stopsPreviewFilter !== 'all' && (
                          <button
                            type="button"
                            onClick={() => setStopsPreviewFilter('all')}
                            className="text-xs text-teal-700 hover:text-teal-900 font-bold underline cursor-pointer"
                          >
                            Reset Filter (Show All)
                          </button>
                        )}
                      </div>

                      {/* Error Alert */}
                      {bulkStopsImportStatus.error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>{bulkStopsImportStatus.error}</span>
                        </div>
                      )}

                      {/* Interactive Preview Table Container */}
                      <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-[50vh] flex-1">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                            <tr>
                              <th className="p-3 w-10 text-center">Import</th>
                              <th className="p-3">Stop Name</th>
                              <th className="p-3">Area / Sector</th>
                              <th className="p-3">Landmark</th>
                              <th className="p-3 text-right">Monthly Fare Rate</th>
                              <th className="p-3 text-center">Sort Position</th>
                              <th className="p-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredRows.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-8 text-center bg-white text-slate-500">
                                  <div className="flex flex-col items-center justify-center gap-2">
                                    <AlertCircle className="w-6 h-6 text-slate-400" />
                                    <p className="font-semibold text-slate-700 text-sm">
                                      No records match the current filter: <span className="font-bold capitalize">{stopsPreviewFilter}</span>
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => setStopsPreviewFilter('all')}
                                      className="mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                                    >
                                      View All ({total}) Records
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              filteredRows.map((row) => {
                                const isRowValid = row.isValid && !row.isDuplicateInCsv;
                                return (
                                  <tr
                                    key={row.id}
                                    className={`hover:bg-slate-50/80 transition ${
                                      row.isDuplicateInCsv || !row.isValid
                                        ? 'bg-rose-50/30'
                                        : row.existingStop
                                        ? 'bg-amber-50/20'
                                        : ''
                                    }`}
                                  >
                                    <td className="p-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={row.selected && isRowValid}
                                        disabled={!isRowValid}
                                        onChange={() => handleToggleSelectStopRow(row.id)}
                                        className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                      />
                                    </td>

                                    <td className="p-3 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        <span className="font-bold text-slate-900">{row.name}</span>
                                      </div>
                                    </td>

                                    <td className="p-3 text-slate-700 whitespace-nowrap">
                                      {row.area || '—'}
                                    </td>

                                    <td className="p-3 text-slate-500 whitespace-nowrap">
                                      {row.landmark || '—'}
                                    </td>

                                    <td className="p-3 text-right font-mono font-bold text-teal-700 whitespace-nowrap">
                                      {formatCurrency(row.monthlyFare)} / mo
                                    </td>

                                    <td className="p-3 text-center whitespace-nowrap">
                                      <span className="font-mono font-bold text-[11px] text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.5 rounded">
                                        #{row.sortOrder}
                                      </span>
                                    </td>

                                    <td className="p-3 whitespace-nowrap">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                          row.isDuplicateInCsv
                                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                            : !row.isValid
                                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                            : row.existingStop
                                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        }`}
                                      >
                                        {!row.isValid && <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />}
                                        {row.existingStop && !row.isDuplicateInCsv && row.isValid && (
                                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                        )}
                                        {row.errorMsg
                                          ? row.errorMsg
                                          : row.existingStop
                                          ? 'Updates Existing Stop'
                                          : 'New Bus Stop'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}

                {/* Modal Footer Controls */}
                {bulkStopsPreviewRows.length > 0 && (
                  <div className="flex justify-end items-center border-t border-slate-200 pt-3 shrink-0">
                    <button
                      type="button"
                      onClick={handleCommitBulkStopsImport}
                      disabled={
                        bulkStopsPreviewRows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length === 0
                      }
                      className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        Confirm & Save {
                          bulkStopsPreviewRows.filter((r) => r.selected && r.isValid && !r.isDuplicateInCsv).length
                        } Selected Bus Stop(s)
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Bus Confirmation Modal */}
      {(() => {
        const assignedStudents = busToDelete
          ? transportAssignments.filter(
              (a) => a.busId === busToDelete.id && a.month === activeMonth && students.some((s) => s.id === a.studentId && s.status === 'Active')
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
              (a) => a.stopId === stopToDelete.id && a.month === activeMonth && students.some((s) => s.id === a.studentId && s.status === 'Active')
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
