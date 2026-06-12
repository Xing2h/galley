use super::*;

impl SqliteGalley {
    pub async fn set_pref_json(&self, key: &str, value: serde_json::Value) -> Result<()> {
        let key = key.trim();
        if key.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "set_pref_json: key must not be empty".into(),
            });
        }
        let now = chrono_now_iso();
        sqlx::query(
            "INSERT INTO prefs (key, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at",
        )
        .bind(key)
        .bind(value.to_string())
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(())
    }
}

impl SqliteGalley {
    pub(super) async fn get_pref_json_db(&self, key: &str) -> Result<Option<serde_json::Value>> {
        // The `prefs` table is `(key TEXT PRIMARY KEY, value TEXT NOT NULL)`
        // where `value` is a JSON-encoded string (GUI's setPref does
        // `JSON.stringify`). We return the parsed Value so callers
        // don't have to think about double-encoding.
        let row: Option<(String,)> = sqlx::query_as("SELECT value FROM prefs WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        let Some((raw,)) = row else {
            return Ok(None);
        };
        let value = serde_json::from_str::<serde_json::Value>(&raw).map_err(|e| {
            GalleyError::InvalidArgs {
                message: format!("pref '{key}' stored value is not valid JSON: {e}"),
            }
        })?;
        Ok(Some(value))
    }
}
