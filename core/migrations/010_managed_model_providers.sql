-- 010_managed_model_providers.sql · managed GA provider/model split
--
-- API Key + Base URL belong to a Provider. Models reference a Provider so
-- users can enable many models from one provider connection without retyping
-- credentials.

DROP INDEX IF EXISTS managed_models_by_updated_at;
DROP INDEX IF EXISTS managed_models_one_default;

CREATE TABLE managed_model_providers (
  id                 TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL,
  protocol           TEXT NOT NULL CHECK (protocol IN ('anthropic', 'openai')),
  api_base           TEXT NOT NULL,
  api_key_ref        TEXT NOT NULL UNIQUE,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

INSERT INTO managed_model_providers (
  id, display_name, protocol, api_base, api_key_ref, created_at, updated_at
)
SELECT
  'mp_' || id,
  display_name,
  protocol,
  api_base,
  api_key_ref,
  created_at,
  updated_at
FROM managed_models;

ALTER TABLE managed_models RENAME TO managed_models_legacy_009;

CREATE TABLE managed_models (
  id                 TEXT PRIMARY KEY,
  provider_id        TEXT NOT NULL REFERENCES managed_model_providers(id) ON DELETE CASCADE,
  display_name       TEXT NOT NULL,
  model              TEXT NOT NULL,
  advanced_options   TEXT NOT NULL DEFAULT '{}',
  is_default         INTEGER NOT NULL DEFAULT 0,
  last_validated_at  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

INSERT INTO managed_models (
  id, provider_id, display_name, model, advanced_options, is_default,
  last_validated_at, created_at, updated_at
)
SELECT
  id,
  'mp_' || id,
  display_name,
  model,
  advanced_options,
  is_default,
  last_validated_at,
  created_at,
  updated_at
FROM managed_models_legacy_009;

DROP TABLE managed_models_legacy_009;

CREATE INDEX managed_model_providers_by_updated_at
  ON managed_model_providers(updated_at DESC);

CREATE INDEX managed_models_by_provider
  ON managed_models(provider_id);

CREATE INDEX managed_models_by_updated_at
  ON managed_models(updated_at DESC);

CREATE UNIQUE INDEX managed_models_one_default
  ON managed_models(is_default)
  WHERE is_default = 1;
