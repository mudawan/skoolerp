import { Family, Student } from '../types';

export function reconcileFamiliesAndStudents(
  rawFamilies: Family[],
  rawStudents: Student[]
): { families: Family[]; students: Student[] } {
  const familyIdSet = new Set(rawFamilies.map((f) => f.id));

  // Determine authoritative familyId for each student
  const studentToFamilyMap = new Map<string, string>();

  // Pass 1: explicit valid student.familyId
  rawStudents.forEach((s) => {
    if (s.familyId && familyIdSet.has(s.familyId)) {
      studentToFamilyMap.set(s.id, s.familyId);
    }
  });

  // Pass 2: unassigned students found in family memberStudentIds
  rawFamilies.forEach((f) => {
    f.memberStudentIds?.forEach((sId) => {
      if (!studentToFamilyMap.has(sId)) {
        studentToFamilyMap.set(sId, f.id);
      }
    });
  });

  // Synced students list
  const syncedStudents = rawStudents.map((s) => ({
    ...s,
    familyId: studentToFamilyMap.get(s.id) || undefined,
  }));

  // Synced families list (each family contains EXACTLY the students whose familyId === f.id)
  const syncedFamilies = rawFamilies.map((f) => {
    const memberStudentIds = syncedStudents
      .filter((s) => s.familyId === f.id)
      .map((s) => s.id);
    return {
      ...f,
      memberStudentIds,
    };
  });

  return { families: syncedFamilies, students: syncedStudents };
}
