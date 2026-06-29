-- Backfill context_win for managed model rows that were saved after the
-- original 027 migration but before custom-compatible provider defaults were
-- normalized on save.
--
-- Only valid JSON objects are touched. Existing context_win values, including
-- explicit null, are left intact; malformed/non-object rows are skipped.
UPDATE managed_models
SET advanced_options = json_insert(advanced_options, '$.context_win', 90000)
WHERE CASE
  WHEN json_valid(advanced_options) THEN
    CASE
      WHEN json_type(advanced_options) = 'object'
        AND json_type(advanced_options, '$.context_win') IS NULL
      THEN 1
      ELSE 0
    END
  ELSE 0
END = 1;
