-- Optional per-final-answer telemetry persisted with assistant rows.
-- Stored as JSON because the current product surface only restores and
-- displays it beside the answer; aggregate usage tables can be added later.
ALTER TABLE messages ADD COLUMN telemetry_json TEXT;
