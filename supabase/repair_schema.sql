-- ============================================================
-- REPAIR SCRIPT: Fix "Database error querying schema" in Supabase
-- Target: Supabase SQL Editor (Easypanel / Self-hosted)
-- ============================================================

-- 1. Force reload the API cache (PostgREST)
NOTIFY pgrst, 'reload schema';

-- 2. Ensure basic schema usage permissions for all roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- 3. Grant table and view access to users
-- Note: 'ALL TABLES' in PostgreSQL includes both tables and views.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 4. Final sync notification
NOTIFY pgrst, 'reload schema';
