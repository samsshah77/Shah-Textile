-- Floor wipe — KEEP floor_looms (only clear quality/weft assign).
-- Users / payroll / accounts untouched.

BEGIN;
DELETE FROM floor_daily_sheets;
DELETE FROM floor_yarn_movements;
DELETE FROM floor_yarn_issuances;
DELETE FROM floor_qualities;
DELETE FROM floor_yarns;
DELETE FROM floor_beams;
UPDATE floor_looms SET "qualityId" = NULL, "weftYarnId" = NULL;
COMMIT;
