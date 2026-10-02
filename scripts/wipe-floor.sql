-- Floor full wipe for sara_textiles (run on VPS / Plesk phpPgAdmin or psql).
-- Does NOT touch users, roles, payroll, accounts.

BEGIN;
DELETE FROM floor_daily_sheets;
DELETE FROM floor_yarn_movements;
DELETE FROM floor_yarn_issuances;
DELETE FROM floor_qualities;
DELETE FROM floor_yarns;
DELETE FROM floor_beams;
DELETE FROM floor_looms;
COMMIT;

-- Verify (all should be 0):
-- SELECT 'sheets' AS t, COUNT(*) FROM floor_daily_sheets
-- UNION ALL SELECT 'qualities', COUNT(*) FROM floor_qualities
-- UNION ALL SELECT 'movements', COUNT(*) FROM floor_yarn_movements
-- UNION ALL SELECT 'issuances', COUNT(*) FROM floor_yarn_issuances
-- UNION ALL SELECT 'yarns', COUNT(*) FROM floor_yarns
-- UNION ALL SELECT 'beams', COUNT(*) FROM floor_beams
-- UNION ALL SELECT 'looms', COUNT(*) FROM floor_looms;
