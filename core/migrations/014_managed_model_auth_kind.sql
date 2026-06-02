-- 014_managed_model_auth_kind.sql · managed provider auth kind
--
-- API-key providers remain the default. ChatGPT / Codex providers store an
-- OAuth token JSON payload in the same encrypted local secret table.

ALTER TABLE managed_model_providers
  ADD COLUMN auth_kind TEXT NOT NULL DEFAULT 'api_key'
  CHECK (auth_kind IN ('api_key', 'chatgpt_codex_oauth'));
