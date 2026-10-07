import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { TransportAssignment, TransportBus, TransportStop } from '../types';
import { calculateTransportFee, formatCurrency, getDaysInMonth } from '../utils/feeMath';
import { parseCsvLine, detectCsvDelimiter, downloadCsv } from '../utils/csv';
import { mapCsvHeader, TRANSPORT_CSV, STOP_CSV } from '../utils/csvHeaders';
import { StudentAvatar } from './StudentAvatar';
import { ConfirmModal } from './ConfirmModal';
import { BusModal } from './transport/BusModal';
import { StopModal } from './transport/StopModal';
import { AssignmentModal } from './transport/AssignmentModal';
import { BulkTransportCsvModal, BulkTransportPreviewRow } from './transport/BulkTransportCsvModal';
import { BulkStopsCsvModal, BulkStopPreviewRow } from './transport/BulkStopsCsvModal';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';
import { Bus, CalendarDays, Copy, CheckCircle, AlertCircle, LayoutGrid, List, MapPin, Pencil, Plus, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Check, Upload, GripVertical } from 'lucide-react';

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
    transportRoundingMultiple,
    hasPermission,
    showToast,
    themeConfig,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const [subTab, setSubTab] = useState<'buses' | 'stops' | 'assignments'>('assignments');
  const [busesViewMode, setBusesViewMode] = useState<'grid' | 'list'>('grid');
  const [stopsViewMode, setStopsViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [showBusModal, setShowBusModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [showAsgnModal, setShowAsgnModal] = useState(false);
  const [showBulkCsvModal, setShowBulkCsvModal] = useState(false);
  const [showBulkStopsModal, setShowBulkStopsModal] = useState(false);

  const [bulkStopsCsvFile, setBulkStopsCsvFile] = useState<File | null>(null);
  const [bulkStopsPreviewRows, setBulkStopsPreviewRows] = useState<BulkStopPreviewRow[]>([]);
  const [stopsPreviewFilter, setStopsPreviewFilter] = useState<'all' | 'valid' | 'invalid' | 'duplicates' | 'updates'>('all');
  const [bulkStopsImportStatus, setBulkStopsImportStatus] = useState<{ message: string | null; error: string | null }>({
    message: null,
    error: null,
  });
  const [isBulkStopsDragging, setIsBulkStopsDragging] = useState(false);
  const bulkStopsFileInputRef = useRef<HTMLInputElement>(null);

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
    const sampleStop1 = stops[0]?.name || 'Central Station';
    const sampleStop2 = stops[1]?.name || stops[0]?.name || 'North Plaza';
    const targetMonth = activeMonth;
    const sampleMonthDays = getDaysInMonth(targetMonth);

    const tc = TRANSPORT_CSV.columns;
    const headers = [tc.regNo, tc.bus, tc.stop, tc.tripType, tc.days, tc.discount];
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

        const delimiter = detectCsvDelimiter(lines[0]);
        const { map: colMap, error: headerError } = mapCsvHeader(parseCsvLine(lines[0], [delimiter]), TRANSPORT_CSV);
        if (headerError) {
          setBulkImportStatus({ message: null, error: headerError });
          return;
        }

        const targetMonth = activeMonth;
        const targetMonthDays = getDaysInMonth(targetMonth);
        const parsedRows: BulkTransportPreviewRow[] = [];
        const seenRegNos = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i], [delimiter]);
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
          } else if (student.status !== 'Active') {
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
          const effectiveFare = stop ? calculateTransportFee(mockAsgn, stop, transportRoundingMultiple) : 0;

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
    const sc = STOP_CSV.columns;
    const headers = [sc.name, sc.area, sc.landmark, sc.fare, sc.sortOrder];
    const rows = [
      ['Central Station', 'Downtown', 'Near Metro Station', '3500', '1'],
      ['North Plaza', 'Northside', 'Near Post Office', '4000', '2'],
      ['East Market', 'Eastside', 'Near Town Market', '4500', '3'],
      ['Commercial Market', 'Riverside', 'Near Gas Station', '3200', '4'],
      ['Hillcrest Estate', 'Westside', 'Civic Center', '5000', '5'],
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

        const delimiter = detectCsvDelimiter(lines[0]);
        const { map: colMap, error: headerError } = mapCsvHeader(parseCsvLine(lines[0], [delimiter]), STOP_CSV);
        if (headerError) {
          setBulkStopsImportStatus({ message: null, error: headerError });
          return;
        }

        const parsedRows: BulkStopPreviewRow[] = [];
        const seenStopNames = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i], [delimiter]);
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
        valA = calculateTransportFee(a, stopA, transportRoundingMultiple);
        valB = calculateTransportFee(b, stopB, transportRoundingMultiple);
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
        monthlyFare: Math.max(0, Number(stopData.monthlyFare) || 0),
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
        monthlyFare: Math.max(0, Number(stopData.monthlyFare) || 0),
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
                      style={
                        isDragged
                          ? {
                              borderColor: preset.primaryColor,
                              backgroundColor: `${preset.lightBg}60`,
                            }
                          : isDragOver
                          ? {
                              borderColor: preset.primaryColor,
                              boxShadow: `0 10px 25px -5px ${preset.primaryColor}25`,
                              backgroundColor: `${preset.lightBg}40`,
                            }
                          : bus.active
                          ? {
                              background: `linear-gradient(160deg, ${preset.lightBg}60 0%, #ffffff 35%, #ffffff 100%)`,
                              borderColor: '#e2e8f0',
                            }
                          : undefined
                      }
                      className={`group relative rounded-2xl border transition-all duration-200 select-none overflow-hidden ${
                        isDragged
                          ? 'opacity-40 scale-[0.98] border-dashed ring-2 shadow-md'
                          : isDragOver
                          ? 'ring-2 transform -translate-y-1 shadow-lg'
                          : bus.active
                          ? 'shadow-xs hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300'
                          : 'bg-slate-50/90 border-slate-200 opacity-75'
                      }`}
                    >
                      {/* Theme-Matched Prominence Accent Bar */}
                      <div
                        className="h-1.5 w-full transition-all duration-300"
                        style={{
                          background: bus.active
                            ? `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`
                            : '#cbd5e1',
                        }}
                      />

                      <div className="p-5 pt-3.5 space-y-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {hasPermission('transport.manage') && (
                              <div
                                title="Drag card to reorder position"
                                className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition mt-1 shrink-0"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                            )}

                            {/* Theme Vehicle Icon Badge */}
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105 shadow-2xs"
                              style={
                                bus.active
                                  ? {
                                      backgroundColor: preset.lightBg,
                                      borderColor: preset.lightBorder,
                                      color: preset.primaryColor,
                                    }
                                  : {
                                      backgroundColor: '#f1f5f9',
                                      borderColor: '#e2e8f0',
                                      color: '#94a3b8',
                                    }
                              }
                            >
                              <Bus className="w-5 h-5" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  style={{
                                    backgroundColor: preset.lightBg,
                                    color: preset.textColor,
                                    borderColor: preset.lightBorder,
                                  }}
                                  className="font-mono font-bold text-xs px-2 py-0.5 rounded-md border"
                                >
                                  {bus.busNumber}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.2 rounded font-mono border"
                                    style={
                                      bus.active
                                        ? {
                                            backgroundColor: preset.lightBg,
                                            color: preset.textColor,
                                            borderColor: preset.lightBorder,
                                          }
                                        : {
                                            backgroundColor: '#f1f5f9',
                                            color: '#64748b',
                                            borderColor: '#e2e8f0',
                                          }
                                    }
                                  >
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
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                title="Edit Bus"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {hasPermission('transport.delete') && (
                                <button
                                  onClick={() => setBusToDelete(bus)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                  title="Delete Bus"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 text-xs space-y-1">
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
                                  {hasPermission('transport.delete') && (
                                    <button
                                      onClick={() => setBusToDelete(bus)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                      title="Delete Bus"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
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
                      style={
                        isDragged
                          ? {
                              borderColor: preset.primaryColor,
                              backgroundColor: `${preset.lightBg}60`,
                            }
                          : isDragOver
                          ? {
                              borderColor: preset.primaryColor,
                              boxShadow: `0 10px 25px -5px ${preset.primaryColor}25`,
                              backgroundColor: `${preset.lightBg}40`,
                            }
                          : {
                              background: `linear-gradient(160deg, ${preset.lightBg}50 0%, #ffffff 40%, #ffffff 100%)`,
                              borderColor: '#e2e8f0',
                            }
                      }
                      className={`group relative rounded-2xl border transition-all duration-200 select-none overflow-hidden ${
                        isDragged
                          ? 'opacity-40 scale-[0.98] border-dashed ring-2 shadow-md'
                          : isDragOver
                          ? 'ring-2 transform -translate-y-1 shadow-lg'
                          : 'shadow-xs hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300'
                      }`}
                    >
                      {/* Theme-Matched Top Accent Bar */}
                      <div
                        className="h-1.5 w-full"
                        style={{
                          background: `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`,
                        }}
                      />

                      <div className="p-4 pt-3 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            {hasPermission('transport.manage') && (
                              <div
                                title="Drag card to reorder position"
                                className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition mt-0.5 shrink-0"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                <h4 className="font-bold text-slate-900 text-sm truncate">{stop.name}</h4>
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.2 rounded font-mono border"
                                  style={{
                                    backgroundColor: preset.lightBg,
                                    color: preset.textColor,
                                    borderColor: preset.lightBorder,
                                  }}
                                >
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
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded cursor-pointer transition"
                                title="Edit Bus Stop"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {hasPermission('transport.delete') && (
                                <button
                                  onClick={() => setStopToDelete(stop)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer transition"
                                  title="Delete Bus Stop"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {[stop.area, stop.landmark].filter(Boolean).join(' • ') || '—'}
                        </p>
                        <p
                          className="font-bold text-sm pt-2 border-t border-slate-100"
                          style={{ color: preset.textColor }}
                        >
                          {formatCurrency(stop.monthlyFare)} / mo
                        </p>
                      </div>
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
                                  {hasPermission('transport.delete') && (
                                    <button
                                      onClick={() => setStopToDelete(stop)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                                      title="Delete Bus Stop"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
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
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {/* Compact Integrated Active Days Control with Presets and Apply Button */}
                <div
                  id="transport-global-active-days-control"
                  className="flex flex-wrap sm:inline-flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1.5 sm:p-1 text-xs shadow-2xs gap-1.5 w-full sm:w-auto max-w-full justify-between sm:justify-start"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap xs:flex-nowrap">
                    <div className="flex items-center gap-1 pl-1 text-slate-700 font-bold text-xs shrink-0">
                      <CalendarDays className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="text-[11px] whitespace-nowrap">Days:</span>
                    </div>

                    <input
                      type="number"
                      min="0"
                      max={totalDaysInMonth}
                      value={globalMonthDays}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => handleGlobalDaysChange(Number(e.target.value))}
                      className="w-10 text-center font-bold text-slate-900 text-xs py-1 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-2xs shrink-0"
                      title={`Active days in ${activeMonth} (0 to ${totalDaysInMonth})`}
                    />

                    <span className="text-[11px] font-semibold text-slate-400 shrink-0">/{totalDaysInMonth}d</span>

                    <select
                      value={globalMonthDays}
                      onChange={(e) => handleGlobalDaysChange(Number(e.target.value))}
                      className="bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[11px] py-1 px-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer shadow-2xs max-w-[110px] sm:max-w-none truncate shrink-0"
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
                  </div>

                  {/* Apply to All Button */}
                  {activeMonthAssignments.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplyGlobalDaysToAll}
                      className="inline-flex items-center justify-center gap-1 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] shadow-2xs transition-colors cursor-pointer whitespace-nowrap w-full xs:w-auto shrink-0"
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
                  className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap flex-1 xs:flex-initial"
                  title={`Copy transport assignments from previous month with ${globalMonthDays} active days`}
                >
                  <Copy className="w-3.5 h-3.5 text-teal-600" />
                  <span>Copy Previous Month</span>
                </button>

                {/* Import CSV Button */}
                <button
                  type="button"
                  onClick={handleOpenBulkCsvModal}
                  className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-teal-700 border border-teal-200 hover:border-teal-300 font-bold px-3 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap flex-1 xs:flex-initial"
                  title="Upload student transport assignments via CSV"
                >
                  <Upload className="w-3.5 h-3.5 text-teal-600" />
                  <span>Import CSV</span>
                </button>

                <button
                  onClick={handleOpenAddAssignment}
                  className="flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-colors whitespace-nowrap w-full xs:w-auto"
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
                {hasPermission('transport.delete') && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteSelectedAsgns}
                    className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded-lg shadow-2xs transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Selected ({selectedAsgnIds.length})</span>
                  </button>
                )}
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
                    const calculatedFee = calculateTransportFee(a, stop, transportRoundingMultiple);
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
                              Base: {stop ? formatCurrency(stop.monthlyFare) : formatCurrency(0)}
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
                              {hasPermission('transport.delete') && (
                                <button
                                  onClick={() => setAsgnToDelete(a)}
                                  className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                                >
                                  Remove
                                </button>
                              )}
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
      <BusModal
        show={showBusModal}
        onClose={() => setShowBusModal(false)}
        editingBus={editingBus}
        busData={busData}
        setBusData={setBusData}
        formError={formError}
        onSubmit={handleSaveBus}
      />

      {/* Stop Modal */}
      <StopModal
        show={showStopModal}
        onClose={() => setShowStopModal(false)}
        editingStop={editingStop}
        stopData={stopData}
        setStopData={setStopData}
        formError={formError}
        onSubmit={handleSaveStop}
      />

      {/* Assignment Modal */}
      <AssignmentModal
        show={showAsgnModal}
        onClose={() => setShowAsgnModal(false)}
        editingAsgn={editingAsgn}
        activeMonth={activeMonth}
        students={students}
        classes={classes}
        transportAssignments={transportAssignments}
        buses={buses}
        stops={stops}
        asgnData={asgnData}
        setAsgnData={setAsgnData}
        studentSearchQuery={studentSearchQuery}
        setStudentSearchQuery={setStudentSearchQuery}
        isStudentComboOpen={isStudentComboOpen}
        setIsStudentComboOpen={setIsStudentComboOpen}
        studentComboRef={studentComboRef}
        onSelectStudent={handleSelectStudentForAssignment}
        onSubmit={handleSaveAssignment}
      />

            {/* Bulk Transport Assignments CSV Import Modal */}
      <BulkTransportCsvModal
        show={showBulkCsvModal}
        onClose={() => { setShowBulkCsvModal(false); handleClearBulkCsv(); }}
        onClear={handleClearBulkCsv}
        activeMonth={activeMonth}
        rows={bulkPreviewRows}
        previewFilter={previewFilter}
        setPreviewFilter={setPreviewFilter}
        importStatus={bulkImportStatus}
        isDragging={isBulkDragging}
        setIsDragging={setIsBulkDragging}
        fileInputRef={bulkFileInputRef}
        onDownloadSample={handleDownloadSampleTransportCsv}
        onFileInputChange={handleBulkCsvFileInputChange}
        onDrop={handleBulkCsvDrop}
        onToggleSelectAllValid={handleToggleSelectAllValid}
        onToggleSelectRow={handleToggleSelectRow}
        onCommit={handleCommitBulkImport}
      />

            {/* Bulk Bus Stops CSV Import Modal */}
      <BulkStopsCsvModal
        show={showBulkStopsModal}
        onClose={() => { setShowBulkStopsModal(false); handleClearBulkStopsCsv(); }}
        onClear={handleClearBulkStopsCsv}
        rows={bulkStopsPreviewRows}
        previewFilter={stopsPreviewFilter}
        setPreviewFilter={setStopsPreviewFilter}
        importStatus={bulkStopsImportStatus}
        isDragging={isBulkStopsDragging}
        setIsDragging={setIsBulkStopsDragging}
        fileInputRef={bulkStopsFileInputRef}
        onDownloadSample={handleDownloadSampleStopsCsv}
        onFileInputChange={handleBulkStopsCsvFileInputChange}
        onDrop={handleBulkStopsCsvDrop}
        onToggleSelectAllValid={handleToggleSelectAllValidStops}
        onToggleSelectRow={handleToggleSelectStopRow}
        onCommit={handleCommitBulkStopsImport}
      />

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
