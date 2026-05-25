-- 011_managed_model_sort_order.sql · managed GA model display order
--
-- The managed model list has user-owned order: it drives Galley's model
-- picker order, and the first model is the default model.

ALTER TABLE managed_models
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY is_default DESC, updated_at DESC) - 1 AS next_order
  FROM managed_models
)
UPDATE managed_models
SET sort_order = (
  SELECT next_order FROM ordered WHERE ordered.id = managed_models.id
);

CREATE INDEX managed_models_by_sort_order
  ON managed_models(sort_order ASC);
