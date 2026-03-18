-- ============================================================
-- SETUP FINAL (V5): Grant access to anonymuos for PostgREST
-- ============================================================

-- PostgREST needs to be able to see the schema before it can even authenticate
-- In some self-hosted setups, the search_path is restricted.

-- 1. Ensure the 'anon' role can see all necessary schemas
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA extensions TO anon;

-- 2. Make sure PostgREST can actually read the auth tables as 'anon'
-- (This is needed for the initial handshake and schema cache)
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 3. Crucial: Ensure the authenticator has bypassrls or proper inheritance
-- (Trying a more standard approach first)
ALTER ROLE authenticator SET search_path TO public, auth, extensions;
ALTER ROLE anon SET search_path TO public, auth, extensions;
ALTER ROLE authenticated SET search_path TO public, auth, extensions;

-- 4. Reload PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
