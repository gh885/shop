SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE account.users ADD COLUMN IF NOT EXISTS preferred_locale TEXT;
ALTER TABLE account.staff ADD COLUMN IF NOT EXISTS preferred_locale TEXT;
