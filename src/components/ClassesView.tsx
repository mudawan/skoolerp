import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { SchoolClass } from '../types';
import { formatCurrency } from '../utils/feeMath';
import { ConfirmModal } from './ConfirmModal';
import {
  AlertCircle,
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  Edit2,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  Power,
  Search,
  Trash2,
  Users,
  X,
  GraduationCap,
} from 'lucide-react';
import { THEME_COLOR_PRESETS } from '../utils/themeConfig';

export const ClassesView: React.FC = () => {
  const {
    classes,
    students,
    addClass,
    updateClass,
    deleteClass,
    toggleClassActive,
    reorderClasses,
    hasPermission,
    showToast,
    themeConfig,
  } = useApp();

  const preset = THEME_COLOR_PRESETS[themeConfig?.color || 'teal'] || THEME_COLOR_PRESETS.teal;

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [classToDelete, setClassToDelete] = useState<SchoolClass | null>(null);

  // Drag and drop sort state
  const [draggedClassId, setDraggedClassId] = useState<string | null>(null);
  const [dragOverClassId, setDragOverClassId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    monthlyFee: 0,
    sortOrder: classes.length + 1,
  });

  const [formError, setFormError] = useState('');

  useEscapeKey(() => {
    setShowAddModal(false);
    setEditingClass(null);
  }, showAddModal || !!editingClass);

  const filteredClasses = classes.filter((cls) =>
    cls.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleDragStart = (e: React.DragEvent, cls: SchoolClass) => {
    if (!hasPermission('classes.manage')) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cls.id);
    setDraggedClassId(cls.id);
  };

  const handleDragOver = (e: React.DragEvent, targetCls: SchoolClass) => {
    if (!hasPermission('classes.manage') || !draggedClassId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverClassId !== targetCls.id) {
      setDragOverClassId(targetCls.id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetCls: SchoolClass) => {
    if (!hasPermission('classes.manage')) return;
    e.preventDefault();
    const sourceId = draggedClassId || e.dataTransfer.getData('text/plain');

    if (!sourceId || sourceId === targetCls.id) {
      setDraggedClassId(null);
      setDragOverClassId(null);
      return;
    }

    const currentClasses = [...classes];
    const fromIndex = currentClasses.findIndex((c) => c.id === sourceId);
    const toIndex = currentClasses.findIndex((c) => c.id === targetCls.id);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedClass] = currentClasses.splice(fromIndex, 1);
      currentClasses.splice(toIndex, 0, movedClass);
      reorderClasses(currentClasses);
    }

    setDraggedClassId(null);
    setDragOverClassId(null);
  };

  const handleDragEnd = () => {
    setDraggedClassId(null);
    setDragOverClassId(null);
  };

  const handleOpenAdd = () => {
    setFormData({ name: '', monthlyFee: 0, sortOrder: classes.length + 1 });
    setFormError('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (cls: SchoolClass) => {
    setEditingClass(cls);
    setFormData({
      name: cls.name,
      monthlyFee: cls.monthlyFee,
      sortOrder: cls.sortOrder,
    });
    setFormError('');
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Class name is required.');
      return;
    }

    if (editingClass) {
      const res = updateClass(editingClass.id, {
        name: formData.name.trim(),
        monthlyFee: Number(formData.monthlyFee) || 0,
        sortOrder: Number(formData.sortOrder) || 1,
      });
      if (res.success) setEditingClass(null);
      else setFormError(res.error || 'Failed to update class');
    } else {
      const res = addClass(
        formData.name.trim(),
        Number(formData.monthlyFee) || 0,
        Number(formData.sortOrder) || 1
      );
      if (res.success) setShowAddModal(false);
      else setFormError(res.error || 'Failed to add class');
    }
  };

  const handleDelete = (cls: SchoolClass) => {
    setClassToDelete(cls);
  };

  const handleConfirmDelete = () => {
    if (!classToDelete) return;
    const res = deleteClass(classToDelete.id);
    if (!res.success) {
      showToast(res.error || 'Failed to delete class.', 'error');
    } else {
      showToast(`Class "${classToDelete.name}" deleted successfully.`, 'success');
    }
    setClassToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6" style={{ color: preset.primaryColor }} />
            Class Setup & Fee Grades
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure institute academic classes, standard monthly tuition fees, and active statuses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('grid')}
              style={viewMode === 'grid' ? { color: preset.textColor } : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={viewMode === 'table' ? { color: preset.textColor } : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
              <span>List</span>
            </button>
          </div>

          {hasPermission('classes.manage') && (
            <button
              onClick={handleOpenAdd}
              style={{ backgroundColor: preset.primaryColor }}
              className="flex items-center gap-2 hover:opacity-95 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Academic Class
            </button>
          )}
        </div>
      </div>

      {/* Filter / Quick Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search classes by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-400/20"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {hasPermission('classes.manage') && (
            <span
              style={{
                color: preset.textColor,
                backgroundColor: preset.lightBg,
                borderColor: preset.lightBorder,
              }}
              className="inline-flex items-center gap-1.5 text-[11px] border px-2.5 py-1 rounded-lg font-medium"
            >
              <GripVertical className="w-3.5 h-3.5" style={{ color: preset.primaryColor }} />
              <span>Drag to reorder sort positions</span>
            </span>
          )}
          <div className="text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{filteredClasses.length}</span> of{' '}
            <span className="font-bold text-slate-800">{classes.length}</span> classes
          </div>
        </div>
      </div>

      {/* Cards Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClasses.map((cls) => {
            const enrolledCount = students.filter(
              (s) => s.classId === cls.id && s.status === 'Active'
            ).length;

            const isDragged = draggedClassId === cls.id;
            const isDragOver = dragOverClassId === cls.id && !isDragged;

            return (
              <div
                key={cls.id}
                draggable={hasPermission('classes.manage')}
                onDragStart={(e) => handleDragStart(e, cls)}
                onDragOver={(e) => handleDragOver(e, cls)}
                onDrop={(e) => handleDrop(e, cls)}
                onDragEnd={handleDragEnd}
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
                    : cls.active
                    ? {
                        background: `linear-gradient(160deg, ${preset.lightBg}70 0%, #ffffff 35%, #ffffff 100%)`,
                        borderColor: '#e2e8f0',
                      }
                    : undefined
                }
                className={`group relative rounded-2xl border transition-all duration-200 select-none overflow-hidden ${
                  isDragged
                    ? 'opacity-40 scale-[0.98] border-dashed ring-2 shadow-md'
                    : isDragOver
                    ? 'ring-2 transform -translate-y-1 shadow-lg'
                    : cls.active
                    ? 'shadow-xs hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300'
                    : 'bg-slate-50/90 border-slate-200 opacity-75'
                }`}
              >
                {/* Subtle Theme-Matched Prominence Accent Bar */}
                <div
                  className="h-1.5 w-full transition-all duration-300"
                  style={{
                    background: cls.active
                      ? `linear-gradient(90deg, ${preset.primaryColor} 0%, ${preset.hoverColor} 100%)`
                      : '#cbd5e1',
                  }}
                />

                <div className="p-5 pt-3.5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {hasPermission('classes.manage') && (
                        <div
                          title="Drag card to reorder position"
                          className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition mt-1 shrink-0"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                      )}

                      {/* Prominence Theme Icon Badge */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105 shadow-2xs"
                        style={
                          cls.active
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
                        <GraduationCap className="w-5 h-5" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-base truncate">{cls.name}</h3>
                          {!cls.active && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md font-mono border"
                            style={
                              cls.active
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
                            #{cls.sortOrder}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">Sort Position</span>
                        </div>
                      </div>
                    </div>

                    {hasPermission('classes.manage') && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleClassActive(cls.id)}
                          title={cls.active ? 'Deactivate Class' : 'Reactivate Class'}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            cls.active
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(cls)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Edit Class"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cls)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Delete Class"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Standard Monthly Fee:</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {formatCurrency(cls.monthlyFee)} / mo
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block font-medium">Enrolled Students:</span>
                      <span
                        className="font-bold text-xs flex items-center justify-end gap-1"
                        style={{ color: cls.active ? preset.textColor : '#64748b' }}
                      >
                        <Users
                          className="w-3.5 h-3.5"
                          style={{ color: cls.active ? preset.primaryColor : '#94a3b8' }}
                        />
                        {enrolledCount} Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Columns List Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5 text-center w-28 whitespace-nowrap">Sort Position</th>
                  <th className="p-3.5">Class Name</th>
                  <th className="p-3.5 text-right">Standard Monthly Fee</th>
                  <th className="p-3.5 text-center">Enrolled Students</th>
                  <th className="p-3.5 text-center">Status</th>
                  {hasPermission('classes.manage') && (
                    <th className="p-3.5 text-right w-32">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClasses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={hasPermission('classes.manage') ? 6 : 5}
                      className="p-8 text-center text-slate-400"
                    >
                      No academic classes match your search query.
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((cls) => {
                    const enrolledCount = students.filter(
                      (s) => s.classId === cls.id && s.status === 'Active'
                    ).length;

                    const isDragged = draggedClassId === cls.id;
                    const isDragOver = dragOverClassId === cls.id && !isDragged;

                    return (
                      <tr
                        key={cls.id}
                        draggable={hasPermission('classes.manage')}
                        onDragStart={(e) => handleDragStart(e, cls)}
                        onDragOver={(e) => handleDragOver(e, cls)}
                        onDrop={(e) => handleDrop(e, cls)}
                        onDragEnd={handleDragEnd}
                        className={`transition select-none ${
                          isDragged
                            ? 'opacity-40 bg-teal-50/60 border-y-2 border-teal-500'
                            : isDragOver
                            ? 'bg-teal-50/80 border-t-2 border-teal-600 shadow-xs'
                            : !cls.active
                            ? 'bg-slate-50/50 opacity-75 hover:bg-slate-100/80'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {hasPermission('classes.manage') && (
                              <span
                                title="Drag row to reorder position"
                                className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                            )}
                            <span className="font-mono font-bold text-[11px] text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.5 rounded">
                              #{cls.sortOrder}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-900 text-sm">{cls.name}</div>
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900 text-sm">
                          {formatCurrency(cls.monthlyFee)}
                          <span className="text-[10px] font-normal text-slate-400 ml-1">/ mo</span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                            <Users className="w-3.5 h-3.5" />
                            {enrolledCount} Active
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {cls.active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Inactive
                            </span>
                          )}
                        </td>
                        {hasPermission('classes.manage') && (
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => toggleClassActive(cls.id)}
                                title={cls.active ? 'Deactivate Class' : 'Reactivate Class'}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  cls.active
                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                    : 'text-slate-400 hover:bg-slate-200'
                                }`}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(cls)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                title="Edit Class"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(cls)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                title="Delete Class"
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

      {/* Modal */}
      {(showAddModal || editingClass) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingClass ? 'Edit Class Setup' : 'Add New Academic Class'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingClass(null);
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

            <form onSubmit={handleSaveClass} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Class Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Class 1, Playgroup"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Standard Monthly Fee (Rs.) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.monthlyFee}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setFormData({ ...formData, monthlyFee: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sort Order Position</label>
                <input
                  type="number"
                  min="1"
                  value={formData.sortOrder}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingClass(null);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl cursor-pointer"
                >
                  Save Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Modal */}
      {(() => {
        const enrolledStudents = classToDelete
          ? students.filter((s) => s.classId === classToDelete.id)
          : [];
        const hasStudents = enrolledStudents.length > 0;

        return (
          <ConfirmModal
            isOpen={!!classToDelete}
            title={hasStudents ? 'Cannot Delete Class' : 'Delete Class'}
            message={
              classToDelete ? (
                <div className="space-y-2">
                  <p>
                    Are you sure you want to remove <strong className="text-slate-900">{classToDelete.name}</strong>?
                  </p>
                  {hasStudents && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                      <strong>{enrolledStudents.length} student(s)</strong> are currently assigned to this class. You must reassign or remove these students before deleting this class.
                    </div>
                  )}
                </div>
              ) : (
                ''
              )
            }
            confirmLabel={hasStudents ? 'Understood' : 'Delete Class'}
            confirmDisabled={hasStudents}
            variant={hasStudents ? 'warning' : 'danger'}
            onConfirm={hasStudents ? () => setClassToDelete(null) : handleConfirmDelete}
            onClose={() => setClassToDelete(null)}
          />
        );
      })()}
    </div>
  );
};
