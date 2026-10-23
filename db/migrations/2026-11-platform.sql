-- One-time upgrade for the platform (app-owner) support actions: forced password change at next sign-in,
-- platform-locked accounts, and school suspension details. New installs get all of this from the schema in
-- server/db.ts and never need this file. Safe to run more than once.
--
-- Run in DBeaver as a script (Alt+X) during the announced offline window, then recompile and redeploy.
-- Step 1 only reads; look at it first. Step 2 changes the schema in one transaction: if anything fails,
-- nothing is applied. It adds columns only; no existing row is changed or removed.

-- =============================== STEP 1: PREVIEW ===============================
-- Which of the new columns already exist (an empty result means all six are still to be added):
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND ((table_name = 'users' AND column_name IN ('must_change_password', 'temp_password_expires_at', 'platform_locked'))
    OR (table_name = 'institutions' AND column_name IN ('suspended_at', 'suspended_by', 'suspend_reason')))
ORDER BY table_name, column_name;

-- Rows that will be given the defaults (nothing is forced to change a password, nobody is locked, no school is marked suspended):
SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM institutions) AS schools,
       (SELECT COUNT(*) FROM institutions WHERE status = 'suspended') AS schools_already_marked_suspended;
-- NOTE: a school already marked status = 'suspended' will start being refused at sign-in once the new
-- server runs. Reactivate it first if that is not what you want.

-- =============================== STEP 2: APPLY ================================
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_locked          BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS suspended_at   TIMESTAMPTZ;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS suspended_by   VARCHAR(128);
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS suspend_reason TEXT;

COMMIT;

-- =============================== STEP 3: CHECK ================================
-- Should return 6 rows.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND ((table_name = 'users' AND column_name IN ('must_change_password', 'temp_password_expires_at', 'platform_locked'))
    OR (table_name = 'institutions' AND column_name IN ('suspended_at', 'suspended_by', 'suspend_reason')))
ORDER BY table_name, column_name;
