-- One-time upgrade for a database created before row versions, foreign keys and
-- vouchers.fine_since_payment existed. New installs get all of this from the schema in
-- server/db.ts and never need this file. Safe to run more than once.
--
-- Run in DBeaver as a script (Alt+X). Step 1 only reads; look at it first. Step 2 changes
-- data and runs in one transaction: if anything fails, nothing is applied.

-- =============================== STEP 1: PREVIEW ===============================
-- Rows that step 2 will DELETE (an assignment or template that means nothing without its parent):
SELECT 'assignment without a real student, bus or stop' AS what, a.id, a.institution_id, a.student_id, a.month, a.bus_id, a.stop_id
FROM transport_assignments a
WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = a.student_id)
   OR COALESCE(a.bus_id, '') = '' OR NOT EXISTS (SELECT 1 FROM buses b WHERE b.id = a.bus_id)
   OR COALESCE(a.stop_id, '') = '' OR NOT EXISTS (SELECT 1 FROM stops p WHERE p.id = a.stop_id);

SELECT 'fee template for a missing student or class' AS what, t.id, t.institution_id, t.student_id, t.class_id
FROM fee_templates t
WHERE (COALESCE(t.student_id, '') <> '' AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = t.student_id))
   OR (COALESCE(t.class_id, '') <> '' AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = t.class_id));

-- Rows step 2 will only UPDATE (family link cleared):
SELECT 'student pointing at a missing family' AS what, s.id, s.institution_id, s.name, s.family_id
FROM students s
WHERE COALESCE(s.family_id, '') <> '' AND NOT EXISTS (SELECT 1 FROM families f WHERE f.id = s.family_id);

-- Rows step 2 will NOT touch but that will make it fail; fix these by hand first (should return no rows):
SELECT 'student with a missing class' AS what, s.id, s.name, s.class_id
FROM students s WHERE COALESCE(s.class_id, '') <> '' AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = s.class_id);
SELECT 'voucher with a missing student' AS what, v.id, v.voucher_no, v.student_id
FROM vouchers v WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = v.student_id);
SELECT 'duplicate family number' AS what, institution_id, family_no, COUNT(*)
FROM families WHERE COALESCE(family_no, '') <> '' GROUP BY institution_id, family_no HAVING COUNT(*) > 1;

-- =============================== STEP 2: APPLY ================================
BEGIN;

-- Row versions (the app checks them to stop one operator overwriting another's change).
ALTER TABLE classes               ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE families              ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE students              ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE buses                 ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stops                 ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transport_assignments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fee_templates         ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bank_accounts         ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Derived "fine since last payment" on vouchers, filled once for every student.
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS fine_since_payment NUMERIC NOT NULL DEFAULT 0;
WITH base AS (
  SELECT v.id, v.student_id, v.month,
         CASE WHEN v.amount_paid > 0 THEN 0
              ELSE COALESCE((SELECT SUM(p.amount) FROM voucher_particulars p WHERE p.voucher_id = v.id AND p.kind = 'Fine'), 0)
         END AS fine,
         v.amount_paid > 0 AS paid
  FROM vouchers v
  WHERE v.status <> 'Reversed'
), grouped AS (
  SELECT *, COUNT(*) FILTER (WHERE paid) OVER (PARTITION BY student_id ORDER BY month, id) AS grp FROM base
), calc AS (
  SELECT id, CASE WHEN paid THEN 0 ELSE SUM(fine) OVER (PARTITION BY student_id, grp ORDER BY month, id) END AS val
  FROM grouped
)
UPDATE vouchers v SET fine_since_payment = c.val
FROM calc c WHERE v.id = c.id AND v.fine_since_payment IS DISTINCT FROM c.val;

-- "No reference" must be NULL, not an empty string.
UPDATE students SET class_id = NULL WHERE class_id = '';
UPDATE students SET family_id = NULL WHERE family_id = '';
UPDATE transport_assignments SET bus_id = NULL WHERE bus_id = '';
UPDATE transport_assignments SET stop_id = NULL WHERE stop_id = '';
UPDATE fee_templates SET class_id = NULL WHERE class_id = '';
UPDATE fee_templates SET student_id = NULL WHERE student_id = '';

-- Orphans (see step 1).
DELETE FROM transport_assignments a
WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = a.student_id)
   OR a.bus_id IS NULL OR NOT EXISTS (SELECT 1 FROM buses b WHERE b.id = a.bus_id)
   OR a.stop_id IS NULL OR NOT EXISTS (SELECT 1 FROM stops p WHERE p.id = a.stop_id);
DELETE FROM fee_templates t
WHERE (t.student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = t.student_id))
   OR (t.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = t.class_id));
UPDATE students s SET family_id = NULL
WHERE s.family_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM families f WHERE f.id = s.family_id);

-- Foreign keys (same names and rules as the schema in server/db.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_class') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_family') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignments_student') THEN
    ALTER TABLE transport_assignments ADD CONSTRAINT fk_assignments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignments_bus') THEN
    ALTER TABLE transport_assignments ADD CONSTRAINT fk_assignments_bus FOREIGN KEY (bus_id) REFERENCES buses(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignments_stop') THEN
    ALTER TABLE transport_assignments ADD CONSTRAINT fk_assignments_stop FOREIGN KEY (stop_id) REFERENCES stops(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_templates_student') THEN
    ALTER TABLE fee_templates ADD CONSTRAINT fk_templates_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_templates_class') THEN
    ALTER TABLE fee_templates ADD CONSTRAINT fk_templates_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vouchers_student') THEN
    ALTER TABLE vouchers ADD CONSTRAINT fk_vouchers_student FOREIGN KEY (student_id) REFERENCES students(id);
  END IF;
END $$;

-- Family numbers unique per institution (fails here, not at start-up, if duplicates remain).
CREATE UNIQUE INDEX IF NOT EXISTS uq_families_institution_family_no
  ON families(institution_id, family_no) WHERE family_no IS NOT NULL AND family_no <> '';

COMMIT;
