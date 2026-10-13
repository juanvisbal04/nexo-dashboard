-- NEXO Shield 360 · Defense-in-depth least-privilege migration
-- Applied to NEXO Platform as Supabase migration 20261013181442.
-- Removes privileges that standard dashboards do not need.
-- RLS, SELECT, INSERT, UPDATE and DELETE are unchanged.
-- Rollback (only if required for verified functionality): GRANT the specific
-- removed privilege only on the required table to the appropriate role.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %I.%I FROM anon, authenticated',
      t.schema_name, t.table_name
    );
  END LOOP;
END $$;
