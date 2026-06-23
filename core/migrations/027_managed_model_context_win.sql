-- Backfill context_win for managed models that predate the GUI preset default.
--
-- GA trims conversation history to context_win*3 chars before each LLM call
-- (GA llmcore.py trim_messages_history). Its built-in default is only 30000,
-- so long sessions drop older turns and the model "forgets" recent context.
-- New models already get 90000 from the GUI presets; this lifts existing rows
-- to the same default.
--
-- json_insert is a no-op when the key already exists, so a value the user set
-- explicitly is never overwritten. The json_valid guard skips any malformed
-- row rather than letting a NOT NULL violation abort startup.
UPDATE managed_models
SET advanced_options = json_insert(advanced_options, '$.context_win', 90000)
WHERE json_valid(advanced_options)
  AND json_extract(advanced_options, '$.context_win') IS NULL;
