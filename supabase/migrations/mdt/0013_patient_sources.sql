-- Add originator roles requested in the 2026-05-23 stakeholder review.
-- The MDT can be initiated by more than GP / District Nurse / Social Worker:
-- social prescribers, consultants, palliative-care nurses and care
-- (key) coordinators all bring patients to the board.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- Postgres; run each statement on its own. IF NOT EXISTS makes this re-runnable.
alter type mdt_patient_source add value if not exists 'SP';
alter type mdt_patient_source add value if not exists 'CONS';
alter type mdt_patient_source add value if not exists 'PALL';
alter type mdt_patient_source add value if not exists 'CC';
