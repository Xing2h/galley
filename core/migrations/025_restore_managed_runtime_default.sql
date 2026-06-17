-- 025_restore_managed_runtime_default.sql
--
-- Compatibility repair after the abandoned Galley Native experiment. Versions
-- 021-024 are kept byte-for-byte so dogfood databases that already applied them
-- pass SQLx checksum validation. Main does not ship the Rust native runtime, so
-- any persisted galley_native values are restored to the managed GA runtime.

UPDATE prefs
SET value = '"managed"',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'active_runtime_kind'
  AND value = '"galley_native"';

UPDATE sessions
SET ga_runtime_kind = 'managed',
    prompt_profile = COALESCE(prompt_profile, 'galley-runtime-v1'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE ga_runtime_kind = 'galley_native';

UPDATE goal_proposals
SET runtime_kind = 'managed',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE runtime_kind = 'galley_native';

UPDATE goals
SET runtime_kind = 'managed',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE runtime_kind = 'galley_native';
